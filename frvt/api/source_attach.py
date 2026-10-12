"""Read and attach verbatim versification sources without touching the scheme."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from frvt.api.errors import AppError
from frvt.api.logging_config import get_logger
from frvt.api.models import TranslationVersification, VerseSpan, VersificationScheme
from frvt.api.models.divergence import VersificationSource
from frvt.api.schemas.versification_source import (
    VersificationSourceMetaOut,
    VersificationSourceOut,
)
from frvt.ingest.derive_combined_milestones import apply_combined_milestone_splits
from frvt.ingest.source_document import SourceFormat, derive_ingredient, make_source
from frvt.ingest.types import ParsedSpan

logger = get_logger(__name__)

# Top-level ingredient keys compared when deciding whether an upload matches.
_COMPARE_KEYS = (
    "maxVerses",
    "mappedVerses",
    "excludedVerses",
    "partialVerses",
    "mergedVerses",
    "splitVerses",
)


def source_meta(row: VersificationSource | None) -> VersificationSourceMetaOut | None:
    """Metadata for a source row, or None when the scheme has no source."""
    if row is None:
        return None
    companion = row.companion_vrs_text
    return VersificationSourceMetaOut(
        format=row.format,
        filename=row.filename,
        sha256=row.sha256,
        document_bytes=len(row.document_text.encode("utf-8")),
        companion_bytes=None if companion is None else len(companion.encode("utf-8")),
        captured_at=row.captured_at,
    )


def source_body(row: VersificationSource) -> VersificationSourceOut:
    """Full source document for the GET source route."""
    return VersificationSourceOut(
        format=row.format,
        filename=row.filename,
        sha256=row.sha256,
        document_text=row.document_text,
        companion_vrs_text=row.companion_vrs_text,
        captured_at=row.captured_at,
    )


def _first_difference(left: dict, right: dict) -> str | None:
    """First compared key whose values differ, or None when they match."""
    for key in _COMPARE_KEYS:
        if left.get(key) != right.get(key):
            return key
    return None


def _spans_for(session: Session, translation_id: UUID) -> tuple[ParsedSpan, ...]:
    """Stored spans for one translation, as the milestone helper expects them."""
    rows = session.scalars(
        select(VerseSpan).where(VerseSpan.translation_id == translation_id)
    ).all()
    return tuple(
        ParsedSpan(
            seq=row.seq,
            book=row.book,
            chapter=row.chapter,
            verse=row.verse,
            part=row.part,
            content=row.content,
            verse_label=row.verse_label,
            verse_range=row.verse_range,
        )
        for row in rows
    )


def attach_source(
    session: Session,
    scheme: VersificationScheme,
    *,
    filename: str,
    document_text: str,
    source_format: SourceFormat,
) -> VersificationSource:
    """Insert a source row when the file re-derives to the stored ingredient.

    Canonical schemes and schemes that already have a source raise 409. A
    mismatch raises 422 and names the first differing top-level key. The scheme
    row is not written.
    """
    logger.debug("Attaching source scheme=%s filename=%s", scheme.id, filename)
    if scheme.canonical:
        raise AppError(409, "Canonical schemes already have a source.", code="conflict")
    existing = session.get(VersificationSource, scheme.id)
    if existing is not None:
        raise AppError(409, "This scheme already has a source.", code="conflict")
    source = make_source(
        format=source_format, document_text=document_text, filename=filename
    )
    derived, issues = derive_ingredient(source)
    if derived is None or issues:
        message = issues[0].message if issues else "Versification text is not valid."
        raise AppError(422, message, code="validation_failed")
    if _first_difference(derived, scheme.ingredient) is not None:
        derived = _with_milestone_splits(session, scheme, derived)
    difference = _first_difference(derived, scheme.ingredient)
    if difference is not None:
        raise AppError(
            422,
            f"Uploaded file does not match the stored ingredient ({difference}).",
            code="validation_failed",
        )
    row = VersificationSource(
        scheme_id=scheme.id,
        format=source.format,
        document_text=source.document_text,
        companion_vrs_text=source.companion_vrs_text,
        filename=source.filename,
        sha256=source.sha256,
    )
    session.add(row)
    session.flush()
    return row


def _with_milestone_splits(
    session: Session, scheme: VersificationScheme, derived: dict
) -> dict:
    """Re-apply combined-verse splits for translations that prefer this scheme.

    Project ingest stores the ingredient after that step. An original .vrs
    matches only once the same splits are applied. The scheme row is not written.
    """
    if scheme.based_on_id is None:
        return derived
    translation_ids = session.scalars(
        select(TranslationVersification.translation_id).where(
            TranslationVersification.scheme_id == scheme.id,
            TranslationVersification.preferred.is_(True),
        )
    ).all()
    current = derived
    for translation_id in translation_ids:
        spans = _spans_for(session, translation_id)
        if not spans:
            continue
        current = apply_combined_milestone_splits(
            current,
            spans,
            session=session,
            based_on_translation_id=scheme.based_on_id,
        )
    return current
