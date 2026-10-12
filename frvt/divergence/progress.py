"""Stage callbacks for a comparison that is still running."""

from __future__ import annotations

from typing import Protocol


class Progress(Protocol):
    """Receives stage names while a comparison is built.

    ``advance`` must not change the comparison. Callers use it to publish
    progress. ``completed`` and ``total`` are verse counts when the stage has
    them, and zero when the stage is only a boundary.
    """

    def advance(self, stage: str, completed: int, total: int) -> None:
        """Record that ``stage`` has finished ``completed`` of ``total``."""
