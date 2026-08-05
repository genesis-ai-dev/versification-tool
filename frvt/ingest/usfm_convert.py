"""USFM→USX conversion stub (samples are USX; conversion is out of scope)."""

from __future__ import annotations

from frvt.api.logging_config import get_logger
from frvt.ingest.types import IngestIssue

logger = get_logger(__name__)


def convert_usfm_to_usx(_usfm_text: str) -> tuple[str | None, tuple[IngestIssue, ...]]:
    """Fail closed: USFM conversion is not implemented for the current milestone."""
    logger.debug("USFM conversion requested but not implemented")
    return None, (
        IngestIssue(
            kind="invalid",
            field="usfm",
            message="USFM to USX conversion is not supported",
        ),
    )
