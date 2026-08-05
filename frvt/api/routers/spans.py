"""Scripture span reads ordered by document ``seq``."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from frvt.api.db import get_session
from frvt.api.logging_config import get_logger
from frvt.api.models import VerseSpan
from frvt.api.schemas import Page, VerseSpanOut
from frvt.api.scheme_select import clamp_page, require_translation

logger = get_logger(__name__)

router = APIRouter(tags=["spans"])


@router.get(
    "/api/translations/{translation_id}/spans",
    response_model=Page[VerseSpanOut],
)
def list_spans(
    translation_id: UUID,
    book: str = Query(...),
    chapter: int | None = Query(default=None),
    limit: int | None = Query(default=None),
    offset: int | None = Query(default=None),
    session: Session = Depends(get_session),
) -> Page[VerseSpanOut]:
    """Return verse spans for a book (optional chapter), ordered by ``seq``."""
    logger.debug(
        "Listing spans translation=%s book=%s chapter=%s",
        translation_id,
        book,
        chapter,
    )
    require_translation(session, translation_id)
    page_limit, page_offset = clamp_page(limit, offset)
    filters = [
        VerseSpan.translation_id == translation_id,
        VerseSpan.book == book,
    ]
    if chapter is not None:
        filters.append(VerseSpan.chapter == chapter)
    total = session.scalar(select(func.count()).select_from(VerseSpan).where(*filters))
    rows = session.scalars(
        select(VerseSpan)
        .where(*filters)
        .order_by(VerseSpan.seq)
        .limit(page_limit)
        .offset(page_offset)
    ).all()
    return Page[VerseSpanOut](
        items=[VerseSpanOut.model_validate(row) for row in rows],
        total=int(total or 0),
    )
