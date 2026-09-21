"""Locate stored ``verse_span`` rows including combined-milestone coverage."""

from __future__ import annotations

from typing import Protocol
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, load_only

from frvt.api.logging_config import get_logger
from frvt.api.models import VerseSpan
from frvt.resolver.parse_ref import covers, parse_ref
from frvt.resolver.types import VerseId

logger = get_logger(__name__)

# Coordinate key used by the preloaded finder for exact BCV+part hits.
_ExactKey = tuple[str, int, int, str | None]


class SpanFinder(Protocol):
    """Look up a stored span the way ``find_stored_span`` does.

    The default implementation hits the database per call. Builders pass a
    preloaded finder so a cartesian index build does not repeat those queries
    for every verse.
    """

    def __call__(
        self,
        translation_id: UUID,
        *,
        book: str,
        chapter: int,
        verse: int,
        part: str | None,
    ) -> VerseSpan | None:
        """Return the stored span for an exact BCV or a covering milestone."""


def find_stored_span(
    session: Session,
    translation_id: UUID,
    *,
    book: str,
    chapter: int,
    verse: int,
    part: str | None,
) -> VerseSpan | None:
    """Return the stored span for an exact BCV or a covering milestone."""
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


def db_span_finder(session: Session) -> SpanFinder:
    """Return a finder that delegates to ``find_stored_span`` on every call.

    This is the live-path default so existing resolve behavior stays identical.
    """
    logger.debug("Creating database span finder")

    def find(
        translation_id: UUID,
        *,
        book: str,
        chapter: int,
        verse: int,
        part: str | None,
    ) -> VerseSpan | None:
        return find_stored_span(
            session,
            translation_id,
            book=book,
            chapter=chapter,
            verse=verse,
            part=part,
        )

    return find


def preloaded_span_finder(
    session: Session,
    translation_id: UUID,
    *more_ids: UUID,
) -> SpanFinder:
    """Load each translation's spans once and answer subsequent lookups in memory.

    Replicates ``find_stored_span`` semantics: exact BCV+part, fallback from a
    missing part to the whole verse, then combined-milestone coverage in ``seq``
    order. Unknown translation ids fall back to the database so a pair finder
    never silently misses the other side.
    """
    ids = (translation_id, *more_ids)
    logger.debug("Preloading span finder for %s translation(s)", len(ids))
    tables = {span_id: _load_span_tables(session, span_id) for span_id in ids}
    for span_id, (exact, covering) in tables.items():
        logger.debug(
            "Preloaded spans translation=%s exact=%s covering=%s",
            span_id,
            len(exact),
            sum(len(rows) for rows in covering.values()),
        )

    def find(
        translation_id: UUID,
        *,
        book: str,
        chapter: int,
        verse: int,
        part: str | None,
    ) -> VerseSpan | None:
        loaded = tables.get(translation_id)
        if loaded is None:
            return find_stored_span(
                session,
                translation_id,
                book=book,
                chapter=chapter,
                verse=verse,
                part=part,
            )
        exact, covering = loaded
        return _lookup_preloaded(
            exact,
            covering,
            book=book,
            chapter=chapter,
            verse=verse,
            part=part,
        )

    return find


def _load_span_tables(
    session: Session, translation_id: UUID
) -> tuple[dict[_ExactKey, VerseSpan], dict[tuple[str, int], list[VerseSpan]]]:
    """Load coordinate columns for one translation into lookup tables."""
    rows = session.scalars(
        select(VerseSpan)
        .options(
            load_only(
                VerseSpan.id,
                VerseSpan.translation_id,
                VerseSpan.book,
                VerseSpan.chapter,
                VerseSpan.verse,
                VerseSpan.seq,
                VerseSpan.part,
                VerseSpan.verse_label,
                VerseSpan.verse_range,
            )
        )
        .where(VerseSpan.translation_id == translation_id)
        .order_by(VerseSpan.seq)
    ).all()
    exact: dict[_ExactKey, VerseSpan] = {}
    covering: dict[tuple[str, int], list[VerseSpan]] = {}
    for row in rows:
        exact[(row.book, row.chapter, row.verse, row.part)] = row
        if row.verse_range is not None:
            covering.setdefault((row.book, row.chapter), []).append(row)
        # Detach so later chunk commits cannot expire these rows; the builder
        # holds them across many commits of mapping pages.
        session.expunge(row)
    return exact, covering


def _lookup_preloaded(
    exact: dict[_ExactKey, VerseSpan],
    covering: dict[tuple[str, int], list[VerseSpan]],
    *,
    book: str,
    chapter: int,
    verse: int,
    part: str | None,
) -> VerseSpan | None:
    """Apply ``find_stored_span`` match order against preloaded tables."""
    hit = exact.get((book, chapter, verse, part))
    if hit is not None:
        return hit
    if part is not None:
        whole = exact.get((book, chapter, verse, None))
        if whole is not None:
            return whole
    probe = VerseId(book=book, chapter=chapter, verse=verse, part=None)
    for row in covering.get((book, chapter), ()):
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
