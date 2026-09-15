"""Parse partial BCV bounds and turn them into a comparable verse interval."""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass

from frvt.api.errors import AppError
from frvt.api.logging_config import get_logger
from frvt.api.usx_book_order import USX_BOOK_ORDER

logger = get_logger(__name__)

# ``BOOK``, ``BOOK C``, or ``BOOK C:V`` after surrounding whitespace is stripped.
_PARTIAL_REF = re.compile(r"^([A-Z1-6]{3})(?: ([0-9]+)(?::([0-9]+))?)?$")
# O(1) USX position for books already known to be in ``USX_BOOK_ORDER``.
_USX_INDEX: dict[str, int] = {code: index for index, code in enumerate(USX_BOOK_ORDER)}

# Ordering tuple ``(usx book index, chapter, verse)`` used for bound comparison.
VerseKey = tuple[int, int, int]


@dataclass(frozen=True)
class PartialRef:
    """A book, optional chapter, and optional verse used as a range endpoint.

    A verse is only meaningful when a chapter is also present. Callers obtain
    instances from ``parse_partial_ref`` rather than constructing them by hand.
    """

    # USFM book code from ``USX_BOOK_ORDER``.
    book: str
    # Chapter number when the input included one; otherwise ``None`` (open bound).
    chapter: int | None
    # Verse number when the input included one; otherwise ``None`` (open bound).
    verse: int | None


@dataclass(frozen=True)
class VerseRangeWindow:
    """Closed interval over stored verses, ready for SQL book filtering.

    ``books`` is the contiguous USX-order slice from the from-book through the
    to-book. ``lower`` / ``upper`` are comparable ``VerseKey`` values; a stored
    verse is inside the window when ``lower <= verse_key(...) <= upper``.
    """

    # Inclusive USX-order book window used to bound the SQL ``IN`` clause.
    books: tuple[str, ...]
    # Inclusive lower ``VerseKey`` (missing chapter/verse become ``-1``).
    lower: VerseKey
    # Inclusive upper ``VerseKey`` (missing chapter/verse become ``sys.maxsize``).
    upper: VerseKey


def parse_partial_ref(value: str) -> PartialRef:
    """Parse ``BOOK``, ``BOOK C``, or ``BOOK C:V`` into a ``PartialRef``.

    Raises ``AppError`` ``400 bad_request`` when the grammar does not match, and
    ``422 validation_failed`` when the book code is not in ``USX_BOOK_ORDER``.
    """
    logger.trace("Parsing partial reference %s", value)  # type: ignore[attr-defined]
    stripped = value.strip()
    match = _PARTIAL_REF.fullmatch(stripped)
    if match is None:
        logger.error("Invalid partial reference %r", value)
        raise AppError(
            400,
            f"Invalid BCV reference: {value!r}",
            code="bad_request",
        )
    book, chapter_s, verse_s = match.groups()
    if book not in _USX_INDEX:
        logger.error("Unknown book code in partial reference %r", value)
        raise AppError(
            422,
            f"Unknown book code: {book!r}",
            code="validation_failed",
        )
    chapter = int(chapter_s) if chapter_s is not None else None
    verse = int(verse_s) if verse_s is not None else None
    return PartialRef(book=book, chapter=chapter, verse=verse)


def verse_key(book: str, chapter: int, verse: int) -> VerseKey:
    """Return the ordering key for a concrete stored verse.

    Unknown book codes sort after every known USX code, matching
    ``usx_book_sort_key``. Callers that already validated the book against
    ``USX_BOOK_ORDER`` get a stable index into that sequence.
    """
    index = _USX_INDEX.get(book, len(USX_BOOK_ORDER))
    return (index, chapter, verse)


def _lower_bound(ref: PartialRef) -> VerseKey:
    """Build the inclusive lower ``VerseKey``; omitted fields become ``-1``."""
    chapter = ref.chapter if ref.chapter is not None else -1
    verse = ref.verse if ref.verse is not None else -1
    return verse_key(ref.book, chapter, verse)


def _upper_bound(ref: PartialRef) -> VerseKey:
    """Build the inclusive upper ``VerseKey``; omitted fields become ``sys.maxsize``."""
    chapter = ref.chapter if ref.chapter is not None else sys.maxsize
    verse = ref.verse if ref.verse is not None else sys.maxsize
    return verse_key(ref.book, chapter, verse)


def _books_in_window(from_ref: PartialRef, to_ref: PartialRef) -> tuple[str, ...]:
    """Return the inclusive USX slice from the from-book through the to-book.

    Raises ``AppError`` ``422`` when the to-book precedes the from-book.
    """
    start = _USX_INDEX[from_ref.book]
    end = _USX_INDEX[to_ref.book]
    if end < start:
        logger.error(
            "Reversed book window from=%s to=%s",
            from_ref.book,
            to_ref.book,
        )
        raise AppError(
            422,
            "Range end before start.",
            code="validation_failed",
        )
    return USX_BOOK_ORDER[start : end + 1]


def range_window(from_value: str, to_value: str) -> VerseRangeWindow:
    """Parse both partial refs and return a closed, ordered verse window.

    Raises ``AppError`` ``400`` / ``422`` from ``parse_partial_ref``, and
    ``422 validation_failed`` when the lower bound sorts after the upper bound
    (reversed books or a reversed chapter/verse inside one book).
    """
    logger.debug("Building range window from=%s to=%s", from_value, to_value)
    from_ref = parse_partial_ref(from_value)
    to_ref = parse_partial_ref(to_value)
    books = _books_in_window(from_ref, to_ref)
    lower = _lower_bound(from_ref)
    upper = _upper_bound(to_ref)
    if lower > upper:
        logger.error(
            "Reversed range window from=%s to=%s",
            from_value,
            to_value,
        )
        raise AppError(
            422,
            "Range end before start.",
            code="validation_failed",
        )
    return VerseRangeWindow(books=books, lower=lower, upper=upper)
