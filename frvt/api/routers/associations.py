"""Association endpoints enforcing the single-preferred-scheme invariants."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from frvt.api.db import get_session
from frvt.api.errors import AppError
from frvt.api.logging_config import get_logger
from frvt.api.models import TranslationVersification
from frvt.api.schemas import AssociationCreate, AssociationOut
from frvt.api.scheme_select import require_scheme, require_translation

logger = get_logger(__name__)

router = APIRouter(tags=["associations"])


def _get_association(
    session: Session, translation_id: UUID, scheme_id: UUID
) -> TranslationVersification | None:
    """Return the association row for the pair, if any."""
    return session.scalar(
        select(TranslationVersification).where(
            TranslationVersification.translation_id == translation_id,
            TranslationVersification.scheme_id == scheme_id,
        )
    )


@router.get(
    "/api/translations/{translation_id}/versifications",
    response_model=list[AssociationOut],
)
def list_associations(
    translation_id: UUID,
    session: Session = Depends(get_session),
) -> list[AssociationOut]:
    """List schemes associated with a translation, marking the preferred one."""
    logger.debug("Listing associations for translation=%s", translation_id)
    require_translation(session, translation_id)
    rows = session.scalars(
        select(TranslationVersification).where(
            TranslationVersification.translation_id == translation_id
        )
    ).all()
    return [AssociationOut.model_validate(row) for row in rows]


@router.post(
    "/api/translations/{translation_id}/versifications",
    response_model=AssociationOut,
    status_code=201,
)
def create_association(
    translation_id: UUID,
    body: AssociationCreate,
    session: Session = Depends(get_session),
) -> AssociationOut:
    """Associate an existing scheme with the translation (non-preferred)."""
    logger.debug(
        "Associating scheme=%s with translation=%s", body.scheme_id, translation_id
    )
    require_translation(session, translation_id)
    require_scheme(session, body.scheme_id)
    if _get_association(session, translation_id, body.scheme_id) is not None:
        raise AppError(409, "Scheme is already associated.", code="conflict")
    # First association for a translation becomes preferred by default.
    has_any = session.scalar(
        select(TranslationVersification).where(
            TranslationVersification.translation_id == translation_id
        )
    )
    row = TranslationVersification(
        translation_id=translation_id,
        scheme_id=body.scheme_id,
        preferred=has_any is None,
    )
    session.add(row)
    try:
        session.flush()
    except IntegrityError as exc:
        logger.error("Association insert conflict", exc_info=True)
        raise AppError(409, "Scheme is already associated.", code="conflict") from exc
    return AssociationOut.model_validate(row)


@router.put(
    "/api/translations/{translation_id}/versifications/{scheme_id}/preferred",
    response_model=AssociationOut,
)
def make_preferred(
    translation_id: UUID,
    scheme_id: UUID,
    session: Session = Depends(get_session),
) -> AssociationOut:
    """Make an existing association the preferred default in one transaction."""
    logger.debug(
        "Making scheme=%s preferred for translation=%s", scheme_id, translation_id
    )
    require_translation(session, translation_id)
    assoc = _get_association(session, translation_id, scheme_id)
    if assoc is None:
        raise AppError(
            409,
            "Scheme is not associated with the translation.",
            code="conflict",
        )
    others = session.scalars(
        select(TranslationVersification).where(
            TranslationVersification.translation_id == translation_id,
            TranslationVersification.preferred.is_(True),
            TranslationVersification.id != assoc.id,
        )
    ).all()
    for other in others:
        other.preferred = False
    # Release the partial unique index before assigning the replacement default.
    session.flush()
    assoc.preferred = True
    session.flush()
    return AssociationOut.model_validate(assoc)


@router.delete(
    "/api/translations/{translation_id}/versifications/{scheme_id}",
    status_code=204,
)
def delete_association(
    translation_id: UUID,
    scheme_id: UUID,
    session: Session = Depends(get_session),
) -> None:
    """Remove a non-preferred association; preferred rows return 409."""
    logger.debug(
        "Deleting association translation=%s scheme=%s", translation_id, scheme_id
    )
    require_translation(session, translation_id)
    assoc = _get_association(session, translation_id, scheme_id)
    if assoc is None:
        raise AppError(404, "Association not found.", code="not_found")
    if assoc.preferred:
        raise AppError(
            409,
            "Preferred association cannot be deleted.",
            code="conflict",
        )
    session.delete(assoc)
    session.flush()
