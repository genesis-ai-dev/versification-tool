"""Reference resolution endpoint."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from frvt.api.db import get_session
from frvt.api.logging_config import get_logger
from frvt.api.ports.resolver_port import resolve_reference
from frvt.api.schemas import ResolveResult

logger = get_logger(__name__)

router = APIRouter(tags=["resolve"])


@router.get("/api/resolve", response_model=ResolveResult)
def resolve_endpoint(
    from_translation: UUID = Query(...),
    to_translation: UUID = Query(...),
    ref: str = Query(...),
    part: str | None = Query(default=None),
    from_versification: UUID | None = Query(default=None),
    to_versification: UUID | None = Query(default=None),
    session: Session = Depends(get_session),
) -> ResolveResult:
    """Resolve a BCV (or bcvRange) reference between two translations' schemes."""
    logger.debug(
        "GET /api/resolve ref=%s from=%s to=%s",
        ref,
        from_translation,
        to_translation,
    )
    return resolve_reference(
        session,
        from_translation=from_translation,
        to_translation=to_translation,
        ref=ref,
        part=part,
        from_versification=from_versification,
        to_versification=to_versification,
    )
