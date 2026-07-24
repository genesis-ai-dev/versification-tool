"""File ingest and versification upload endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.orm import Session

from frvt.api.config import get_settings
from frvt.api.db import get_session
from frvt.api.errors import AppError
from frvt.api.logging_config import get_logger
from frvt.api.ports.ingest_port import persist_project, persist_versification
from frvt.api.schemas import ProjectIngestOut, VersificationOut

logger = get_logger(__name__)

router = APIRouter(tags=["ingest"])


async def _read_upload(upload: UploadFile, max_bytes: int) -> bytes:
    """Read upload bytes and enforce the configured size cap."""
    data = await upload.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise AppError(413, "Upload exceeds size limit.", code="payload_too_large")
    return data


@router.post("/api/ingest/project", response_model=ProjectIngestOut, status_code=201)
async def ingest_project_endpoint(
    file: UploadFile = File(...),
    name: str = Form(...),
    language: str = Form(...),
    session: Session = Depends(get_session),
) -> ProjectIngestOut:
    """Ingest a zipped Paratext-style project (USX + required ``.vrs``)."""
    logger.debug("POST /api/ingest/project name=%s", name)
    settings = get_settings()
    data = await _read_upload(file, settings.max_upload_bytes)
    return persist_project(session, data, name=name, language=language)


@router.post(
    "/api/versifications/upload",
    response_model=VersificationOut,
    status_code=201,
)
async def upload_versification_endpoint(
    file: UploadFile = File(...),
    name: str | None = Form(default=None),
    session: Session = Depends(get_session),
) -> VersificationOut:
    """Create a scheme from a standalone ``.vrs`` or Copenhagen ``.json`` file."""
    filename = file.filename or "upload.vrs"
    logger.debug("POST /api/versifications/upload filename=%s", filename)
    settings = get_settings()
    data = await _read_upload(file, settings.max_upload_bytes)
    return persist_versification(session, data, filename=filename, name=name)
