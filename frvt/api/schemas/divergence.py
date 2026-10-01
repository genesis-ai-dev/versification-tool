"""Request and response models for divergence reports."""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel


class DivergenceRequest(BaseModel):
    """Body of ``POST /api/divergence/reports``."""

    # Translation shown as side A.
    from_translation_id: UUID
    # Translation shown as side B.
    to_translation_id: UUID
    # Optional versification override for side A. Absent uses the preferred scheme.
    from_scheme_id: UUID | None = None
    # Optional versification override for side B.
    to_scheme_id: UUID | None = None


class DivergenceStatusOut(BaseModel):
    """Progress payload for one report. ``payload`` is a different route."""

    # Report id.
    id: UUID
    # ``pending``, ``running``, ``ready``, or ``failed``.
    status: str
    # True when a running report has not heartbeated within the stale limit.
    stalled: bool
    # Current stage name, or null before work starts.
    stage: str | None
    # 1-based stage number. Zero before work starts.
    stage_index: int
    # How many stages the pipeline has. Always 6.
    stage_count: int
    # Units finished in the current stage.
    completed: int
    # Units expected in the current stage.
    total: int
    # Failure text when status is ``failed``.
    error: str | None
