"""Queue rebuilds and drop indexes when translations or versifications change."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from frvt.api.indexing.registry import queue_reclaim
from frvt.api.logging_config import get_logger
from frvt.api.models import (
    INDEX_STATUS_PENDING,
    TranslationIndex,
)
from frvt.api.scheme_select import batch_scheme_ref

logger = get_logger(__name__)


def invalidate_for_translation(
    session: Session, translation_id: UUID, *, reason: str
) -> int:
    """Return matching indexes to ``pending`` so they rebuild."""
    logger.debug(
        "Invalidating indexes for translation=%s reason=%s", translation_id, reason
    )
    rows = list(
        session.scalars(
            select(TranslationIndex).where(
                TranslationIndex.translation_id == translation_id
            )
        ).all()
    )
    _requeue(rows, reason)
    session.flush()
    return len(rows)


def invalidate_for_scheme(session: Session, scheme_id: UUID, *, reason: str) -> int:
    """Return indexes on ``scheme_id`` to ``pending`` so they rebuild."""
    logger.debug("Invalidating indexes for scheme=%s reason=%s", scheme_id, reason)
    rows = list(
        session.scalars(
            select(TranslationIndex).where(TranslationIndex.scheme_id == scheme_id)
        ).all()
    )
    _requeue(rows, reason)
    session.flush()
    return len(rows)


def drop_indexes_for_translation(session: Session, translation_id: UUID) -> int:
    """Queue reclaim and delete every index of ``translation_id``."""
    logger.debug("Dropping indexes for translation=%s", translation_id)
    rows = list(
        session.scalars(
            select(TranslationIndex).where(
                TranslationIndex.translation_id == translation_id
            )
        ).all()
    )
    return _drop(session, rows)


def drop_indexes_for_scheme(session: Session, scheme_id: UUID) -> int:
    """Queue reclaim and delete every index of ``scheme_id``."""
    logger.debug("Dropping indexes for scheme=%s", scheme_id)
    rows = list(
        session.scalars(
            select(TranslationIndex).where(TranslationIndex.scheme_id == scheme_id)
        ).all()
    )
    return _drop(session, rows)


def retarget_default_indexes(session: Session, translation_id: UUID) -> int:
    """Move defaulted indexes onto the translation's current preferred scheme.

    On collision with an existing index for the new pair, leave ``scheme_id``
    unchanged and record the conflict in ``build_notes``.
    """
    logger.debug("Retargeting default indexes for translation=%s", translation_id)
    rows = list(
        session.scalars(
            select(TranslationIndex).where(
                TranslationIndex.translation_id == translation_id,
                TranslationIndex.scheme_explicit.is_(False),
            )
        ).all()
    )
    changed = 0
    new_scheme = batch_scheme_ref(session, translation_id, None)
    for row in rows:
        if row.scheme_id == new_scheme.scheme_id:
            continue
        clash = session.scalar(
            select(TranslationIndex).where(
                TranslationIndex.translation_id == translation_id,
                TranslationIndex.scheme_id == new_scheme.scheme_id,
                TranslationIndex.id != row.id,
            )
        )
        if clash is not None:
            note = (
                "Retarget skipped: an index already exists for the new "
                "preferred versification."
            )
            row.build_notes = (
                note if not row.build_notes else f"{row.build_notes}\n{note}"
            )
            logger.error(
                "Default index %s not retargeted; collides with %s",
                row.id,
                clash.id,
            )
            continue
        row.scheme_id = new_scheme.scheme_id
        _requeue([row], "preferred versification changed")
        changed += 1
    session.flush()
    return changed


def _requeue(rows: list[TranslationIndex], reason: str) -> None:
    """Mark rows pending for rebuild without cancelling them outright."""
    now = datetime.now(UTC)
    for row in rows:
        row.status = INDEX_STATUS_PENDING
        row.pending_reason = reason
        row.cancel_requested = False
        row.requested_at = now


def _drop(session: Session, rows: list[TranslationIndex]) -> int:
    """Queue reclaim then delete the given index rows."""
    queue_reclaim(session, [row.id for row in rows])
    for row in rows:
        session.delete(row)
    session.flush()
    return len(rows)
