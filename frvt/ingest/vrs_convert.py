"""Convert Paratext VRS text into a Copenhagen/Burrito ingredient dict."""

from __future__ import annotations

import re
from typing import Any

from frvt.api.logging_config import get_logger
from frvt.ingest.types import IngestIssue

logger = get_logger(__name__)

# Book max-verse line: ``GEN 1:31 2:25 ...``
_BOOK_LINE = re.compile(r"^([A-Z1-6]{3})(?:\s+(\d+:\d+(?:\s+\d+:\d+)*))?$")
# Chapter:verse token inside a book line.
_CHAPTER_VERSE = re.compile(r"^(\d+):(\d+)$")
# Mapping line with optional part suffixes (e.g. ``ESG 1:1 = ESG 1:1a``).
_MAP_LINE = re.compile(
    r"^([A-Z1-6]{3} \d+:\d+(?:-\d+)?)([a-zA-Z-]*)\s*=\s*"
    r"([A-Z1-6]{3} \d+:\d+(?:-\d+)?)([a-zA-Z-]*)$"
)
# Deliberately omitted verse (for example ``-MAT 17:21``).
_EXCLUDED_LINE = re.compile(r"^-([A-Z1-6]{3} \d+:\d+)$")
# Optional basedOn declaration recognized in comments or a dedicated line.
_BASED_ON = re.compile(r"^#?\s*basedOn\s*[:=]\s*([a-z][a-z0-9]*)$", re.IGNORECASE)


def _add_partial(partial_verses: dict[str, list[str]], ref: str, part: str) -> None:
    """Record a part under ``ref`` without duplicating an existing part id."""
    parts = partial_verses.setdefault(ref, [])
    if part and part not in parts:
        parts.append(part)


def convert_vrs(vrs_text: str) -> tuple[dict[str, Any], tuple[IngestIssue, ...]]:
    """Parse VRS text into an ingredient dict plus any blocking issues."""
    logger.debug("Converting VRS text (%s chars)", len(vrs_text))
    max_verses: dict[str, list[str]] = {}
    mapped_verses: dict[str, str] = {}
    excluded_verses: list[str] = []
    partial_verses: dict[str, list[str]] = {}
    based_on: str | None = None
    issues: list[IngestIssue] = []

    for line_no, raw in enumerate(vrs_text.splitlines(), start=1):
        line = raw.strip()
        if not line:
            continue
        based_match = _BASED_ON.match(line)
        if based_match:
            based_on = based_match.group(1).lower()
            continue
        if line.startswith("#"):
            continue

        excluded_match = _EXCLUDED_LINE.match(line)
        if excluded_match:
            excluded_ref = excluded_match.group(1)
            if excluded_ref not in excluded_verses:
                excluded_verses.append(excluded_ref)
            continue

        map_match = _MAP_LINE.match(line)
        if map_match:
            source_ref, source_part, base_ref, base_part = map_match.groups()
            # Ingredient mappedVerses cannot embed parts; strip them for storage.
            mapped_verses[source_ref] = base_ref
            if source_part:
                _add_partial(partial_verses, source_ref, source_part)
            if base_part:
                _add_partial(partial_verses, base_ref, base_part)
            continue

        book_match = _BOOK_LINE.match(line)
        if book_match and ":" in line and "=" not in line:
            book = book_match.group(1)
            rest = book_match.group(2) or ""
            chapter_maxima: list[tuple[int, str]] = []
            ok = True
            for token in rest.split():
                cv = _CHAPTER_VERSE.match(token)
                if cv is None:
                    issues.append(
                        IngestIssue(
                            kind="invalid",
                            field="versification.vrs",
                            message=f"Unsupported token {token!r} on line {line_no}",
                        )
                    )
                    ok = False
                    break
                chapter_maxima.append((int(cv.group(1)), cv.group(2)))
            if not ok:
                continue
            # Store maxima in chapter order; samples list chapters sequentially.
            chapter_maxima.sort(key=lambda item: item[0])
            expected = 1
            values: list[str] = []
            for chapter, maximum in chapter_maxima:
                if chapter != expected:
                    issues.append(
                        IngestIssue(
                            kind="invalid",
                            field="versification.vrs",
                            message=(
                                f"Non-contiguous chapters for {book} on line {line_no}"
                            ),
                        )
                    )
                    values = []
                    break
                values.append(maximum)
                expected += 1
            if values:
                max_verses[book] = values
            continue

        issues.append(
            IngestIssue(
                kind="invalid",
                field="versification.vrs",
                message=f"Unsupported VRS construct on line {line_no}: {line!r}",
            )
        )

    if not max_verses:
        issues.append(
            IngestIssue(
                kind="invalid",
                field="versification.vrs",
                message="VRS contains no maxVerses book lines",
            )
        )

    ingredient: dict[str, Any] = {
        "basedOn": based_on or "org",
        "maxVerses": max_verses,
        "mappedVerses": mapped_verses,
        "excludedVerses": excluded_verses,
        "mergedVerses": [],
        "partialVerses": partial_verses,
    }
    return ingredient, tuple(issues)
