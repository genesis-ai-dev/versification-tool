"""Reference resolution endpoint."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from frvt.api.db import get_session
from frvt.api.logging_config import get_logger
from frvt.api.ports.resolver_port import resolve_reference
from frvt.api.resolve_batch import BatchTarget, resolve_verse_range, resolve_verse_set
from frvt.api.resolve_chapter import resolve_chapter
from frvt.api.schemas import (
    BatchResolveOut,
    BatchVerseRequest,
    ChapterResolveOut,
    ResolveResult,
)

logger = get_logger(__name__)

router = APIRouter(tags=["resolve"])


@router.get("/api/resolve", response_model=ResolveResult)
def resolve_endpoint(
    from_translation: UUID = Query(...),
    to_translation: UUID = Query(...),
    ref: str = Query(...),
    part: str | None = Query(default=None),
    from_versification: UUID | None = Query(default=None),
    to_versification: UUID | None = Query(default=None),
    session: Session = Depends(get_session),
) -> ResolveResult:
    """Resolve a BCV (or bcvRange) reference between two translations' schemes."""
    logger.debug(
        "GET /api/resolve ref=%s from=%s to=%s",
        ref,
        from_translation,
        to_translation,
    )
    result = resolve_reference(
        session,
        from_translation=from_translation,
        to_translation=to_translation,
        ref=ref,
        part=part,
        from_versification=from_versification,
        to_versification=to_versification,
    )
    return result


@router.get("/api/resolve/chapter", response_model=ChapterResolveOut)
def resolve_chapter_endpoint(
    from_translation: UUID = Query(...),
    to_translation: UUID = Query(...),
    book: str = Query(...),
    chapter: int = Query(..., ge=1),
    from_versification: UUID | None = Query(default=None),
    to_versification: UUID | None = Query(default=None),
    session: Session = Depends(get_session),
) -> ChapterResolveOut:
    """Resolve unique alignments for stored whole verses in one drive chapter."""
    logger.debug(
        "GET /api/resolve/chapter book=%s chapter=%s from=%s to=%s",
        book,
        chapter,
        from_translation,
        to_translation,
    )
    return resolve_chapter(
        session,
        from_translation=from_translation,
        to_translation=to_translation,
        book=book,
        chapter=chapter,
        from_versification=from_versification,
        to_versification=to_versification,
    )


@router.get("/api/resolve/range", response_model=BatchResolveOut)
def resolve_range_endpoint(
    from_translation: UUID = Query(...),
    to_translation: UUID = Query(...),
    from_ref: str = Query(...),
    to_ref: str = Query(...),
    from_versification: UUID | None = Query(default=None),
    to_versification: UUID | None = Query(default=None),
    limit: int | None = Query(default=None),
    offset: int | None = Query(default=None),
    session: Session = Depends(get_session),
) -> BatchResolveOut:
    """Resolve stored verses in a from/to partial-reference window.

    Per-verse failures appear as entry ``error`` values; the HTTP status stays
    ``200`` unless translations, schemes, bounds, or pagination are invalid.
    """
    logger.debug(
        "GET /api/resolve/range from_ref=%s to_ref=%s from=%s to=%s",
        from_ref,
        to_ref,
        from_translation,
        to_translation,
    )
    return resolve_verse_range(
        session,
        BatchTarget(
            from_translation=from_translation,
            to_translation=to_translation,
            from_versification=from_versification,
            to_versification=to_versification,
        ),
        from_ref=from_ref,
        to_ref=to_ref,
        limit=limit,
        offset=offset,
    )


@router.post("/api/resolve/verses", response_model=BatchResolveOut)
def resolve_verses_endpoint(
    body: BatchVerseRequest,
    session: Session = Depends(get_session),
) -> BatchResolveOut:
    """Resolve an explicit list of references in request order.

    Per-verse failures appear as entry ``error`` values; the HTTP status stays
    ``200`` unless translations, schemes, or the ``refs`` length are invalid.
    """
    logger.debug(
        "POST /api/resolve/verses count=%s from=%s to=%s",
        len(body.refs),
        body.from_translation,
        body.to_translation,
    )
    return resolve_verse_set(
        session,
        BatchTarget(
            from_translation=body.from_translation,
            to_translation=body.to_translation,
            from_versification=body.from_versification,
            to_versification=body.to_versification,
        ),
        body.refs,
    )
