"""Schedule divergence reports when an index becomes ready.

Runs on the divergence runner, not inside the index build, so a slow comparison
does not delay the next index.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select

from frvt.api.db import get_session_factory
from frvt.api.divergence.keys import ReportKey
from frvt.api.divergence.registry import claim_report
from frvt.api.divergence.runner import PRIORITY_PRECOMPUTE, DivergenceRunner
from frvt.api.indexing.builder import _append_note
from frvt.api.logging_config import get_logger
from frvt.api.models import INDEX_STATUS_READY, TranslationIndex

logger = get_logger(__name__)


def schedule_precompute(index_id: UUID, runner: DivergenceRunner) -> None:
    """Queue both directions against every other ready index.

    A failure is written onto the index as a build note and does not change
    the index status.
    """
    logger.debug("Scheduling divergence precompute for index=%s", index_id)
    session = get_session_factory()()
    try:
        finished = session.get(TranslationIndex, index_id)
        if finished is None or finished.status != INDEX_STATUS_READY:
            return
        others = session.scalars(
            select(TranslationIndex).where(
                TranslationIndex.status == INDEX_STATUS_READY,
                TranslationIndex.id != index_id,
            )
        ).all()
        for other in others:
            for left, right in ((finished, other), (other, finished)):
                claim = claim_report(
                    session,
                    ReportKey(
                        from_translation_id=left.translation_id,
                        from_scheme_id=left.scheme_id,
                        to_translation_id=right.translation_id,
                        to_scheme_id=right.scheme_id,
                    ),
                )
                report_id = claim.report.id
                schedule = claim.schedule
                session.commit()
                if schedule:
                    runner.submit(report_id, PRIORITY_PRECOMPUTE)
    except Exception as exc:
        logger.error("Precompute scheduling failed index=%s", index_id, exc_info=True)
        session.rollback()
        _append_note(session, index_id, f"divergence precompute failed: {exc}")
        session.commit()
    finally:
        session.close()
