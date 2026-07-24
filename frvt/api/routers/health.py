"""Liveness endpoint that also pings the database."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from frvt.api.db import get_session
from frvt.api.errors import AppError
from frvt.api.logging_config import get_logger

logger = get_logger(__name__)

router = APIRouter(tags=["health"])


@router.get("/api/health")
def health(session: Session = Depends(get_session)) -> dict[str, str]:
    """Return ``{"status":"ok"}`` when the database answers a simple ping."""
    logger.debug("Health check requested")
    try:
        session.execute(text("SELECT 1"))
    except Exception as exc:
        logger.error("Database unavailable during health check", exc_info=True)
        raise AppError(
            503,
            "Database unavailable.",
            code="database_unavailable",
        ) from exc
    return {"status": "ok"}
