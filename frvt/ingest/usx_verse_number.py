"""Parse USX verse milestone ``number`` attributes into span coordinates."""

from __future__ import annotations

import re

from frvt.api.logging_config import get_logger

logger = get_logger(__name__)

# USX 3.0 ``verse@number``: integer with comma- or hyphen-separated continuations.
_USX_VERSE_NUMBER = re.compile(r"^\d+(?:[,\-]\d+)*$")


def parse_usx_verse_number(number: str) -> list[int] | None:
    """Return verse integers from a USX milestone ``number``, or ``None`` when unsupported."""
    if not _USX_VERSE_NUMBER.match(number):
        logger.debug("Unsupported USX verse number %s", number)
        return None
    segments = re.split(r"[,\-]", number)
    try:
        return [int(segment) for segment in segments]
    except ValueError:
        logger.debug("Non-integer segment in USX verse number %s", number)
        return None


def milestone_label_and_range(
    number: str,
    verses: list[int],
    *,
    book: str,
    chapter: int,
) -> tuple[str | None, str | None]:
    """Build display label and normalized BCV range for a combined milestone.

    Simple milestones (single integer) omit both fields. Combined milestones keep
    the original USX ``number`` string as ``verse_label`` and emit a hyphen range
    string legal for ``parse_ref`` (comma USX forms become hyphen ranges).
    """
    if len(verses) <= 1 and "," not in number and "-" not in number:
        return None, None
    start = min(verses)
    end = max(verses)
    verse_range = f"{book} {chapter}:{start}-{end}"
    return number, verse_range
