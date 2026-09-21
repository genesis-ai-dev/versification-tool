"""Digest of everything an index depends on, used to detect stale mappings."""

from __future__ import annotations

import hashlib
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from frvt.api.errors import AppError
from frvt.api.logging_config import get_logger
from frvt.api.models import Translation, VerseSpan, VersificationScheme
from frvt.resolver.chains import build_chain
from frvt.resolver.types import SchemeRef

logger = get_logger(__name__)


def index_fingerprint(
    session: Session,
    *,
    translation_id: UUID,
    scheme: SchemeRef,
) -> str:
    """Return a digest that changes whenever this index's inputs change.

    Covers the indexed translation (modification time and verse count) and every
    versification along its resolve chain (modification time and mapping count).
    Including the whole chain is the point: a change to an intermediate scheme
    alters results without touching any row an endpoint could hook, so a periodic
    comparison of this value is the only reliable way to notice.

    Raises ``AppError`` ``422 validation_failed`` when the chain cannot be walked,
    matching ``build_resolve_path``; the caller records that as a build failure.
    """
    logger.trace(  # type: ignore[attr-defined]
        "Computing index fingerprint translation=%s scheme=%s",
        translation_id,
        scheme.scheme_id,
    )
    parts = [f"translation={translation_id}"]
    parts.extend(_translation_parts(session, translation_id))
    parts.extend(_chain_parts(session, scheme))
    digest = hashlib.sha256("\n".join(parts).encode("utf-8")).hexdigest()
    logger.trace(  # type: ignore[attr-defined]
        "Index fingerprint translation=%s scheme=%s digest=%s",
        translation_id,
        scheme.scheme_id,
        digest,
    )
    return digest


def _translation_parts(session: Session, translation_id: UUID) -> list[str]:
    """Describe the translation's own contribution to the digest."""
    translation = session.get(Translation, translation_id)
    updated_at = (
        "missing" if translation is None else translation.updated_at.isoformat()
    )
    span_count = session.scalar(
        select(func.count())
        .select_from(VerseSpan)
        .where(VerseSpan.translation_id == translation_id)
    )
    return [f"updated_at={updated_at}", f"spans={int(span_count or 0)}"]


def _chain_parts(session: Session, scheme: SchemeRef) -> list[str]:
    """Describe every versification along the resolve chain, in chain order."""
    try:
        chain = build_chain(session, scheme)
    except LookupError as exc:
        logger.error(
            "Cannot fingerprint scheme=%s: chain walk failed",
            scheme.scheme_id,
            exc_info=True,
        )
        raise AppError(422, str(exc), code="validation_failed") from exc

    parts: list[str] = []
    for hop in chain:
        row = session.get(VersificationScheme, hop.scheme_id)
        hop_updated = "missing" if row is None else row.updated_at.isoformat()
        parts.append(
            f"scheme={hop.scheme_id} updated_at={hop_updated} "
            f"mappings={len(hop.mappings)}"
        )
    return parts
