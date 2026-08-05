"""Decide whether a translation's preferred scheme should be deleted with it."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from frvt.api.logging_config import get_logger
from frvt.api.models import Translation, TranslationVersification, VersificationScheme

logger = get_logger(__name__)


def coupled_preferred_scheme_id(
    session: Session,
    translation: Translation,
) -> UUID | None:
    """Return the preferred scheme id to delete with ``translation``, when tightly coupled.

    A scheme is deleted only when it is this translation's preferred association,
    its name matches the translation name (case-insensitive), and no other
    translation is associated with the same scheme.
    """
    logger.trace(  # type: ignore[attr-defined]
        "Checking coupled preferred scheme for translation=%s name=%s",
        translation.id,
        translation.name,
    )
    assoc = session.scalar(
        select(TranslationVersification).where(
            TranslationVersification.translation_id == translation.id,
            TranslationVersification.preferred.is_(True),
        )
    )
    if assoc is None:
        return None
    scheme = session.get(VersificationScheme, assoc.scheme_id)
    if scheme is None:
        return None
    if scheme.name.lower() != translation.name.lower():
        logger.debug(
            "Skipping scheme delete: name mismatch scheme=%s translation=%s",
            scheme.name,
            translation.name,
        )
        return None
    other_associations = session.scalar(
        select(func.count())
        .select_from(TranslationVersification)
        .where(
            TranslationVersification.scheme_id == scheme.id,
            TranslationVersification.translation_id != translation.id,
        )
    )
    if other_associations and int(other_associations) > 0:
        logger.debug(
            "Skipping scheme delete: scheme=%s still associated elsewhere",
            scheme.id,
        )
        return None
    return scheme.id
