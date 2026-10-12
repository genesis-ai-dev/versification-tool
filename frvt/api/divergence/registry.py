"""Claim, read, and update divergence report rows."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import Select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from frvt.api.config import get_settings
from frvt.api.divergence.fingerprint import report_fingerprint
from frvt.api.divergence.keys import ReportKey
from frvt.api.logging_config import get_logger
from frvt.api.models.divergence import DivergenceReport

logger = get_logger(__name__)

STAGES = ("loading", "composing", "classifying", "events", "runs", "encoding")


@dataclass(frozen=True)
class Claim:
    """What the caller should do with a report row it just locked."""

    # The locked row.
    report: DivergenceReport
    # True when the caller should enqueue compute.
    schedule: bool


def claim_report(session: Session, key: ReportKey) -> Claim:
    """Insert or lock the row for ``key`` and decide whether to compute it.

    A ready row whose fingerprint still matches is returned as-is. A running
    row with a fresh heartbeat is left alone. A pending row is scheduled
    again; the runner drops an id that is already queued. Anything else is
    reset to pending and scheduled.
    """
    logger.debug("Claiming divergence report %s", key)
    fingerprint = report_fingerprint(session, key)
    session.execute(
        pg_insert(DivergenceReport)
        .values(
            from_translation_id=key.from_translation_id,
            from_scheme_id=key.from_scheme_id,
            to_translation_id=key.to_translation_id,
            to_scheme_id=key.to_scheme_id,
            status="pending",
            fingerprint=fingerprint,
        )
        .on_conflict_do_nothing(constraint="uq_divergence_report_key")
    )
    row = session.scalar(
        select_for_update(key),
    )
    if row is None:
        raise RuntimeError(f"Divergence report row missing after insert for {key}")
    fresh = _heartbeat_fresh(row)
    if row.status == "ready" and row.fingerprint == fingerprint:
        return Claim(row, schedule=False)
    if row.status == "running" and fresh and row.fingerprint == fingerprint:
        return Claim(row, schedule=False)
    if row.status == "pending" and row.fingerprint == fingerprint:
        # A second POST while the job is queued is safe: the runner drops it.
        return Claim(row, schedule=True)
    row.status = "pending"
    row.fingerprint = fingerprint
    row.payload = None
    row.error = None
    row.stage = None
    row.stage_index = 0
    row.completed = 0
    row.total = 0
    row.heartbeat_at = None
    return Claim(row, schedule=True)


def select_for_update(key: ReportKey) -> Select[tuple[DivergenceReport]]:
    """Locked select for the report identified by ``key``."""
    from sqlalchemy import select

    return (
        select(DivergenceReport)
        .where(
            DivergenceReport.from_translation_id == key.from_translation_id,
            DivergenceReport.from_scheme_id == key.from_scheme_id,
            DivergenceReport.to_translation_id == key.to_translation_id,
            DivergenceReport.to_scheme_id == key.to_scheme_id,
        )
        .with_for_update()
    )


def _heartbeat_fresh(row: DivergenceReport) -> bool:
    """Whether a running row has reported progress recently enough to keep it."""
    if row.status != "running":
        return row.status == "pending"
    if row.heartbeat_at is None:
        return False
    limit = timedelta(seconds=get_settings().divergence_stale_seconds)
    return datetime.now(UTC) - row.heartbeat_at < limit


def is_stalled(row: DivergenceReport) -> bool:
    """True when a running row's heartbeat is older than the configured limit."""
    logger.trace("Checking divergence stall id=%s", row.id)  # type: ignore[attr-defined]
    return row.status == "running" and not _heartbeat_fresh(row)


def same_fingerprint(session: Session, report_id: UUID, fingerprint: str) -> bool:
    """Lock the row and report whether it still carries ``fingerprint``.

    A compute that started against an older digest uses this before it writes
    ready or failed, so it cannot replace a newer claim.
    """
    from sqlalchemy import select

    logger.trace(  # type: ignore[attr-defined]
        "Checking divergence fingerprint id=%s", report_id
    )
    row = session.scalar(
        select(DivergenceReport)
        .where(DivergenceReport.id == report_id)
        .with_for_update()
    )
    return row is not None and row.fingerprint == fingerprint


def mark_progress(
    session: Session,
    report_id: UUID,
    *,
    stage: str,
    completed: int,
    total: int,
) -> None:
    """Record stage progress and refresh the heartbeat."""
    logger.debug(
        "Divergence progress id=%s stage=%s completed=%s total=%s",
        report_id,
        stage,
        completed,
        total,
    )
    row = session.get(DivergenceReport, report_id)
    if row is None:
        return
    row.status = "running"
    row.stage = stage
    row.stage_index = STAGES.index(stage) + 1 if stage in STAGES else row.stage_index
    row.completed = completed
    row.total = total
    row.heartbeat_at = datetime.now(UTC)


def mark_ready(session: Session, report_id: UUID, payload: str) -> None:
    """Store the payload and mark the report ready."""
    logger.debug(
        "Marking divergence report ready id=%s bytes=%s", report_id, len(payload)
    )
    row = session.get(DivergenceReport, report_id)
    if row is None:
        return
    row.status = "ready"
    row.payload = payload
    row.error = None
    row.stage = "encoding"
    row.stage_index = len(STAGES)
    row.heartbeat_at = datetime.now(UTC)


def mark_failed(session: Session, report_id: UUID, message: str) -> None:
    """Record a compute failure. The next POST may schedule the row again."""
    logger.error("Divergence report %s failed: %s", report_id, message)
    row = session.get(DivergenceReport, report_id)
    if row is None:
        return
    row.status = "failed"
    row.error = message
    row.heartbeat_at = datetime.now(UTC)
