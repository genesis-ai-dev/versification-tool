"""Overlay a translation's verse spans on a loaded scheme.

A side with no spans is left unchanged, which is schemes mode. Books the text
does not contain drop out of the maxima. Verses the text skips become
exclusions tagged as text omissions.
"""

from __future__ import annotations

from dataclasses import dataclass

from frvt.divergence.refs import parse
from frvt.divergence.scheme import Scheme


@dataclass(frozen=True)
class TextSpan:
    """One stored verse the text overlay understands. No scripture content."""

    # USFM book code.
    book: str
    # Chapter number.
    chapter: int
    # Verse number. Verse 0 is ignored.
    verse: int
    # Sub-verse part, when the text splits a verse.
    part: str | None = None
    # Combined-milestone range such as ``GEN 1:1-2``, when the text bridges verses.
    verse_range: str | None = None


def apply_text_facts(
    scheme: Scheme, spans: tuple[TextSpan, ...] | list[TextSpan]
) -> bool:
    """Apply text facts in place. Returns whether any span was present."""
    if not spans:
        return False
    present = {span.book for span in spans}
    scheme.max = {
        book: chapters for book, chapters in scheme.max.items() if book in present
    }
    covered: set[tuple[str, int, int]] = set()
    for span in spans:
        if span.verse == 0:
            continue
        chapters = scheme.max.get(span.book)
        if chapters is None:
            continue
        if not (
            1 <= span.chapter <= len(chapters)
            and 1 <= span.verse <= chapters[span.chapter - 1]
        ):
            scheme.warnings.append(
                f"text verse beyond maxVerses {span.book} {span.chapter}:{span.verse}"
            )
            continue
        covered.add((span.book, span.chapter, span.verse))
        if span.part:
            current = list(
                scheme.segments.get((span.book, span.chapter, span.verse), ())
            )
            if span.part not in current:
                current.append(span.part)
            scheme.segments[(span.book, span.chapter, span.verse)] = tuple(
                sorted(current)
            )
        if span.verse_range:
            parsed = parse(span.verse_range)
            if parsed and parsed[3] > parsed[2]:
                scheme.bridges.append(parsed[:4])
    for book, chapters in scheme.max.items():
        for chapter, count in enumerate(chapters, start=1):
            for verse in range(1, count + 1):
                if (book, chapter, verse) not in covered:
                    scheme.excluded.add((book, chapter, verse))
                    scheme.text_omissions.add((book, chapter, verse))
    return True
