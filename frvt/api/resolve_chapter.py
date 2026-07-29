"""Chapter-scoped batch resolve with emit-once alignment dedupe."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from frvt.api.errors import AppError
from frvt.api.logging_config import get_logger
from frvt.api.models import VerseSpan
from frvt.api.ports.resolver_port import resolve_single_with_schemes
from frvt.api.schemas import ChapterResolveOut, ResolveResult
from frvt.api.scheme_select import require_translation, selected_scheme_ref

logger = get_logger(__name__)


def alignment_fingerprint(result: ResolveResult) -> tuple[Any, ...]:
    """Stable hashable key for emit-once dedupe across chapter member resolves."""
    source_keys = tuple(
        sorted((span.ref, span.part or "") for span in result.source_spans)
    )
    target_keys = tuple(
        sorted((span.ref, span.part or "") for span in result.target_spans)
    )
    edge_keys = tuple(
        sorted(
            (edge.source_index, edge.target_index, edge.relation.value)
            for edge in result.edges
        )
    )
    return (
        result.relation.value,
        source_keys,
        target_keys,
        edge_keys,
        result.source_rel.value if result.source_rel is not None else None,
        result.target_rel.value if result.target_rel is not None else None,
    )


def _stored_whole_verses(
    session: Session,
    translation_id: UUID,
    *,
    book: str,
    chapter: int,
) -> list[int]:
    """Distinct whole-verse numbers from stored ``verse_span`` rows only."""
    stmt = (
        select(VerseSpan.verse)
        .where(
            VerseSpan.translation_id == translation_id,
            VerseSpan.book == book,
            VerseSpan.chapter == chapter,
            VerseSpan.part.is_(None),
        )
        .distinct()
        .order_by(VerseSpan.verse)
    )
    return list(session.scalars(stmt).all())


def resolve_chapter(
    session: Session,
    *,
    from_translation: UUID,
    to_translation: UUID,
    book: str,
    chapter: int,
    from_versification: UUID | None = None,
    to_versification: UUID | None = None,
) -> ChapterResolveOut:
    """Resolve unique alignments for stored whole verses in one drive chapter."""
    logger.debug(
        "Chapter resolve book=%s chapter=%s from=%s to=%s",
        book,
        chapter,
        from_translation,
        to_translation,
    )
    require_translation(session, from_translation)
    require_translation(session, to_translation)
    source_scheme = selected_scheme_ref(session, from_translation, from_versification)
    target_scheme = selected_scheme_ref(session, to_translation, to_versification)

    verses = _stored_whole_verses(session, from_translation, book=book, chapter=chapter)
    seen: set[tuple[Any, ...]] = set()
    items: list[ResolveResult] = []

    for verse in verses:
        ref = f"{book} {chapter}:{verse}"
        try:
            result = resolve_single_with_schemes(
                session,
                from_translation=from_translation,
                to_translation=to_translation,
                ref=ref,
                part=None,
                source_scheme=source_scheme,
                target_scheme=target_scheme,
            )
        except AppError:
            logger.error(
                "Chapter resolve failed for ref=%s from=%s to=%s",
                ref,
                from_translation,
                to_translation,
                exc_info=True,
            )
            continue
        except Exception:
            logger.error(
                "Chapter resolve unexpected failure ref=%s from=%s to=%s",
                ref,
                from_translation,
                to_translation,
                exc_info=True,
            )
            continue

        fingerprint = alignment_fingerprint(result)
        if fingerprint in seen:
            continue
        seen.add(fingerprint)
        items.append(result)

    return ChapterResolveOut(items=items, total=len(items))
