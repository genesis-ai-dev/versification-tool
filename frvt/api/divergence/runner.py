"""Priority queue of divergence computes.

Dialog requests use priority 0. Precompute uses priority 1. A plain thread pool
cannot express that, and a precompute backlog would otherwise sit in front of
the report the user is waiting on.
"""

from __future__ import annotations

import itertools
import queue
import threading
from collections.abc import Callable
from typing import cast
from uuid import UUID

from fastapi import Request

from frvt.api.db import get_session_factory
from frvt.api.logging_config import get_logger

logger = get_logger(__name__)


def get_runner(request: Request) -> DivergenceRunner:
    """Return the process runner stored on the FastAPI app."""
    logger.trace("Resolving divergence runner")  # type: ignore[attr-defined]
    return cast(DivergenceRunner, request.app.state.divergence_runner)


# Lower numbers run first. Equal priorities keep insertion order.
PRIORITY_INTERACTIVE = 0
PRIORITY_PRECOMPUTE = 1


class DivergenceRunner:
    """Daemon threads draining a priority queue of report ids."""

    def __init__(
        self,
        *,
        threads: int,
        compute: Callable[[object], None] | None = None,
    ) -> None:
        """Start ``threads`` workers.

        ``compute`` replaces the database compute in tests.
        """
        self._queue: queue.PriorityQueue[tuple[int, int, UUID]] = queue.PriorityQueue()
        self._order = itertools.count()
        self._pending: set[UUID] = set()
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._compute = compute or self._compute_in_session
        self._threads = [
            threading.Thread(
                target=self._loop, name=f"frvt-divergence-{index}", daemon=True
            )
            for index in range(max(threads, 1))
        ]

    def start(self) -> None:
        """Start the worker threads. Idempotent if they are already running."""
        logger.debug("Starting divergence runner threads=%s", len(self._threads))
        for thread in self._threads:
            if not thread.is_alive():
                thread.start()

    def stop(self) -> None:
        """Ask the workers to exit once the current job finishes."""
        logger.debug("Stopping divergence runner")
        self._stop.set()
        for _thread in self._threads:
            self._queue.put((PRIORITY_PRECOMPUTE, next(self._order), UUID(int=0)))

    def submit(self, report_id: UUID, priority: int) -> bool:
        """Queue ``report_id`` unless it is already queued.

        Returns whether the id was added.
        """
        with self._lock:
            if report_id in self._pending:
                logger.debug("Divergence report %s already queued", report_id)
                return False
            self._pending.add(report_id)
        self._queue.put((priority, next(self._order), report_id))
        logger.debug("Queued divergence report %s priority=%s", report_id, priority)
        return True

    def _loop(self) -> None:
        """Pull jobs until stopped. A failing compute does not kill the thread."""
        while not self._stop.is_set():
            try:
                _priority, _order, report_id = self._queue.get(timeout=0.5)
            except queue.Empty:
                continue
            if report_id.int == 0:
                continue
            with self._lock:
                self._pending.discard(report_id)
            try:
                self._compute(report_id)
            except Exception:
                logger.error(
                    "Divergence runner job failed id=%s", report_id, exc_info=True
                )

    def _compute_in_session(self, report_id: UUID) -> None:
        """Open a session and run the report. Used when no test double is installed."""
        from frvt.api.divergence.compute import compute_report

        session = get_session_factory()()
        try:
            compute_report(session, report_id)
        finally:
            session.close()
