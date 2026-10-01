"""The uploaded versification file, and the ingredient derived from it.

``derive_ingredient`` runs the same convert, normalize, and validate steps the
resolver already depends on. Callers persist the source text unchanged and store
only the derived ingredient on the scheme.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any, Literal

from frvt.api.logging_config import get_logger
from frvt.ingest.burrito_validate import validate_ingredient
from frvt.ingest.normalize import normalize_ingredient
from frvt.ingest.types import IngestIssue
from frvt.ingest.vrs_convert import convert_vrs

logger = get_logger(__name__)

SourceFormat = Literal["copenhagen_json", "vrs"]


@dataclass(frozen=True)
class SourceDocument:
    """Verbatim versification text plus the digest used to skip unchanged writes.

    ``companion_vrs_text`` is set for packaged canonical JSON that ships with a
    ``.vrs`` file. Uploads leave it empty. The digest covers both texts.
    """

    # ``copenhagen_json`` or ``vrs``.
    format: SourceFormat
    # Original file body, decoded as UTF-8 with a leading BOM stripped.
    document_text: str
    # Name shown on the versification detail response.
    filename: str
    # Hex digest of the document and, when present, the companion .vrs.
    sha256: str
    # Optional .vrs kept beside a JSON document for multi-target lines.
    companion_vrs_text: str | None = None


def make_source(
    *,
    format: SourceFormat,
    document_text: str,
    filename: str,
    companion_vrs_text: str | None = None,
) -> SourceDocument:
    """Build a source document and its digest.

    The digest changes when either text changes, so bootstrap can skip a write
    that would not alter the stored row.
    """
    logger.debug(
        "Building source document format=%s filename=%s companion=%s",
        format,
        filename,
        companion_vrs_text is not None,
    )
    digest = hashlib.sha256()
    digest.update(document_text.encode("utf-8"))
    digest.update(b"\0")
    if companion_vrs_text:
        digest.update(companion_vrs_text.encode("utf-8"))
    return SourceDocument(
        format=format,
        document_text=document_text,
        filename=filename,
        sha256=digest.hexdigest(),
        companion_vrs_text=companion_vrs_text,
    )


def _nul_issue(filename: str) -> IngestIssue:
    """Issue raised when Postgres could not store the text."""
    return IngestIssue(
        kind="invalid",
        field=filename,
        message="Versification text must not contain NUL characters",
    )


def derive_ingredient(
    source: SourceDocument,
) -> tuple[dict[str, Any] | None, tuple[IngestIssue, ...]]:
    """Parse, normalize, and validate a source into the ingredient the resolver stores.

    Returns ``(None, issues)`` when the text contains NUL, does not parse, or
    fails validation. The source text itself is not modified.
    """
    logger.debug("Deriving ingredient from source filename=%s", source.filename)
    if "\x00" in source.document_text or (
        source.companion_vrs_text is not None and "\x00" in source.companion_vrs_text
    ):
        return None, (_nul_issue(source.filename),)

    issues: list[IngestIssue] = []
    if source.format == "vrs":
        ingredient, vrs_issues = convert_vrs(source.document_text)
        issues.extend(vrs_issues)
        if issues:
            return None, tuple(issues)
    else:
        try:
            loaded = json.loads(source.document_text)
        except json.JSONDecodeError as exc:
            logger.error("Invalid JSON versification", exc_info=True)
            return None, (
                IngestIssue(
                    kind="invalid",
                    field=source.filename,
                    message=f"Invalid JSON: {exc.msg}",
                ),
            )
        if not isinstance(loaded, dict):
            return None, (
                IngestIssue(
                    kind="invalid",
                    field=source.filename,
                    message="Ingredient JSON must be an object",
                ),
            )
        ingredient = loaded

    ingredient = normalize_ingredient(ingredient)
    issues.extend(validate_ingredient(ingredient))
    if issues:
        return None, tuple(issues)
    return ingredient, ()
