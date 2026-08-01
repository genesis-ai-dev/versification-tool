"""Persist ingest results in one transaction (all-or-nothing)."""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from frvt.api.errors import AppError, FieldError
from frvt.api.logging_config import get_logger
from frvt.api.models import (
    MappingRecord,
    RelationType,
    Translation,
    TranslationVersification,
    VerseSpan,
    VersificationScheme,
)
from frvt.api.schemas import ProjectIngestOut, TranslationOut, VersificationOut
from frvt.ingest.derive_mappings import derive_mapping_records
from frvt.ingest.ingest_api import ingest_project, ingest_versification
from frvt.ingest.metadata_parse import ProjectMetadata, resolve_text_direction
from frvt.ingest.project_zip import locate_project_members
from frvt.ingest.types import IngestIssue, ParsedScheme

logger = get_logger(__name__)


@dataclass(frozen=True)
class PersistSchemeResult:
    """Result of persisting a standalone uploaded scheme."""

    # Created scheme row id.
    scheme_id: UUID


def _require_nonblank(value: str, field: str) -> str:
    """Trim required form metadata or raise a field-level validation error."""
    normalized = value.strip()
    if normalized:
        return normalized
    raise AppError(
        422,
        "Ingest validation failed.",
        code="validation_failed",
        errors=[FieldError(field=field, message="Value must not be blank.")],
    )


def _raise_for_issues(issues: tuple[IngestIssue, ...]) -> None:
    """Map ingest issues to AppError (missing→400, otherwise→422)."""
    if not issues:
        return
    errors = [FieldError(field=i.field, message=i.message) for i in issues]
    if any(i.kind == "missing" for i in issues):
        raise AppError(
            400,
            "Required project files are missing.",
            code="bad_request",
            errors=errors,
        )
    raise AppError(
        422,
        "Ingest validation failed.",
        code="validation_failed",
        errors=errors,
    )


def _lookup_base(session: Session, based_on: str | None) -> Translation:
    """Resolve ingredient ``basedOn`` to a translation by case-insensitive name."""
    name = based_on or "org"
    logger.trace("Looking up basedOn translation name=%s", name)  # type: ignore[attr-defined]
    row = session.scalar(
        select(Translation).where(func.lower(Translation.name) == name.lower())
    )
    if row is None:
        raise AppError(
            422,
            f"basedOn translation {name!r} not found.",
            code="validation_failed",
            errors=[FieldError(field="basedOn", message=f"Unknown base {name!r}")],
        )
    return row


def _insert_mapping_rows(
    session: Session, scheme_id: UUID, parsed: ParsedScheme
) -> None:
    """Derive and insert mapping rows for a newly created scheme."""
    for dto in derive_mapping_records(parsed):
        session.add(
            MappingRecord(
                scheme_id=scheme_id,
                source_ref=dto.source_ref,
                base_ref=dto.base_ref,
                part=dto.part,
                relation=RelationType(dto.relation),
                ordinal=dto.ordinal,
            )
        )


def _infer_source_format(archive_bytes: bytes) -> str:
    """Infer ``usx`` vs ``usfm`` from zip members (both present → ``usx``)."""
    located = locate_project_members(archive_bytes)
    # locate may report missing; inference only runs after a successful ingest parse.
    has_usx = bool(located.usx_files)
    # USFM-only trees are out of scope for samples; still record usfm when no USX.
    return "usx" if has_usx else "usfm"


def persist_versification(
    session: Session,
    file_bytes: bytes,
    filename: str,
    name: str | None = None,
) -> VersificationOut:
    """Parse, validate, and persist a standalone versification upload."""
    logger.debug("Persisting versification upload filename=%s", filename)
    scheme, issues = ingest_versification(file_bytes, filename)
    _raise_for_issues(issues)
    if scheme is None:
        raise AppError(422, "Ingest validation failed.", code="validation_failed")
    if name is not None:
        normalized_name = _require_nonblank(name, "name")
        scheme = ParsedScheme(
            name=normalized_name,
            based_on=scheme.based_on,
            canonical=False,
            ingredient=scheme.ingredient,
        )
    base = _lookup_base(session, scheme.based_on)
    row = VersificationScheme(
        name=scheme.name,
        based_on_name=scheme.based_on or "org",
        based_on_id=base.id,
        canonical=False,
        ingredient=scheme.ingredient,
    )
    session.add(row)
    session.flush()
    _insert_mapping_rows(session, row.id, scheme)
    session.flush()
    return VersificationOut.model_validate(row)


def _resolve_project_name(
    metadata_name: str | None,
    form_name: str | None,
) -> str | None:
    """Return translation name from metadata (authoritative) or form fallback."""
    if metadata_name and metadata_name.strip():
        return metadata_name.strip()
    if form_name and form_name.strip():
        return form_name.strip()
    return None


def _resolve_project_language(
    metadata_language: str | None,
    form_language: str | None,
) -> str | None:
    """Return language from metadata (authoritative) or form fallback."""
    if metadata_language and metadata_language.strip():
        return metadata_language.strip()
    if form_language and form_language.strip():
        return form_language.strip()
    return None


def _require_resolved_project_fields(
    metadata: ProjectMetadata | None,
    name: str | None,
    language: str | None,
) -> tuple[str, str]:
    """Resolve name and language together so missing fields surface in one response."""
    resolved_name = _resolve_project_name(
        metadata.translation_name if metadata is not None else None,
        name,
    )
    resolved_language = _resolve_project_language(
        metadata.language_code if metadata is not None else None,
        language,
    )
    errors: list[FieldError] = []
    if resolved_name is None:
        errors.append(
            FieldError(
                field="name",
                message="Provide translation name in metadata.xml or the upload form.",
            )
        )
    if resolved_language is None:
        errors.append(
            FieldError(
                field="language",
                message="Provide language in metadata.xml or the upload form.",
            )
        )
    if errors:
        raise AppError(
            400,
            "Project metadata could not be resolved from the zip or form.",
            code="bad_request",
            errors=errors,
        )
    assert resolved_name is not None
    assert resolved_language is not None
    return resolved_name, resolved_language


def persist_project(
    session: Session,
    archive_bytes: bytes,
    name: str | None,
    language: str | None,
) -> ProjectIngestOut:
    """Parse a project zip and persist translation, spans, scheme, preferred assoc."""
    logger.debug("Persisting project ingest")
    result = ingest_project(archive_bytes)
    _raise_for_issues(result.issues)
    if result.scheme is None:
        raise AppError(422, "Ingest validation failed.", code="validation_failed")

    metadata = result.metadata
    resolved_name, resolved_language = _require_resolved_project_fields(
        metadata,
        name,
        language,
    )
    text_direction = resolve_text_direction(metadata)

    clash = session.scalar(
        select(Translation).where(func.lower(Translation.name) == resolved_name.lower())
    )
    if clash is not None:
        raise AppError(409, "Translation name already exists.", code="conflict")

    source_format = _infer_source_format(archive_bytes)
    translation = Translation(
        name=resolved_name,
        language=resolved_language,
        text_direction=text_direction,
        source_format=source_format,
        is_anchor=False,
    )
    session.add(translation)
    session.flush()

    for span in result.spans:
        session.add(
            VerseSpan(
                translation_id=translation.id,
                seq=span.seq,
                book=span.book,
                chapter=span.chapter,
                verse=span.verse,
                part=span.part,
                content=span.content,
            )
        )

    base = _lookup_base(session, result.scheme.based_on)
    scheme_row = VersificationScheme(
        name=resolved_name,
        based_on_name=result.scheme.based_on or "org",
        based_on_id=base.id,
        canonical=False,
        ingredient=result.scheme.ingredient,
    )
    session.add(scheme_row)
    session.flush()
    _insert_mapping_rows(session, scheme_row.id, result.scheme)
    session.add(
        TranslationVersification(
            translation_id=translation.id,
            scheme_id=scheme_row.id,
            preferred=True,
        )
    )
    session.flush()
    return ProjectIngestOut(
        translation=TranslationOut.model_validate(translation),
        versification=VersificationOut.model_validate(scheme_row),
    )
