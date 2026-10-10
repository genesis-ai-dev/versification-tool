"""Public ingest callables: project zip and standalone versification upload."""

from __future__ import annotations

import xml.etree.ElementTree as ET
from pathlib import PurePosixPath
from typing import Any

from frvt.api.logging_config import get_logger
from frvt.ingest.metadata_parse import parse_dbl_metadata
from frvt.ingest.normalize import normalize_ingredient
from frvt.ingest.project_zip import locate_project_members
from frvt.ingest.source_document import SourceDocument, derive_ingredient, make_source
from frvt.ingest.types import IngestIssue, ParsedScheme, ProjectIngestResult
from frvt.ingest.usx_parse import parse_usx_files

logger = get_logger(__name__)


def _scheme_from_ingredient(
    ingredient: dict[str, Any],
    *,
    name: str,
    source: SourceDocument | None = None,
) -> ParsedScheme:
    """Build a non-canonical ``ParsedScheme`` from a normalized ingredient."""
    normalized = normalize_ingredient(ingredient)
    based_on = normalized.get("basedOn") or "org"
    return ParsedScheme(
        name=name,
        based_on=str(based_on),
        canonical=False,
        ingredient=normalized,
        source=source,
    )


def ingest_versification(
    file_bytes: bytes, filename: str
) -> tuple[ParsedScheme | None, tuple[IngestIssue, ...]]:
    """Detect VRS vs JSON, convert/validate, and return a parsed scheme."""
    logger.debug("Ingesting versification file=%s bytes=%s", filename, len(file_bytes))
    name_stem = PurePosixPath(filename).stem or "custom"
    lower = filename.lower()
    text = file_bytes.decode("utf-8-sig", errors="replace")
    stripped = text.lstrip()

    if lower.endswith(".json") or stripped.startswith("{"):
        source_format = "copenhagen_json"
    elif lower.endswith(".vrs") or "=" in text or _looks_like_vrs(text):
        source_format = "vrs"
    else:
        return None, (
            IngestIssue(
                kind="invalid",
                field=filename,
                message="Unrecognized versification format",
            ),
        )

    source = make_source(format=source_format, document_text=text, filename=filename)
    ingredient, issues = derive_ingredient(source)
    if ingredient is None:
        return None, issues

    scheme = _scheme_from_ingredient(ingredient, name=name_stem, source=source)
    return scheme, ()


def _looks_like_vrs(text: str) -> bool:
    """Heuristic: VRS files contain book max lines or ``=`` mapping lines."""
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if "=" in stripped:
            return True
        parts = stripped.split()
        if parts and len(parts[0]) == 3 and ":" in stripped:
            return True
    return False


def ingest_project(archive_bytes: bytes) -> ProjectIngestResult:
    """Unzip a Paratext-style project and parse USX spans plus the required VRS."""
    logger.debug("Ingesting project archive (%s bytes)", len(archive_bytes))
    located = locate_project_members(archive_bytes)
    metadata = (
        parse_dbl_metadata(located.metadata_text) if located.metadata_text else None
    )
    if located.issues:
        return ProjectIngestResult(
            spans=(), scheme=None, metadata=metadata, issues=located.issues
        )

    assert located.vrs_text is not None
    vrs_name = PurePosixPath(located.vrs_path or "versification.vrs").stem
    source = make_source(
        format="vrs",
        document_text=located.vrs_text,
        filename=located.vrs_path or "versification.vrs",
    )
    ingredient, issues = derive_ingredient(source)
    if ingredient is None:
        return ProjectIngestResult(
            spans=(), scheme=None, metadata=metadata, issues=issues
        )

    try:
        spans = parse_usx_files(list(located.usx_files))
    except (ET.ParseError, ValueError):
        logger.error("Project USX parsing failed", exc_info=True)
        return ProjectIngestResult(
            spans=(),
            scheme=None,
            metadata=metadata,
            issues=(
                IngestIssue(
                    kind="invalid",
                    field="archive",
                    message="USX content is malformed or has invalid coordinates",
                ),
            ),
        )
    if not spans:
        return ProjectIngestResult(
            spans=(),
            scheme=None,
            metadata=metadata,
            issues=(
                IngestIssue(
                    kind="invalid",
                    field="archive",
                    message="USX files contain no usable verse spans",
                ),
            ),
        )
    scheme = _scheme_from_ingredient(ingredient, name=vrs_name, source=source)
    return ProjectIngestResult(
        spans=tuple(spans),
        scheme=scheme,
        metadata=metadata,
        issues=(),
    )
