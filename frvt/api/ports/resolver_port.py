"""Adapter that selects schemes, calls ``resolve``, and attaches structured coords."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from frvt.api.errors import AppError
from frvt.api.logging_config import get_logger
from frvt.api.models import VerseSpan
from frvt.api.schemas import RelationType, ResolvedSpan, ResolveEdge, ResolveResult
from frvt.api.scheme_select import require_translation, selected_scheme_ref
from frvt.resolver import resolve as resolve_coords
from frvt.resolver.parse_ref import parse_ref
from frvt.resolver.types import ResolutionDTO, ResolvedSpanDTO

logger = get_logger(__name__)


def _lookup_verse_span(
    session: Session,
    translation_id: UUID,
    *,
    book: str,
    chapter: int,
    verse: int,
    part: str | None,
) -> VerseSpan | None:
    """Return the stored verse span for the given BCV and optional part."""
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


def _enrich_span(
    session: Session,
    translation_id: UUID,
    dto: ResolvedSpanDTO,
) -> ResolvedSpan:
    """Parse structured coords from ``dto.ref`` and attach ``seq`` when present.

    When a part-bearing resolve span has no matching ``verse_span`` row (typical
    for USX whole-verse rows with ``part`` null), fall back to the whole-verse
    row so the UI can still anchor overlays and highlights.
    """
    ref_range = parse_ref(dto.ref)
    book = ref_range.book
    chapter = ref_range.chapter
    verse = ref_range.verse_start
    span = _lookup_verse_span(
        session,
        translation_id,
        book=book,
        chapter=chapter,
        verse=verse,
        part=dto.part,
    )
    if span is None and dto.part is not None:
        logger.debug(
            "Part span missing; falling back to whole verse ref=%s part=%s",
            dto.ref,
            dto.part,
        )
        span = _lookup_verse_span(
            session,
            translation_id,
            book=book,
            chapter=chapter,
            verse=verse,
            part=None,
        )
    return ResolvedSpan(
        ref=dto.ref,
        book=book,
        chapter=chapter,
        verse=verse,
        seq=span.seq if span is not None else None,
        part=dto.part,
    )


def _to_result(
    session: Session,
    source_translation: UUID,
    target_translation: UUID,
    dto: ResolutionDTO,
) -> ResolveResult:
    """Map a resolver DTO onto the HTTP ``ResolveResult`` contract."""
    return ResolveResult(
        source_spans=[
            _enrich_span(session, source_translation, s) for s in dto.source_spans
        ],
        target_spans=[
            _enrich_span(session, target_translation, t) for t in dto.target_spans
        ],
        relation=RelationType(dto.relation),
        edges=[
            ResolveEdge(
                source_index=e.source_index,
                target_index=e.target_index,
                relation=RelationType(e.relation),
            )
            for e in dto.edges
        ],
    )


def resolve_reference(
    session: Session,
    *,
    from_translation: UUID,
    to_translation: UUID,
    ref: str,
    part: str | None = None,
    from_versification: UUID | None = None,
    to_versification: UUID | None = None,
) -> ResolveResult:
    """Run resolve pre-checks, call the coordinate resolver, and enrich spans."""
    logger.debug(
        "Resolver port ref=%s from=%s to=%s",
        ref,
        from_translation,
        to_translation,
    )
    require_translation(session, from_translation)
    require_translation(session, to_translation)
    source_scheme = selected_scheme_ref(session, from_translation, from_versification)
    target_scheme = selected_scheme_ref(session, to_translation, to_versification)

    try:
        # Validate grammar before calling resolve so part-in-ref fails as 400.
        parse_ref(ref)
    except ReferenceError as exc:
        logger.error("Invalid resolve reference", exc_info=True)
        raise AppError(400, str(exc), code="bad_request") from exc

    try:
        dto = resolve_coords(
            session,
            ref,
            source_scheme=source_scheme,
            target_scheme=target_scheme,
            source_translation=from_translation,
            target_translation=to_translation,
            part=part,
        )
    except ReferenceError as exc:
        logger.error("Resolver ReferenceError", exc_info=True)
        raise AppError(400, str(exc), code="bad_request") from exc
    except LookupError as exc:
        logger.error("Resolver LookupError", exc_info=True)
        raise AppError(422, str(exc), code="validation_failed") from exc

    return _to_result(session, from_translation, to_translation, dto)
