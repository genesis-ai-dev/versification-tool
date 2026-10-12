"""HTTP contracts for divergence reports. The runner is a test double."""

from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from frvt.api.divergence.runner import get_runner
from frvt.api.models import Translation
from frvt.testops.http_client import basic_auth_header
from sqlalchemy import select
from sqlalchemy.orm import Session


class _Runner:
    """Records submissions without starting a thread."""

    def __init__(self) -> None:
        self.calls: list[tuple[object, int]] = []

    def submit(self, report_id: object, priority: int) -> bool:
        self.calls.append((report_id, priority))
        return True


@pytest.mark.phase2
@pytest.mark.api
def test_post_commits_before_submit_and_data_conflicts(
    api_client: TestClient, seeded_session: Session
) -> None:
    """POST schedules after commit. Data is 409 until the report is ready."""
    order: list[str] = []
    original = seeded_session.commit

    def _commit() -> None:
        order.append("commit")
        original()

    seeded_session.commit = _commit  # type: ignore[method-assign]
    runner = _Runner()

    def _submit(report_id: object, priority: int) -> bool:
        order.append("submit")
        runner.calls.append((report_id, priority))
        return True

    runner.submit = _submit  # type: ignore[method-assign]
    api_client.app.dependency_overrides[get_runner] = lambda: runner
    eng = seeded_session.scalar(select(Translation).where(Translation.name == "eng"))
    rso = seeded_session.scalar(select(Translation).where(Translation.name == "rso"))
    assert eng is not None and rso is not None
    response = api_client.post(
        "/api/divergence/reports",
        headers=basic_auth_header(),
        json={"from_translation_id": str(eng.id), "to_translation_id": str(rso.id)},
    )
    assert response.status_code == 202
    assert order.index("commit") < order.index("submit")
    report_id = response.json()["id"]
    data = api_client.get(
        f"/api/divergence/reports/{report_id}/data", headers=basic_auth_header()
    )
    assert data.status_code == 409
    missing = api_client.get(
        f"/api/divergence/reports/{uuid4()}", headers=basic_auth_header()
    )
    assert missing.status_code == 404
    usage = api_client.get("/api/indexes/usage", headers=basic_auth_header())
    assert usage.status_code == 200
    assert isinstance(usage.json()["divergence_reports"], int)
