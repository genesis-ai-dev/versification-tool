"""Background claiming, reclamation, and staleness detection for indexes."""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from frvt.api.config import get_settings
from frvt.api.db import get_session_factory
from frvt.api.errors import AppError
from frvt.api.indexing.builder import build_index
from frvt.api.indexing.fingerprint import index_fingerprint
from frvt.api.indexing.registry import (
    delete_mapping_chunk,
    index_row_counts,
    queue_reclaim,
)
from frvt.api.logging_config import get_logger
from frvt.api.models import (
    INDEX_STATUS_BUILDING,
    INDEX_STATUS_CANCELLED,
    INDEX_STATUS_FAILED,
    INDEX_STATUS_PENDING,
    INDEX_STATUS_READY,
    IndexMapping,
    IndexReclaim,
    TranslationIndex,
)
from frvt.resolver.chains import scheme_ref_from_id

logger = get_logger(__name__)

# Second key of the session-level pair lock. The first key is this
# database's catalog OID so two databases on one cluster do not block
# each other. Transaction-scoped locks would release at the first chunk
# commit.
INDEX_BUILD_LOCK_KEY = 46525654

# Postgres OIDs are unsigned 32-bit; ``pg_try_advisory_lock(int, int)``
# takes signed int4, so the high half of the OID range wraps negative.
_INT4_MOD = 2**32
_INT4_SIGN = 2**31


@dataclass(frozen=True)
class ReclaimStep:
    """Result of draining one reclaim-queue entry."""

    # Mapping rows removed in this step.
    deleted: int
    # True when an orphan's last mapping rows were removed and its queue row dropped.
    completed: bool


def recover_orphaned_builds(session: Session) -> int:
    """Return rows stuck in ``building`` after a crash back to ``pending``.

    A cancel that was already requested is honored instead of being rebuilt.
    """
    logger.debug("Recovering orphaned index builds")
    rows = list(
        session.scalars(
            select(TranslationIndex).where(
                TranslationIndex.status == INDEX_STATUS_BUILDING
            )
        ).all()
    )
    for row in rows:
        if row.cancel_requested:
            row.status = INDEX_STATUS_CANCELLED
            row.cancel_requested = False
            continue
        row.status = INDEX_STATUS_PENDING
        row.pending_reason = "interrupted"
        row.cancel_requested = False
    session.flush()
    return len(rows)


def drain_reclaim(session: Session, *, chunk_size: int) -> ReclaimStep:
    """Delete one page of mapping rows for the oldest reclaim entry.

    If the index still exists the reclaim row is dropped without deleting
    mappings; the builder owns cleanup for live indexes. One page per call
    keeps reclaim from blocking a pending build for the whole table.
    """
    logger.debug("Draining index reclaim queue chunk_size=%s", chunk_size)
    item = session.scalar(
        select(IndexReclaim).order_by(IndexReclaim.requested_at).limit(1)
    )
    if item is None:
        return ReclaimStep(deleted=0, completed=False)
    if session.get(TranslationIndex, item.index_id) is not None:
        session.delete(item)
        session.flush()
        return ReclaimStep(deleted=0, completed=False)
    deleted = delete_mapping_chunk(session, item.index_id, chunk_size=chunk_size)
    outbound, inbound = index_row_counts(session, item.index_id)
    completed = outbound == 0 and inbound == 0
    if completed:
        session.delete(item)
    session.flush()
    return ReclaimStep(deleted=deleted, completed=completed)


def purge_orphan_mappings(session: Session) -> int:
    """Queue reclaim for mapping rows whose index id no longer exists.

    Startup safety net for anything the per-route reclaim hooks missed. The
    worker then drains those entries in chunks instead of leaving leftovers
    until the next process start.
    """
    logger.debug("Queueing reclaim for orphan index mappings")
    existing = select(TranslationIndex.id)
    orphan_ids: set[UUID] = set(
        session.scalars(
            select(IndexMapping.source_index_id).where(
                ~IndexMapping.source_index_id.in_(existing)
            )
        ).all()
    )
    orphan_ids.update(
        session.scalars(
            select(IndexMapping.target_index_id).where(
                ~IndexMapping.target_index_id.in_(existing)
            )
        ).all()
    )
    if not orphan_ids:
        return 0
    queue_reclaim(session, list(orphan_ids))
    return len(orphan_ids)


def _mark_content_changed(row: TranslationIndex) -> None:
    """Queue a ready index for rebuild after its inputs no longer match."""
    row.status = INDEX_STATUS_PENDING
    row.pending_reason = "content changed"
    row.cancel_requested = False
    row.requested_at = datetime.now(UTC)


def sweep_fingerprints(session: Session) -> int:
    """Re-queue ready indexes whose content no longer matches the last build."""
    logger.debug("Sweeping index content fingerprints")
    rows = list(
        session.scalars(
            select(TranslationIndex).where(
                TranslationIndex.status == INDEX_STATUS_READY
            )
        ).all()
    )
    stale = 0
    for row in rows:
        scheme = scheme_ref_from_id(session, row.scheme_id)
        if scheme is None:
            _mark_content_changed(row)
            stale += 1
            continue
        try:
            digest = index_fingerprint(
                session, translation_id=row.translation_id, scheme=scheme
            )
        except AppError:
            logger.error("Fingerprint failed for index=%s", row.id, exc_info=True)
            _mark_content_changed(row)
            stale += 1
            continue
        if digest != row.content_fingerprint:
            _mark_content_changed(row)
            stale += 1
    session.flush()
    return stale


def process_next_index(session: Session, *, chunk_size: int) -> bool:
    """Claim the oldest pending index and build it. Returns whether work ran."""
    logger.debug("Claiming next pending index")
    row = session.scalar(
        select(TranslationIndex)
        .where(TranslationIndex.status == INDEX_STATUS_PENDING)
        .order_by(TranslationIndex.requested_at)
        .with_for_update(skip_locked=True)
        .limit(1)
    )
    if row is None:
        return False
    if row.cancel_requested:
        row.status = INDEX_STATUS_CANCELLED
        row.cancel_requested = False
        session.flush()
        return True
    index_id = row.id
    row.status = INDEX_STATUS_BUILDING
    row.started_at = datetime.now(UTC)
    row.last_error = None
    session.commit()
    try:
        build_index(session, index_id, chunk_size=chunk_size)
    except Exception as exc:
        logger.error("Index build failed id=%s", index_id, exc_info=True)
        failed = session.get(TranslationIndex, index_id)
        if failed is not None:
            failed.status = INDEX_STATUS_FAILED
            failed.last_error = str(exc)
            session.commit()
    return True


def _lock_key_from_oid(oid: int) -> int:
    """Map a PostgreSQL OID onto a signed int4 advisory-lock key."""
    unsigned = oid % _INT4_MOD
    if unsigned >= _INT4_SIGN:
        return unsigned - _INT4_MOD
    return unsigned


def build_lock_keys(session: Session) -> tuple[int, int]:
    """Return the two-int advisory-lock pair for this database.

    Postgres two-argument locks live in a different space from the single-key
    form, so a leftover lock from an older process cannot deadlock a current
    one. The first key is this database's catalog OID, unique in the cluster,
    so pytest worker databases do not block the API database. OID is unsigned
    32-bit; advisory-lock keys are signed int4, so values at or above 2^31 wrap
    into the negative half of the range.
    """
    logger.trace("Deriving index build lock keys")  # type: ignore[attr-defined]
    db_oid = session.scalar(
        text("SELECT oid FROM pg_database WHERE datname = current_database()")
    )
    if db_oid is None:
        logger.error("pg_database.oid for current_database() returned null")
        raise RuntimeError("Cannot derive index build lock key.")
    return _lock_key_from_oid(int(db_oid)), INDEX_BUILD_LOCK_KEY


def try_build_lock(session: Session) -> bool:
    """Acquire this database's session-level build lock, or return False."""
    db_key, resource_key = build_lock_keys(session)
    logger.debug(
        "Trying index build lock db_key=%s resource_key=%s", db_key, resource_key
    )
    got = session.scalar(
        text("SELECT pg_try_advisory_lock(:a, :b)"),
        {"a": db_key, "b": resource_key},
    )
    return bool(got)


def release_build_lock(session: Session) -> None:
    """Release this database's session-level build lock."""
    db_key, resource_key = build_lock_keys(session)
    logger.debug(
        "Releasing index build lock db_key=%s resource_key=%s", db_key, resource_key
    )
    session.scalar(
        text("SELECT pg_advisory_unlock(:a, :b)"),
        {"a": db_key, "b": resource_key},
    )


def vacuum_index_mapping(session: Session) -> None:
    """``VACUUM (ANALYZE) index_mapping`` on an autocommit connection.

    ``VACUUM`` cannot run inside a transaction. Callers must have already
    committed the deletes being reclaimed. A separate pooled connection is
    used so this does not need the advisory lock and cannot see an open
    worker transaction.
    """
    logger.debug("Vacuuming index_mapping")
    bind = session.get_bind()
    engine = bind if isinstance(bind, Engine) else bind.engine
    try:
        with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
            conn.execute(text("VACUUM (ANALYZE) index_mapping"))
    except Exception:
        logger.error("VACUUM index_mapping failed", exc_info=True)


class IndexWorker:
    """Daemon thread that claims builds, reclaims rows, and sweeps fingerprints."""

    def __init__(self) -> None:
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._last_sweep = 0.0

    def start(self) -> None:
        """Run crash recovery once, then poll until ``stop`` is called."""
        logger.debug("Starting index worker thread")
        factory = get_session_factory()
        session = factory()
        try:
            recover_orphaned_builds(session)
            purge_orphan_mappings(session)
            session.commit()
        except Exception:
            logger.error("Index worker startup recovery failed", exc_info=True)
            session.rollback()
        finally:
            session.close()
        self._thread = threading.Thread(
            target=self._run, name="frvt-index-worker", daemon=True
        )
        self._thread.start()

    def stop(self) -> None:
        """Signal the loop to exit and wait briefly for a clean shutdown."""
        logger.debug("Stopping index worker thread")
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=5.0)

    def _run(self) -> None:
        """Poll until stopped; never let an iteration kill the thread."""
        while not self._stop.is_set():
            try:
                self._iterate()
            except Exception:
                logger.error("Index worker iteration failed", exc_info=True)
            self._stop.wait(get_settings().index_worker_poll_seconds)

    def _iterate(self) -> None:
        """One lock-protected pass over reclaim, the queue, and maybe a sweep."""
        settings = get_settings()
        session = get_session_factory()()
        locked = False
        try:
            locked = try_build_lock(session)
            if not locked:
                return
            step = drain_reclaim(session, chunk_size=settings.index_reclaim_chunk_size)
            session.commit()
            if step.completed and step.deleted > 0:
                vacuum_index_mapping(session)
            worked = process_next_index(
                session, chunk_size=settings.index_build_chunk_size
            )
            if not worked:
                now = time.monotonic()
                if now - self._last_sweep >= settings.index_fingerprint_sweep_seconds:
                    sweep_fingerprints(session)
                    session.commit()
                    self._last_sweep = now
        finally:
            if locked:
                try:
                    release_build_lock(session)
                    session.commit()
                except Exception:
                    logger.error("Failed releasing index build lock", exc_info=True)
            session.close()
