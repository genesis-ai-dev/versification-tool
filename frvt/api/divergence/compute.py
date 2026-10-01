"""Run the engine for one report and store the payload text."""

from __future__ import annotations

import json
import time
from collections.abc import Callable
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from frvt.api.divergence.inputs import LoadedSide, load_org, load_side, shared_root
from frvt.api.divergence.keys import ReportKey
from frvt.api.divergence.registry import (
    STAGES,
    mark_failed,
    mark_progress,
    mark_ready,
    same_fingerprint,
)
from frvt.api.logging_config import get_logger
from frvt.api.models.divergence import DivergenceReport
from frvt.divergence.report import build_comparison
from frvt.divergence.taxonomy import ENGINE_VERSION

logger = get_logger(__name__)


class _StageProgress:
    """Adapts a stage callback to the engine's progress protocol."""

    def __init__(self, callback: Callable[[str, int, int], None]) -> None:
        self._callback = callback

    def advance(self, stage: str, completed: int, total: int) -> None:
        """Forward one stage boundary to the report row."""
        self._callback(stage, completed, total)


def compute_report(session: Session, report_id: object) -> None:
    """Compute one report in the caller's session and commit progress along the way.

    Failures are stored on the row. They are not re-raised, so a runner thread
    can continue with the next job.
    """
    logger.debug("Computing divergence report id=%s", report_id)
    row = session.get(DivergenceReport, report_id)
    if row is None:
        logger.error("Divergence report %s disappeared before compute", report_id)
        return
    expected = row.fingerprint
    key = ReportKey(
        from_translation_id=row.from_translation_id,
        from_scheme_id=row.from_scheme_id,
        to_translation_id=row.to_translation_id,
        to_scheme_id=row.to_scheme_id,
    )
    try:
        mark_progress(session, row.id, stage="loading", completed=0, total=len(STAGES))
        session.commit()
        last_commit = time.monotonic()

        def _progress(stage: str, completed: int, total: int) -> None:
            nonlocal last_commit
            mark_progress(
                session, row.id, stage=stage, completed=completed, total=total
            )
            now = time.monotonic()
            if now - last_commit >= 1:
                session.commit()
                last_commit = now

        root = shared_root(session, key.from_scheme_id, key.to_scheme_id)
        left = load_side(
            session,
            translation_id=key.from_translation_id,
            scheme_id=key.from_scheme_id,
            root=root,
        )
        right = load_side(
            session,
            translation_id=key.to_translation_id,
            scheme_id=key.to_scheme_id,
            root=root,
        )
        org = load_org(session, root)
        payload = build_comparison(
            left.scheme,
            right.scheme,
            org,
            mode="texts" if left.text_facts or right.text_facts else "schemes",
            note=_note(left, right),
            progress=_StageProgress(_progress),
        )
        payload["sides"] = [
            ["a", left.scheme.label, left.fidelity, left.multi_target, left.text_facts],
            [
                "b",
                right.scheme.label,
                right.fidelity,
                right.multi_target,
                right.text_facts,
            ],
        ]
        payload["computedAt"] = datetime.now(UTC).isoformat()
        payload["engineVersion"] = ENGINE_VERSION
        if not same_fingerprint(session, row.id, expected):
            logger.debug("Divergence report %s changed before it was stored", report_id)
            return
        mark_ready(session, row.id, json.dumps(payload, separators=(",", ":")))
        session.commit()
        logger.debug("Divergence report %s ready", report_id)
    except Exception as exc:
        logger.error("Divergence compute failed id=%s", report_id, exc_info=True)
        session.rollback()
        if same_fingerprint(session, row.id, expected):
            mark_failed(session, row.id, str(exc))
            session.commit()


def _note(left: LoadedSide, right: LoadedSide) -> str:
    """Assemble the provenance sentences the dialog shows under the summary."""
    parts = ["Texts mode." if left.text_facts or right.text_facts else "Schemes mode."]
    for side in (left, right):
        sentence = _side_note(side)
        if sentence:
            parts.append(sentence)
    return " ".join(parts)


def _side_note(side: LoadedSide) -> str:
    """One side's source sentence, or empty when the supplement adds no lines."""
    name = side.scheme.label
    if side.multi_target and side.supplement_lines:
        return f"{name} includes multi-target lines from its source file."
    if side.multi_target:
        return ""
    if side.fidelity == "source":
        return (
            f"{name} has no multi-target source lines, so merges, splits, and "
            "segments that involve it are approximate."
        )
    return (
        f"{name} was stored before its original file was kept, so segment and "
        "multi-target detail may be missing. Attach the original file with "
        "PUT /api/versifications/{id}/source."
    )
