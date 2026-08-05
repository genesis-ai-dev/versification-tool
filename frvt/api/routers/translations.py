"""CRUD endpoints for translations (anchors excluded from listings)."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from frvt.api.coupled_scheme_delete import coupled_preferred_scheme_id
from frvt.api.db import get_session
from frvt.api.errors import AppError
from frvt.api.logging_config import get_logger
from frvt.api.models import Translation, VersificationScheme
from frvt.api.schemas import Page, TranslationCreate, TranslationOut, TranslationUpdate
from frvt.api.scheme_select import clamp_page, require_translation

logger = get_logger(__name__)

router = APIRouter(tags=["translations"])


@router.get("/api/translations", response_model=Page[TranslationOut])
def list_translations(
    limit: int | None = Query(default=None),
    offset: int | None = Query(default=None),
    session: Session = Depends(get_session),
) -> Page[TranslationOut]:
    """List non-anchor translations with pagination."""
    logger.debug("Listing translations limit=%s offset=%s", limit, offset)
    page_limit, page_offset = clamp_page(limit, offset)
    filters = Translation.is_anchor.is_(False)
    total = session.scalar(select(func.count()).select_from(Translation).where(filters))
    rows = session.scalars(
        select(Translation)
        .where(filters)
        .order_by(Translation.name)
        .limit(page_limit)
        .offset(page_offset)
    ).all()
    return Page[TranslationOut](
        items=[TranslationOut.model_validate(row) for row in rows],
        total=int(total or 0),
    )


@router.post("/api/translations", response_model=TranslationOut, status_code=201)
def create_translation(
    body: TranslationCreate,
    session: Session = Depends(get_session),
) -> TranslationOut:
    """Create a metadata-only translation row."""
    logger.debug("Creating translation name=%s", body.name)
    existing = session.scalar(
        select(Translation).where(func.lower(Translation.name) == body.name.lower())
    )
    if existing is not None:
        raise AppError(409, "Translation name already exists.", code="conflict")
    row = Translation(
        name=body.name,
        language=body.language,
        source_format=body.source_format,
        is_anchor=False,
    )
    session.add(row)
    try:
        session.flush()
    except IntegrityError as exc:
        logger.error("Duplicate translation name on insert", exc_info=True)
        raise AppError(
            409, "Translation name already exists.", code="conflict"
        ) from exc
    return TranslationOut.model_validate(row)


@router.get("/api/translations/{translation_id}", response_model=TranslationOut)
def get_translation(
    translation_id: UUID,
    session: Session = Depends(get_session),
) -> TranslationOut:
    """Return one translation by id (anchors are readable by id)."""
    logger.debug("Getting translation id=%s", translation_id)
    row = require_translation(session, translation_id)
    return TranslationOut.model_validate(row)


@router.patch("/api/translations/{translation_id}", response_model=TranslationOut)
def update_translation(
    translation_id: UUID,
    body: TranslationUpdate,
    session: Session = Depends(get_session),
) -> TranslationOut:
    """Update translation name and/or language."""
    logger.debug("Updating translation id=%s", translation_id)
    row = require_translation(session, translation_id)
    if body.name is not None:
        clash = session.scalar(
            select(Translation).where(
                func.lower(Translation.name) == body.name.lower(),
                Translation.id != translation_id,
            )
        )
        if clash is not None:
            raise AppError(409, "Translation name already exists.", code="conflict")
        row.name = body.name
    if body.language is not None:
        row.language = body.language
    try:
        session.flush()
    except IntegrityError as exc:
        logger.error("Duplicate translation name on update", exc_info=True)
        raise AppError(
            409, "Translation name already exists.", code="conflict"
        ) from exc
    return TranslationOut.model_validate(row)


@router.delete("/api/translations/{translation_id}", status_code=204)
def delete_translation(
    translation_id: UUID,
    session: Session = Depends(get_session),
) -> None:
    """Delete a translation unless it is still referenced as a scheme base.

    When the preferred versification scheme shares the translation name and is
    not associated with any other translation, that scheme and its mapping rows
    are deleted as well. Non-preferred schemes and shared or differently named
    preferred schemes are left unchanged.
    """
    from sqlalchemy import delete

    from frvt.api.models import TranslationVersification, VerseSpan

    logger.debug("Deleting translation id=%s", translation_id)
    row = require_translation(session, translation_id)
    referenced = session.scalar(
        select(func.count())
        .select_from(VersificationScheme)
        .where(VersificationScheme.based_on_id == translation_id)
    )
    if referenced and int(referenced) > 0:
        raise AppError(
            409,
            "Translation is still referenced as a versification base.",
            code="conflict",
        )
    coupled_scheme_id = coupled_preferred_scheme_id(session, row)
    # Bulk-delete children first so large projects do not ORM-load every span.
    session.execute(delete(VerseSpan).where(VerseSpan.translation_id == translation_id))
    session.execute(
        delete(TranslationVersification).where(
            TranslationVersification.translation_id == translation_id
        )
    )
    if coupled_scheme_id is not None:
        scheme = session.get(VersificationScheme, coupled_scheme_id)
        if scheme is not None:
            logger.debug(
                "Deleting coupled preferred scheme id=%s name=%s",
                scheme.id,
                scheme.name,
            )
            session.delete(scheme)
    session.delete(row)
    session.flush()
