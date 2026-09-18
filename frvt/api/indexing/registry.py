"""Create, list, update, delete, rebuild, and cancel translation indexes."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import func, select, text
from sqlalchemy.engine import CursorResult
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from frvt.api.errors import AppError
from frvt.api.logging_config import get_logger
from frvt.api.models import (
    INDEX_STATUS_BUILDING,
    INDEX_STATUS_CANCELLED,
    INDEX_STATUS_PENDING,
    INDEX_STATUS_READY,
    IndexMapping,
    IndexReclaim,
    TranslationIndex,
)
from frvt.api.scheme_select import (
    batch_scheme_ref,
    clamp_page,
    require_translation,
    selected_scheme_ref,
)

logger = get_logger(__name__)


@dataclass(frozen=True)
class IndexUsage:
    """Aggregate storage figures for the mapping table and index registry."""

    # All index rows, any status.
    total_indexes: int
    # Indexes the read path is allowed to consult.
    ready_indexes: int
    # Stored mapping rows across every pair.
    mapping_rows: int
    # On-disk size of ``index_mapping`` including its indexes, in bytes.
    mapping_bytes: int
    # Deleted indexes whose mapping rows are still awaiting cleanup.
    reclaim_pending: int


def create_index(
    session: Session,
    *,
    translation_id: UUID,
    scheme_id: UUID | None = None,
) -> TranslationIndex:
    """Queue a new index for the translation and resolved versification.

    Raises ``AppError`` ``404`` / ``409`` from translation and scheme checks, and
    ``409 conflict`` when that combination is already indexed.
    """
    logger.debug("Creating index translation=%s scheme=%s", translation_id, scheme_id)
    require_translation(session, translation_id)
    if scheme_id is not None:
        scheme = selected_scheme_ref(session, translation_id, scheme_id)
        explicit = True
    else:
        scheme = batch_scheme_ref(session, translation_id, None)
        explicit = False
    existing = session.scalar(
        select(TranslationIndex).where(
            TranslationIndex.translation_id == translation_id,
            TranslationIndex.scheme_id == scheme.scheme_id,
        )
    )
    if existing is not None:
        raise AppError(
            409,
            "An index already exists for that translation and versification.",
            code="conflict",
        )
    row = TranslationIndex(
        translation_id=translation_id,
        scheme_id=scheme.scheme_id,
        scheme_explicit=explicit,
        status=INDEX_STATUS_PENDING,
        pending_reason="created",
    )
    session.add(row)
    try:
        session.flush()
    except IntegrityError as exc:
        logger.error("Duplicate index pair on insert", exc_info=True)
        raise AppError(
            409,
            "An index already exists for that translation and versification.",
            code="conflict",
        ) from exc
    return row


def list_indexes(
    session: Session, *, limit: int | None, offset: int | None
) -> tuple[list[TranslationIndex], int]:
    """Return a page of indexes and the unpaged total."""
    logger.trace("Listing indexes limit=%s offset=%s", limit, offset)  # type: ignore[attr-defined]
    page_limit, page_offset = clamp_page(limit, offset)
    total = session.scalar(select(func.count()).select_from(TranslationIndex))
    rows = session.scalars(
        select(TranslationIndex)
        .order_by(TranslationIndex.created_at)
        .limit(page_limit)
        .offset(page_offset)
    ).all()
    return list(rows), int(total or 0)


def get_index(session: Session, index_id: UUID) -> TranslationIndex:
    """Load one index or raise ``404 not_found``."""
    logger.trace("Loading index id=%s", index_id)  # type: ignore[attr-defined]
    row = session.get(TranslationIndex, index_id)
    if row is None:
        raise AppError(404, f"Index {index_id} not found.", code="not_found")
    return row


def set_versification(
    session: Session, index_id: UUID, scheme_id: UUID
) -> TranslationIndex:
    """Pin the index to an explicit versification and queue a rebuild.

    Raises ``409 conflict`` when another index already occupies the resulting pair.
    """
    logger.debug("Setting index=%s versification=%s", index_id, scheme_id)
    row = get_index(session, index_id)
    scheme = selected_scheme_ref(session, row.translation_id, scheme_id)
    clash = session.scalar(
        select(TranslationIndex).where(
            TranslationIndex.translation_id == row.translation_id,
            TranslationIndex.scheme_id == scheme.scheme_id,
            TranslationIndex.id != row.id,
        )
    )
    if clash is not None:
        raise AppError(
            409,
            "An index already exists for that translation and versification.",
            code="conflict",
        )
    row.scheme_id = scheme.scheme_id
    row.scheme_explicit = True
    row.status = INDEX_STATUS_PENDING
    row.pending_reason = "versification changed"
    row.cancel_requested = False
    row.requested_at = datetime.now(UTC)
    try:
        session.flush()
    except IntegrityError as exc:
        logger.error("Duplicate index pair on versification change", exc_info=True)
        raise AppError(
            409,
            "An index already exists for that translation and versification.",
            code="conflict",
        ) from exc
    return row


def delete_index(session: Session, index_id: UUID) -> None:
    """Remove the index row and queue its mapping rows for chunked cleanup."""
    logger.debug("Deleting index id=%s", index_id)
    row = get_index(session, index_id)
    queue_reclaim(session, [row.id])
    session.delete(row)
    session.flush()


def request_rebuild(session: Session, index_id: UUID) -> TranslationIndex:
    """Queue a full rebuild from any status, including an in-flight build."""
    logger.debug("Requesting rebuild of index id=%s", index_id)
    row = get_index(session, index_id)
    row.status = INDEX_STATUS_PENDING
    row.pending_reason = "manual rebuild"
    row.cancel_requested = False
    row.requested_at = datetime.now(UTC)
    session.flush()
    return row


def request_cancel(session: Session, index_id: UUID) -> TranslationIndex:
    """Request termination of a queued or running build.

    Pending indexes become ``cancelled`` immediately. Building indexes keep
    ``building`` until the builder's next checkpoint. Any other status is ``409``.
    """
    logger.debug("Requesting cancel of index id=%s", index_id)
    row = get_index(session, index_id)
    if row.status not in (INDEX_STATUS_PENDING, INDEX_STATUS_BUILDING):
        raise AppError(
            409,
            "Index is not pending or building.",
            code="conflict",
        )
    row.cancel_requested = True
    if row.status == INDEX_STATUS_PENDING:
        row.status = INDEX_STATUS_CANCELLED
        row.cancel_requested = False
    session.flush()
    return row


def queue_reclaim(session: Session, index_ids: list[UUID]) -> None:
    """Record index ids whose mapping rows should be deleted in the background.

    Idempotent: a second call for the same id is a no-op. Live indexes are left
    for the builder to clear; the worker skips reclaim rows whose index still
    exists so a rebuild cannot race with cleanup.
    """
    logger.debug("Queueing reclaim for %s index(es)", len(index_ids))
    for index_id in index_ids:
        if session.get(IndexReclaim, index_id) is None:
            session.add(IndexReclaim(index_id=index_id))
    session.flush()


def index_row_counts(session: Session, index_id: UUID) -> tuple[int, int]:
    """Return outbound and inbound mapping counts as two indexed queries."""
    logger.trace("Counting mapping rows for index=%s", index_id)  # type: ignore[attr-defined]
    outbound = session.scalar(
        select(func.count())
        .select_from(IndexMapping)
        .where(IndexMapping.source_index_id == index_id)
    )
    inbound = session.scalar(
        select(func.count())
        .select_from(IndexMapping)
        .where(IndexMapping.target_index_id == index_id)
    )
    return int(outbound or 0), int(inbound or 0)


def usage_summary(session: Session) -> IndexUsage:
    """Return aggregate index counts and mapping-table disk use."""
    logger.trace("Summarizing index resource usage")  # type: ignore[attr-defined]
    total = session.scalar(select(func.count()).select_from(TranslationIndex))
    ready = session.scalar(
        select(func.count())
        .select_from(TranslationIndex)
        .where(TranslationIndex.status == INDEX_STATUS_READY)
    )
    mapping_rows = session.scalar(select(func.count()).select_from(IndexMapping))
    mapping_bytes = session.scalar(
        text("SELECT pg_total_relation_size('index_mapping')")
    )
    reclaim_pending = session.scalar(select(func.count()).select_from(IndexReclaim))
    return IndexUsage(
        total_indexes=int(total or 0),
        ready_indexes=int(ready or 0),
        mapping_rows=int(mapping_rows or 0),
        mapping_bytes=int(mapping_bytes or 0),
        reclaim_pending=int(reclaim_pending or 0),
    )


def delete_mapping_chunk(session: Session, index_id: UUID, *, chunk_size: int) -> int:
    """Delete up to ``chunk_size`` mapping rows in each direction.

    Returns the number of rows deleted. Used by the builder to clear stale pairs
    and by the worker to reclaim orphans after an index is removed.
    """
    logger.debug("Deleting mapping chunk index=%s size=%s", index_id, chunk_size)
    deleted = _delete_mapping_side(
        session, IndexMapping.source_index_id, index_id, chunk_size
    )
    deleted += _delete_mapping_side(
        session, IndexMapping.target_index_id, index_id, chunk_size
    )
    return deleted


def _delete_mapping_side(
    session: Session,
    column: object,
    index_id: UUID,
    chunk_size: int,
) -> int:
    """Delete one page of mapping rows identified by ``column == index_id``.

    The page is chosen and deleted in one statement so tens of thousands of
    composite keys are never loaded into the process. Pulling a chunk into
    Python and emitting ``WHERE (a, b, c) IN (...)`` stalls the worker while
    it still holds the build lock.
    """
    side = (
        "source_index_id"
        if column is IndexMapping.source_index_id
        else "target_index_id"
    )
    result = session.execute(
        text(f"""
            DELETE FROM index_mapping AS mapping
            USING (
                SELECT source_index_id, target_index_id, source_ref
                FROM index_mapping
                WHERE {side} = :index_id
                LIMIT :chunk_size
            ) AS chunk
            WHERE mapping.source_index_id = chunk.source_index_id
              AND mapping.target_index_id = chunk.target_index_id
              AND mapping.source_ref = chunk.source_ref
            """),
        {"index_id": index_id, "chunk_size": chunk_size},
    )
    if not isinstance(result, CursorResult):
        return 0
    return int(result.rowcount or 0)
