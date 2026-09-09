"""Parse, expand, and format Copenhagen BCV / bcvRange reference strings."""

from __future__ import annotations

import re
from functools import lru_cache

from frvt.api.logging_config import get_logger
from frvt.resolver.types import RefRange, VerseId

logger = get_logger(__name__)

# Single-verse BCV: ``BOOK C:V`` with no part suffix and no range marker.
_BCV = re.compile(r"^([A-Z1-6]{3}) ([0-9]+):([0-9]+)$")
# Same-chapter range: ``BOOK C:V`` or ``BOOK C:V-V``.
_BCV_RANGE = re.compile(r"^([A-Z1-6]{3}) ([0-9]+):([0-9]+)(?:-([0-9]+))?$")
# Part suffix embedded in a single verse (``SIR 36:13a``) or a range end.
_EMBEDDED_PART = re.compile(r":[0-9]+(?:-[0-9]+)?[A-Za-z]")
# Cover a whole-Bible ingredient's distinct references without unbounded growth;
# ingest and resolve re-parse the same handful of strings hundreds of times each.
_PARSE_CACHE_SIZE = 32768


def parse_ref(value: str) -> RefRange:
    """Parse a BCV or same-chapter bcvRange string into a ``RefRange``.

    Raises ``ReferenceError`` when the value is not a string, the grammar does
    not match, a part suffix is embedded in the string, the range is
    cross-chapter (unsupported), or ``verse_end < verse_start``.
    """
    if not isinstance(value, str):
        raise ReferenceError(f"Reference must be a string, got {type(value)!r}")
    return _parse_ref_cached(value)


@lru_cache(maxsize=_PARSE_CACHE_SIZE)
def _parse_ref_cached(value: str) -> RefRange:
    """Parse an already type-checked reference string, memoizing successes.

    Ingest and resolve re-parse the same references hundreds of times per
    request, and ``RefRange`` is immutable, so returned instances are safe to
    share across callers. ``lru_cache`` does not retain exceptions, so rejected
    input is re-parsed (and re-logged) on every call.
    """
    logger.trace("Parsing reference %s", value)  # type: ignore[attr-defined]
    # Reject part-suffixed forms early (e.g. ``SIR 36:13a``) so callers use ``part``.
    if _EMBEDDED_PART.search(value):
        raise ReferenceError(f"Part must not be embedded in reference: {value!r}")

    match = _BCV_RANGE.fullmatch(value)
    if match is None:
        raise ReferenceError(f"Invalid BCV reference: {value!r}")

    book, chapter_s, start_s, end_s = match.groups()
    chapter = int(chapter_s)
    verse_start = int(start_s)
    verse_end = int(end_s) if end_s is not None else verse_start
    if verse_end < verse_start:
        raise ReferenceError(f"Range end before start: {value!r}")
    return RefRange(
        book=book,
        chapter=chapter,
        verse_start=verse_start,
        verse_end=verse_end,
    )


def expand(ref_range: RefRange) -> list[VerseId]:
    """Expand a ``RefRange`` into one ``VerseId`` per verse (``part`` left unset)."""
    logger.trace(  # type: ignore[attr-defined]
        "Expanding %s %s:%s-%s",
        ref_range.book,
        ref_range.chapter,
        ref_range.verse_start,
        ref_range.verse_end,
    )
    return [
        VerseId(book=ref_range.book, chapter=ref_range.chapter, verse=verse)
        for verse in range(ref_range.verse_start, ref_range.verse_end + 1)
    ]


def format_bcv(verse: VerseId) -> str:
    """Format a ``VerseId`` as a single-verse BCV string (part is omitted)."""
    return f"{verse.book} {verse.chapter}:{verse.verse}"


def covers(record_range: RefRange, verse: VerseId) -> bool:
    """Return whether ``verse`` falls inside ``record_range`` (same book/chapter)."""
    return (
        record_range.book == verse.book
        and record_range.chapter == verse.chapter
        and record_range.verse_start <= verse.verse <= record_range.verse_end
    )


def index_in_range(ref_range: RefRange, verse: VerseId) -> int:
    """Return the zero-based index of ``verse`` within ``ref_range``.

    Callers must ensure ``covers(ref_range, verse)`` is true.
    """
    return verse.verse - ref_range.verse_start
