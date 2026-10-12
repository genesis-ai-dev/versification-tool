"""Ordering guarantees of the divergence job queue."""

from __future__ import annotations

import threading
import time
from uuid import uuid4

import pytest
from frvt.api.divergence.runner import (
    PRIORITY_INTERACTIVE,
    PRIORITY_PRECOMPUTE,
    DivergenceRunner,
)


@pytest.mark.phase6
def test_interactive_job_runs_before_queued_precompute() -> None:
    """A priority-0 job jumps ahead of priority-1 jobs that are only queued."""
    started = threading.Event()
    release = threading.Event()
    order: list[str] = []

    def compute(report_id: object) -> None:
        order.append(str(report_id))
        if not started.is_set():
            started.set()
            release.wait(timeout=2)

    runner = DivergenceRunner(threads=1, compute=compute)
    runner.start()
    first = uuid4()
    later = [uuid4() for _ in range(3)]
    interactive = uuid4()
    runner.submit(first, PRIORITY_PRECOMPUTE)
    assert started.wait(timeout=2)
    for job in later:
        runner.submit(job, PRIORITY_PRECOMPUTE)
    runner.submit(interactive, PRIORITY_INTERACTIVE)
    release.set()
    deadline = time.monotonic() + 2
    while len(order) < 5 and time.monotonic() < deadline:
        time.sleep(0.01)
    runner.stop()
    assert order[1] == str(interactive)
