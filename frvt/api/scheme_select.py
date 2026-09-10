"""Shared helpers for pagination bounds and selected-scheme lookup."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from frvt.api.errors import AppError
from frvt.api.logging_config import get_logger
from frvt.api.models import Translation, TranslationVersification, VersificationScheme
from frvt.resolver.types import SchemeRef

logger = get_logger(__name__)

# Default page size for paginated collection endpoints.
DEFAULT_LIMIT = 100
# Hard upper bound for ``limit`` query parameters.
MAX_LIMIT = 500


def clamp_page(limit: int | None, offset: int | None) -> tuple[int, int]:
    """Normalize ``limit``/``offset`` for collection endpoints.

    Raises ``AppError`` when ``limit`` exceeds ``MAX_LIMIT`` (spec: reject, do not
    silently clamp). Negative offsets are treated as zero.
    """
    logger.debug("Normalizing page limit=%s offset=%s", limit, offset)
    resolved_limit = DEFAULT_LIMIT if limit is None else limit
    resolved_offset = 0 if offset is None else offset
    if resolved_limit < 1:
        raise AppError(
            422,
            "Query parameter limit must be at least 1.",
            code="validation_failed",
        )
    if resolved_limit > MAX_LIMIT:
        raise AppError(
            422,
            f"Query parameter limit must be at most {MAX_LIMIT}.",
            code="validation_failed",
        )
    if resolved_offset < 0:
        resolved_offset = 0
    return resolved_limit, resolved_offset


def require_translation(session: Session, translation_id: UUID) -> Translation:
    """Load a translation by id or raise ``404 not_found``."""
    logger.trace("Loading translation id=%s", translation_id)  # type: ignore[attr-defined]
    translation = session.get(Translation, translation_id)
    if translation is None:
        raise AppError(
            404, f"Translation {translation_id} not found.", code="not_found"
        )
    return translation


def require_scheme(session: Session, scheme_id: UUID) -> VersificationScheme:
    """Load a versification scheme by id or raise ``404 not_found``."""
    logger.trace("Loading scheme id=%s", scheme_id)  # type: ignore[attr-defined]
    scheme = session.get(VersificationScheme, scheme_id)
    if scheme is None:
        raise AppError(404, f"Versification {scheme_id} not found.", code="not_found")
    return scheme


def _preferred_association(
    session: Session, translation_id: UUID
) -> TranslationVersification | None:
    """Return the preferred association row for a translation, if one exists."""
    logger.trace(  # type: ignore[attr-defined]
        "Loading preferred association translation=%s", translation_id
    )
    return session.scalar(
        select(TranslationVersification).where(
            TranslationVersification.translation_id == translation_id,
            TranslationVersification.preferred.is_(True),
        )
    )


def _scheme_ref_from_scheme(scheme: VersificationScheme) -> SchemeRef:
    """Build a ``SchemeRef`` from a loaded scheme row."""
    return SchemeRef(
        scheme_id=scheme.id,
        based_on_id=scheme.based_on_id,
        based_on_name=scheme.based_on_name,
    )


def selected_scheme_ref(
    session: Session,
    translation_id: UUID,
    override_scheme_id: UUID | None,
) -> SchemeRef:
    """Resolve the selected scheme for a translation (override else preferred).

    Precedence matches the resolve pre-checks: missing translation is assumed
    already validated; missing override scheme → 404; override not associated →
    409; no preferred when override omitted → 409.
    """
    logger.debug(
        "Selecting scheme for translation=%s override=%s",
        translation_id,
        override_scheme_id,
    )
    if override_scheme_id is not None:
        scheme = session.get(VersificationScheme, override_scheme_id)
        if scheme is None:
            raise AppError(
                404,
                f"Versification {override_scheme_id} not found.",
                code="not_found",
            )
        assoc = session.scalar(
            select(TranslationVersification).where(
                TranslationVersification.translation_id == translation_id,
                TranslationVersification.scheme_id == override_scheme_id,
            )
        )
        if assoc is None:
            raise AppError(
                409,
                "Versification is not associated with the translation.",
                code="conflict",
            )
        return _scheme_ref_from_scheme(scheme)

    preferred = _preferred_association(session, translation_id)
    if preferred is None:
        raise AppError(
            409,
            "Translation has no preferred versification.",
            code="conflict",
        )
    scheme = require_scheme(session, preferred.scheme_id)
    return _scheme_ref_from_scheme(scheme)


def org_scheme_ref(session: Session) -> SchemeRef:
    """Load the canonical ``org`` versification scheme.

    Looks up ``VersificationScheme``, not the similarly named anchor translation.
    Raises ``AppError`` ``409 conflict`` when the canonical ``org`` scheme is
    missing from the database.
    """
    logger.trace("Loading canonical org scheme")  # type: ignore[attr-defined]
    scheme = session.scalar(
        select(VersificationScheme).where(
            func.lower(VersificationScheme.name) == "org",
            VersificationScheme.canonical.is_(True),
        )
    )
    if scheme is None:
        logger.error("Canonical org scheme is missing")
        raise AppError(
            409,
            "Canonical org versification is missing.",
            code="conflict",
        )
    return _scheme_ref_from_scheme(scheme)


def batch_scheme_ref(
    session: Session,
    translation_id: UUID,
    override_scheme_id: UUID | None,
) -> SchemeRef:
    """Select a scheme for batch resolve, falling back to canonical ``org``.

    Differs from ``selected_scheme_ref`` only when no override is given and the
    translation has no preferred association: existing coordinate endpoints still
    raise ``409`` in that case, while batch endpoints must not fail the whole
    request over a missing preferred scheme.
    """
    logger.debug(
        "Selecting batch scheme for translation=%s override=%s",
        translation_id,
        override_scheme_id,
    )
    if override_scheme_id is not None:
        return selected_scheme_ref(session, translation_id, override_scheme_id)
    preferred = _preferred_association(session, translation_id)
    if preferred is None:
        return org_scheme_ref(session)
    scheme = require_scheme(session, preferred.scheme_id)
    return _scheme_ref_from_scheme(scheme)
