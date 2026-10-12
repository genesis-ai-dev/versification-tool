"""HTTP routes for divergence reports."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Response
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from frvt.api.db import get_session
from frvt.api.divergence.keys import ReportKey
from frvt.api.divergence.registry import STAGES, claim_report, is_stalled
from frvt.api.divergence.runner import (
    PRIORITY_INTERACTIVE,
    DivergenceRunner,
    get_runner,
)
from frvt.api.errors import AppError
from frvt.api.logging_config import get_logger
from frvt.api.models.divergence import DivergenceReport
from frvt.api.schemas.divergence import DivergenceRequest, DivergenceStatusOut
from frvt.api.scheme_select import require_translation, selected_scheme_ref

logger = get_logger(__name__)

router = APIRouter(tags=["divergence"])


def _status(row: DivergenceReport) -> DivergenceStatusOut:
    """Map a report row onto the status response."""
    return DivergenceStatusOut(
        id=row.id,
        status=row.status,
        stalled=is_stalled(row),
        stage=row.stage,
        stage_index=row.stage_index,
        stage_count=len(STAGES),
        completed=row.completed,
        total=row.total,
        error=row.error,
    )


@router.post("/api/divergence/reports", response_model=DivergenceStatusOut)
def create_divergence_report(
    body: DivergenceRequest,
    session: Session = Depends(get_session),
    runner: DivergenceRunner = Depends(get_runner),
) -> JSONResponse:
    """Find or create a report and schedule it when it is not already fresh."""
    logger.debug(
        "POST /api/divergence/reports from=%s to=%s",
        body.from_translation_id,
        body.to_translation_id,
    )
    require_translation(session, body.from_translation_id)
    require_translation(session, body.to_translation_id)
    left = selected_scheme_ref(session, body.from_translation_id, body.from_scheme_id)
    right = selected_scheme_ref(session, body.to_translation_id, body.to_scheme_id)
    claim = claim_report(
        session,
        ReportKey(
            from_translation_id=body.from_translation_id,
            from_scheme_id=left.scheme_id,
            to_translation_id=body.to_translation_id,
            to_scheme_id=right.scheme_id,
        ),
    )
    report_id = claim.report.id
    schedule = claim.schedule
    # The runner uses its own session, so the row must be committed first.
    session.commit()
    if schedule:
        runner.submit(report_id, PRIORITY_INTERACTIVE)
    status = session.get(DivergenceReport, report_id)
    if status is None:
        raise AppError(404, "Divergence report not found.", code="not_found")
    code = 200 if status.status == "ready" else 202
    return JSONResponse(
        status_code=code, content=_status(status).model_dump(mode="json")
    )


@router.get("/api/divergence/reports/{report_id}", response_model=DivergenceStatusOut)
def get_divergence_report(
    report_id: UUID,
    session: Session = Depends(get_session),
) -> DivergenceStatusOut:
    """Return status and progress for one report."""
    logger.debug("GET /api/divergence/reports/%s", report_id)
    row = session.get(DivergenceReport, report_id)
    if row is None:
        raise AppError(404, "Divergence report not found.", code="not_found")
    return _status(row)


@router.get("/api/divergence/reports/{report_id}/data")
def get_divergence_data(
    report_id: UUID,
    session: Session = Depends(get_session),
) -> Response:
    """Return the stored payload bytes. 409 when the report is not ready."""
    logger.debug("GET /api/divergence/reports/%s/data", report_id)
    row = session.get(DivergenceReport, report_id)
    if row is None:
        raise AppError(404, "Divergence report not found.", code="not_found")
    if row.status != "ready" or row.payload is None:
        raise AppError(409, "Divergence report is not ready.", code="conflict")
    return Response(content=row.payload, media_type="application/json")
