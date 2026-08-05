"""CRUD endpoints for versification schemes."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from frvt.api.db import get_session
from frvt.api.errors import AppError
from frvt.api.logging_config import get_logger
from frvt.api.models import Translation, TranslationVersification, VersificationScheme
from frvt.api.schemas import (
    Page,
    VersificationDetailOut,
    VersificationOut,
    VersificationUpdate,
)
from frvt.api.scheme_select import clamp_page, require_scheme

logger = get_logger(__name__)

router = APIRouter(tags=["versifications"])


def _translation_names_by_scheme(
    session: Session, scheme_ids: list[UUID]
) -> dict[UUID, list[str]]:
    """Return sorted non-anchor translation names grouped by associated scheme id."""
    if not scheme_ids:
        return {}
    rows = session.execute(
        select(TranslationVersification.scheme_id, Translation.name)
        .join(Translation, TranslationVersification.translation_id == Translation.id)
        .where(
            TranslationVersification.scheme_id.in_(scheme_ids),
            Translation.is_anchor.is_(False),
        )
        .order_by(TranslationVersification.scheme_id, Translation.name)
    ).all()
    grouped: dict[UUID, list[str]] = {}
    for scheme_id, name in rows:
        grouped.setdefault(scheme_id, []).append(name)
    return grouped


@router.get("/api/versifications", response_model=Page[VersificationOut])
def list_versifications(
    canonical: bool | None = Query(default=None),
    limit: int | None = Query(default=None),
    offset: int | None = Query(default=None),
    session: Session = Depends(get_session),
) -> Page[VersificationOut]:
    """List schemes, optionally filtered by the ``canonical`` flag."""
    logger.debug("Listing versifications canonical=%s", canonical)
    page_limit, page_offset = clamp_page(limit, offset)
    stmt = select(VersificationScheme)
    count_stmt = select(func.count()).select_from(VersificationScheme)
    if canonical is not None:
        stmt = stmt.where(VersificationScheme.canonical.is_(canonical))
        count_stmt = count_stmt.where(VersificationScheme.canonical.is_(canonical))
    total = session.scalar(count_stmt)
    rows = session.scalars(
        stmt.order_by(VersificationScheme.name).limit(page_limit).offset(page_offset)
    ).all()
    names_by_scheme = _translation_names_by_scheme(session, [row.id for row in rows])
    return Page[VersificationOut](
        items=[
            VersificationOut.model_validate(row).model_copy(
                update={
                    "associated_translation_names": names_by_scheme.get(row.id, []),
                }
            )
            for row in rows
        ],
        total=int(total or 0),
    )


@router.get(
    "/api/versifications/{scheme_id}",
    response_model=VersificationDetailOut,
)
def get_versification(
    scheme_id: UUID,
    session: Session = Depends(get_session),
) -> VersificationDetailOut:
    """Return one scheme including its stored ingredient."""
    logger.debug("Getting versification id=%s", scheme_id)
    row = require_scheme(session, scheme_id)
    return VersificationDetailOut.model_validate(row)


@router.patch("/api/versifications/{scheme_id}", response_model=VersificationOut)
def update_versification(
    scheme_id: UUID,
    body: VersificationUpdate,
    session: Session = Depends(get_session),
) -> VersificationOut:
    """Rename a versification scheme."""
    logger.debug("Updating versification id=%s", scheme_id)
    row = require_scheme(session, scheme_id)
    if body.name is not None:
        row.name = body.name
    session.flush()
    return VersificationOut.model_validate(row)


@router.delete("/api/versifications/{scheme_id}", status_code=204)
def delete_versification(
    scheme_id: UUID,
    session: Session = Depends(get_session),
) -> None:
    """Delete a scheme when no association still references it."""
    logger.debug("Deleting versification id=%s", scheme_id)
    row = require_scheme(session, scheme_id)
    refs = session.scalar(
        select(func.count())
        .select_from(TranslationVersification)
        .where(TranslationVersification.scheme_id == scheme_id)
    )
    if refs and int(refs) > 0:
        raise AppError(
            409,
            "Versification is still associated with a translation.",
            code="conflict",
        )
    try:
        session.delete(row)
        session.flush()
    except IntegrityError as exc:
        logger.error("Failed deleting versification due to FK", exc_info=True)
        raise AppError(
            409,
            "Versification is still associated with a translation.",
            code="conflict",
        ) from exc
