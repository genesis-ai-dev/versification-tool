"""Locate stored ``verse_span`` rows including combined-milestone coverage."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from frvt.api.logging_config import get_logger
from frvt.api.models import VerseSpan
from frvt.resolver.parse_ref import covers, parse_ref
from frvt.resolver.types import VerseId

logger = get_logger(__name__)


def find_stored_span(
    session: Session,
    translation_id: UUID,
    *,
    book: str,
    chapter: int,
    verse: int,
    part: str | None,
) -> VerseSpan | None:
    """Return the stored span for an exact BCV or a combined milestone that covers it."""
    logger.trace(  # type: ignore[attr-defined]
        "find_stored_span translation=%s %s %s:%s part=%s",
        translation_id,
        book,
        chapter,
        verse,
        part,
    )
    exact = _exact_span(
        session,
        translation_id,
        book=book,
        chapter=chapter,
        verse=verse,
        part=part,
    )
    if exact is not None:
        return exact
    if part is not None:
        whole = _exact_span(
            session,
            translation_id,
            book=book,
            chapter=chapter,
            verse=verse,
            part=None,
        )
        if whole is not None:
            return whole
    return _covering_span(
        session,
        translation_id,
        book=book,
        chapter=chapter,
        verse=verse,
    )


def _exact_span(
    session: Session,
    translation_id: UUID,
    *,
    book: str,
    chapter: int,
    verse: int,
    part: str | None,
) -> VerseSpan | None:
    """Return a span matching exact coordinates when present."""
    filters = [
        VerseSpan.translation_id == translation_id,
        VerseSpan.book == book,
        VerseSpan.chapter == chapter,
        VerseSpan.verse == verse,
    ]
    if part is None:
        filters.append(VerseSpan.part.is_(None))
    else:
        filters.append(VerseSpan.part == part)
    return session.scalar(select(VerseSpan).where(*filters))


def _covering_span(
    session: Session,
    translation_id: UUID,
    *,
    book: str,
    chapter: int,
    verse: int,
) -> VerseSpan | None:
    """Return a combined-milestone span whose ``verse_range`` covers ``verse``."""
    rows = session.scalars(
        select(VerseSpan)
        .where(
            VerseSpan.translation_id == translation_id,
            VerseSpan.book == book,
            VerseSpan.chapter == chapter,
            VerseSpan.verse_range.is_not(None),
        )
        .order_by(VerseSpan.seq)
    ).all()
    probe = VerseId(book=book, chapter=chapter, verse=verse, part=None)
    for row in rows:
        if row.verse_range is None:
            continue
        try:
            record_range = parse_ref(row.verse_range)
        except ReferenceError:
            logger.error("Unparseable verse_range %s", row.verse_range, exc_info=True)
            continue
        if covers(record_range, probe):
            return row
    return None
