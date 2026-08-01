"""Public ingest callables: project zip and standalone versification upload."""

from __future__ import annotations

import json
import xml.etree.ElementTree as ET
from pathlib import PurePosixPath
from typing import Any

from frvt.api.logging_config import get_logger
from frvt.ingest.burrito_validate import validate_ingredient
from frvt.ingest.normalize import normalize_ingredient
from frvt.ingest.metadata_parse import parse_dbl_metadata
from frvt.ingest.project_zip import locate_project_members
from frvt.ingest.types import IngestIssue, ParsedScheme, ProjectIngestResult
from frvt.ingest.usx_parse import parse_usx_files
from frvt.ingest.vrs_convert import convert_vrs

logger = get_logger(__name__)


def _scheme_from_ingredient(
    ingredient: dict[str, Any],
    *,
    name: str,
) -> ParsedScheme:
    """Build a non-canonical ``ParsedScheme`` from a normalized ingredient."""
    normalized = normalize_ingredient(ingredient)
    based_on = normalized.get("basedOn") or "org"
    return ParsedScheme(
        name=name,
        based_on=str(based_on),
        canonical=False,
        ingredient=normalized,
    )


def ingest_versification(
    file_bytes: bytes, filename: str
) -> tuple[ParsedScheme | None, tuple[IngestIssue, ...]]:
    """Detect VRS vs JSON, convert/validate, and return a parsed scheme."""
    logger.debug("Ingesting versification file=%s bytes=%s", filename, len(file_bytes))
    issues: list[IngestIssue] = []
    name_stem = PurePosixPath(filename).stem or "custom"
    lower = filename.lower()
    text = file_bytes.decode("utf-8-sig", errors="replace")
    stripped = text.lstrip()

    ingredient: dict[str, Any] | None = None
    if lower.endswith(".json") or stripped.startswith("{"):
        try:
            loaded = json.loads(text)
        except json.JSONDecodeError as exc:
            logger.error("Invalid JSON versification", exc_info=True)
            return None, (
                IngestIssue(
                    kind="invalid",
                    field=filename,
                    message=f"Invalid JSON: {exc.msg}",
                ),
            )
        if not isinstance(loaded, dict):
            return None, (
                IngestIssue(
                    kind="invalid",
                    field=filename,
                    message="Ingredient JSON must be an object",
                ),
            )
        ingredient = loaded
    elif lower.endswith(".vrs") or "=" in text or _looks_like_vrs(text):
        ingredient, vrs_issues = convert_vrs(text)
        issues.extend(vrs_issues)
    else:
        return None, (
            IngestIssue(
                kind="invalid",
                field=filename,
                message="Unrecognized versification format",
            ),
        )

    assert ingredient is not None
    ingredient = normalize_ingredient(ingredient)
    issues.extend(validate_ingredient(ingredient))
    if issues:
        return None, tuple(issues)

    scheme = _scheme_from_ingredient(ingredient, name=name_stem)
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
        parse_dbl_metadata(located.metadata_text)
        if located.metadata_text
        else None
    )
    if located.issues:
        return ProjectIngestResult(
            spans=(), scheme=None, metadata=metadata, issues=located.issues
        )

    assert located.vrs_text is not None
    ingredient, vrs_issues = convert_vrs(located.vrs_text)
    issues: list[IngestIssue] = list(vrs_issues)
    ingredient = normalize_ingredient(ingredient)
    issues.extend(validate_ingredient(ingredient))
    if issues:
        return ProjectIngestResult(
            spans=(), scheme=None, metadata=metadata, issues=tuple(issues)
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
    vrs_name = PurePosixPath(located.vrs_path or "versification.vrs").stem
    scheme = _scheme_from_ingredient(ingredient, name=vrs_name)
    return ProjectIngestResult(
        spans=tuple(spans),
        scheme=scheme,
        metadata=metadata,
        issues=(),
    )
