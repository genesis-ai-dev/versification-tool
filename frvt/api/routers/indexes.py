"""HTTP routes for translation index CRUD, rebuild, cancel, and usage."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from frvt.api.db import get_session
from frvt.api.indexing.registry import (
    create_index,
    delete_index,
    get_index,
    index_row_counts,
    list_indexes,
    request_cancel,
    request_rebuild,
    set_versification,
    usage_summary,
)
from frvt.api.logging_config import get_logger
from frvt.api.models import TranslationIndex
from frvt.api.schemas import (
    IndexCreate,
    IndexOut,
    IndexUpdate,
    IndexUsageOut,
    Page,
)

logger = get_logger(__name__)

router = APIRouter(tags=["indexes"])


def _to_out(session: Session, row: TranslationIndex) -> IndexOut:
    """Attach live mapping counts to an index row for the HTTP contract."""
    outbound, inbound = index_row_counts(session, row.id)
    return IndexOut(
        id=row.id,
        translation_id=row.translation_id,
        versification_id=row.scheme_id,
        versification_explicit=row.scheme_explicit,
        status=row.status,
        pending_reason=row.pending_reason,
        build_notes=row.build_notes,
        last_error=row.last_error,
        pairs_total=row.pairs_total,
        pairs_completed=row.pairs_completed,
        outbound_mappings=outbound,
        inbound_mappings=inbound,
        requested_at=row.requested_at,
        started_at=row.started_at,
        completed_at=row.completed_at,
    )


@router.get("/api/indexes", response_model=Page[IndexOut])
def list_indexes_endpoint(
    limit: int | None = Query(default=None),
    offset: int | None = Query(default=None),
    session: Session = Depends(get_session),
) -> Page[IndexOut]:
    """List translation indexes with pagination."""
    logger.debug("GET /api/indexes limit=%s offset=%s", limit, offset)
    rows, total = list_indexes(session, limit=limit, offset=offset)
    return Page[IndexOut](items=[_to_out(session, row) for row in rows], total=total)


@router.post("/api/indexes", response_model=IndexOut, status_code=201)
def create_index_endpoint(
    body: IndexCreate,
    session: Session = Depends(get_session),
) -> IndexOut:
    """Create an index and queue its cartesian build."""
    logger.debug(
        "POST /api/indexes translation=%s versification=%s",
        body.translation_id,
        body.versification_id,
    )
    row = create_index(
        session,
        translation_id=body.translation_id,
        scheme_id=body.versification_id,
    )
    return _to_out(session, row)


@router.get("/api/indexes/usage", response_model=IndexUsageOut)
def index_usage_endpoint(session: Session = Depends(get_session)) -> IndexUsageOut:
    """Return aggregate mapping-table resource consumption."""
    logger.debug("GET /api/indexes/usage")
    usage = usage_summary(session)
    return IndexUsageOut(
        total_indexes=usage.total_indexes,
        ready_indexes=usage.ready_indexes,
        mapping_rows=usage.mapping_rows,
        mapping_bytes=usage.mapping_bytes,
        reclaim_pending=usage.reclaim_pending,
    )


@router.get("/api/indexes/{index_id}", response_model=IndexOut)
def get_index_endpoint(
    index_id: UUID,
    session: Session = Depends(get_session),
) -> IndexOut:
    """Return one index including status, progress, and mapping counts."""
    logger.debug("GET /api/indexes/%s", index_id)
    return _to_out(session, get_index(session, index_id))


@router.patch("/api/indexes/{index_id}", response_model=IndexOut)
def update_index_endpoint(
    index_id: UUID,
    body: IndexUpdate,
    session: Session = Depends(get_session),
) -> IndexOut:
    """Pin the index to an explicit versification and queue a rebuild."""
    logger.debug("PATCH /api/indexes/%s", index_id)
    row = set_versification(session, index_id, body.versification_id)
    return _to_out(session, row)


@router.delete("/api/indexes/{index_id}", status_code=204)
def delete_index_endpoint(
    index_id: UUID,
    session: Session = Depends(get_session),
) -> None:
    """Remove the index immediately; mapping rows are reclaimed in the background."""
    logger.debug("DELETE /api/indexes/%s", index_id)
    delete_index(session, index_id)


@router.post(
    "/api/indexes/{index_id}/rebuild", response_model=IndexOut, status_code=202
)
def rebuild_index_endpoint(
    index_id: UUID,
    session: Session = Depends(get_session),
) -> IndexOut:
    """Queue a full rebuild from any status."""
    logger.debug("POST /api/indexes/%s/rebuild", index_id)
    return _to_out(session, request_rebuild(session, index_id))


@router.post("/api/indexes/{index_id}/cancel", response_model=IndexOut, status_code=202)
def cancel_index_endpoint(
    index_id: UUID,
    session: Session = Depends(get_session),
) -> IndexOut:
    """Request termination of a queued or running build."""
    logger.debug("POST /api/indexes/%s/cancel", index_id)
    return _to_out(session, request_cancel(session, index_id))
