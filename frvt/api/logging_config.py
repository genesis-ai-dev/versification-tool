"""Shared logging helpers including a custom TRACE level below DEBUG."""

from __future__ import annotations

import logging
import sys
from typing import Any, Final

# Numeric level for getter-style diagnostics that should sit below DEBUG.
TRACE_LEVEL: Final[int] = 5
logging.addLevelName(TRACE_LEVEL, "TRACE")


def _trace(
    self: logging.Logger,
    message: object,
    *args: object,
    **kwargs: Any,
) -> None:
    """Log ``message`` at TRACE when that level is enabled on this logger."""
    if self.isEnabledFor(TRACE_LEVEL):
        self._log(TRACE_LEVEL, str(message), args, **kwargs)


# Attach TRACE as a first-class Logger method used throughout the backend.
logging.Logger.trace = _trace  # type: ignore[attr-defined]

_CONFIGURED = False


def configure_logging(level_name: str = "DEBUG") -> None:
    """Configure the ``frvt`` logger tree once with a single stream handler."""
    global _CONFIGURED
    if _CONFIGURED:
        return

    root = logging.getLogger("frvt")
    resolved = logging.getLevelName(level_name.upper())
    if isinstance(resolved, str):
        # Unknown name falls back to DEBUG so misconfiguration remains visible.
        resolved = logging.DEBUG
    root.setLevel(resolved)
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)s [%(name)s] %(message)s")
    )
    root.addHandler(handler)
    root.propagate = False
    _CONFIGURED = True


def get_logger(name: str) -> logging.Logger:
    """Return a child of the ``frvt`` logger for the calling module."""
    if name.startswith("frvt."):
        return logging.getLogger(name)
    return logging.getLogger(f"frvt.{name}")
