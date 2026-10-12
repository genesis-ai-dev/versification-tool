"""Identity of one divergence report."""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True)
class ReportKey:
    """The ordered pair of translation-and-scheme sides a report is cached under."""

    # Side A translation.
    from_translation_id: UUID
    # Side A versification.
    from_scheme_id: UUID
    # Side B translation.
    to_translation_id: UUID
    # Side B versification.
    to_scheme_id: UUID
