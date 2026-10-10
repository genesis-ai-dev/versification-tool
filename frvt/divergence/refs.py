"""Reference parsing and span encoding for the divergence engine.

A verse is ``(book, chapter, verse)``. A span is
``[book, chapter1, verse1, chapter2, verse2]`` or ``None``.
"""

from __future__ import annotations

import re

from frvt.divergence.catalog import book_order

# Book, chapter, verse, optional end verse, optional part letter.
REF = re.compile(r"^([A-Z0-9]{3}) (\d+):(\d+)(?:-(\d+))?([a-z]?)\s*$")

Verse = tuple[str, int, int]
ParsedRef = tuple[str, int, int, int, str]
Span = list[str | int] | None


def parse(text: str) -> ParsedRef | None:
    """Parse one mapping token. Returns None when the token is not a reference."""
    match = REF.match(text.strip())
    if not match:
        return None
    book, chapter, verse_start, verse_end, part = match.groups()
    start = int(verse_start)
    end = int(verse_end) if verse_end else start
    return book, int(chapter), start, end, part


def verse_pos(verse: Verse) -> tuple[int, int, int]:
    """Canonical sort key: book order, then chapter, then verse."""
    return (book_order(verse[0]), verse[1], verse[2])


def span(verses: list[Verse]) -> Span:
    """Encode a verse list as one span. An empty list encodes as None.

    A list that changes books keeps only the first verse. The prototype does
    the same, because a cross-book span is not a single range.
    """
    if not verses:
        return None
    first, last = verses[0], verses[-1]
    if first[0] != last[0]:
        return [first[0], first[1], first[2], first[1], first[2]]
    return [first[0], first[1], first[2], last[1], last[2]]
