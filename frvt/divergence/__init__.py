"""Pure versification divergence engine.

Import ``build_comparison`` and ``load_scheme`` from ``frvt.divergence.report``.
This package does not touch FastAPI or SQLAlchemy.
"""

from frvt.divergence.report import build_comparison, load_scheme

__all__ = ["build_comparison", "load_scheme"]
