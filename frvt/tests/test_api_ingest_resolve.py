"""HTTP contract tests for project and versification ingest (Required)."""

from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from frvt.api.config import get_settings
from frvt.api.models import Translation, VerseSpan, VersificationScheme
from frvt.testops.fixtures.api_setup import ingest_primary_project
from frvt.testops.fixtures.malformed_zips import (
    oversize_bytes,
    zip_missing_usx,
    zip_missing_vrs,
    zip_usfm_only,
)
from frvt.testops.http_client import assert_error_envelope, basic_auth_header
from frvt.testops.sample_assets import copenhagen_json, paratext_vrs, read_bytes
from sqlalchemy import func, select
from sqlalchemy.orm import Session


def _auth() -> dict[str, str]:
    """Build HTTP Basic headers from settings."""
    return basic_auth_header()


@pytest.mark.phase3
@pytest.mark.ingest
def test_project_zip_ingest_happy_path(
    api_client: TestClient, seeded_session: Session
) -> None:
    """TC-INGEST-001: Project zip ingest happy path."""
    body = ingest_primary_project(api_client)
    translation = body["translation"]
    scheme = body["versification"]
    assert translation["source_format"] in {"usx", "usfm"}
    assert scheme["canonical"] is False

    assocs = api_client.get(
        f"/api/translations/{translation['id']}/versifications",
        headers=_auth(),
    )
    assert assocs.status_code == 200
    preferred = [row for row in assocs.json() if row["preferred"]]
    assert len(preferred) == 1
    assert preferred[0]["scheme_id"] == scheme["id"]

    span_count = seeded_session.scalar(
        select(func.count())
        .select_from(VerseSpan)
        .where(VerseSpan.translation_id == translation["id"])
    )
    assert span_count and span_count > 0


@pytest.mark.phase3
@pytest.mark.ingest
def test_standalone_vrs_upload(api_client: TestClient) -> None:
    """TC-INGEST-002: Standalone VRS upload."""
    headers = _auth()
    response = api_client.post(
        "/api/versifications/upload",
        headers=headers,
        files={
            "file": (
                "eng.vrs",
                read_bytes(paratext_vrs("eng")),
                "application/octet-stream",
            )
        },
        data={"name": f"Vrs-{uuid4().hex[:8]}"},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["canonical"] is False
    assert (body.get("based_on_name") or "").lower() == "org"

    # Uploaded schemes stay unassociated until an explicit associate call.
    translations = api_client.get("/api/translations", headers=headers).json()["items"]
    for item in translations:
        assocs = api_client.get(
            f"/api/translations/{item['id']}/versifications", headers=headers
        ).json()
        assert all(row["scheme_id"] != body["id"] for row in assocs)


@pytest.mark.phase3
@pytest.mark.ingest
def test_copenhagen_json_upload(api_client: TestClient) -> None:
    """TC-INGEST-003: Copenhagen JSON upload."""
    response = api_client.post(
        "/api/versifications/upload",
        headers=_auth(),
        files={
            "file": (
                "validated.json",
                read_bytes(copenhagen_json("validated")),
                "application/json",
            )
        },
        data={"name": f"Json-{uuid4().hex[:8]}"},
    )
    assert response.status_code == 201, response.text
    detail = api_client.get(
        f"/api/versifications/{response.json()['id']}", headers=_auth()
    )
    assert detail.status_code == 200
    assert "ingredient" in detail.json()
    assert detail.json()["ingredient"].get("maxVerses")


@pytest.mark.phase3
@pytest.mark.ingest
def test_project_missing_usx_rejected(
    api_client: TestClient, seeded_session: Session
) -> None:
    """TC-INGEST-010: Project zip missing the USX tree is rejected."""
    before = seeded_session.scalar(select(func.count()).select_from(Translation)) or 0
    response = api_client.post(
        "/api/ingest/project",
        headers=_auth(),
        data={"name": f"MissingUsx-{uuid4().hex[:8]}", "language": "en"},
        files={"file": ("project.zip", zip_missing_usx(), "application/zip")},
    )
    assert response.status_code == 400
    assert_error_envelope(response.json(), code="bad_request")
    assert response.json().get("errors")
    after = seeded_session.scalar(select(func.count()).select_from(Translation)) or 0
    assert after == before


@pytest.mark.phase3
@pytest.mark.ingest
def test_project_missing_vrs_rejected(
    api_client: TestClient, seeded_session: Session
) -> None:
    """TC-INGEST-011: Project zip missing the .vrs is rejected."""
    before = seeded_session.scalar(select(func.count()).select_from(Translation)) or 0
    response = api_client.post(
        "/api/ingest/project",
        headers=_auth(),
        data={"name": f"MissingVrs-{uuid4().hex[:8]}", "language": "en"},
        files={"file": ("project.zip", zip_missing_vrs(), "application/zip")},
    )
    assert response.status_code == 400
    assert_error_envelope(response.json(), code="bad_request")
    assert response.json().get("errors")
    after = seeded_session.scalar(select(func.count()).select_from(Translation)) or 0
    assert after == before


@pytest.mark.phase3
@pytest.mark.ingest
def test_invalid_ingredient_upload_rejected(
    api_client: TestClient, seeded_session: Session
) -> None:
    """TC-INGEST-012: Invalid ingredient upload is rejected."""
    before = (
        seeded_session.scalar(select(func.count()).select_from(VersificationScheme))
        or 0
    )
    response = api_client.post(
        "/api/versifications/upload",
        headers=_auth(),
        files={
            "file": (
                "bad.json",
                b'{"mappedVerses": {}}',
                "application/json",
            )
        },
    )
    assert response.status_code == 422
    assert_error_envelope(response.json(), code="validation_failed")
    assert response.json().get("errors")
    after = (
        seeded_session.scalar(select(func.count()).select_from(VersificationScheme))
        or 0
    )
    assert after == before


@pytest.mark.phase3
@pytest.mark.ingest
def test_oversize_upload_rejected(
    api_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """TC-INGEST-013: Oversize upload is rejected."""
    settings = get_settings()
    monkeypatch.setattr(settings, "max_upload_bytes", 16)
    blob = oversize_bytes(64)

    project = api_client.post(
        "/api/ingest/project",
        headers=_auth(),
        data={"name": f"Big-{uuid4().hex[:8]}", "language": "en"},
        files={"file": ("project.zip", blob, "application/zip")},
    )
    assert project.status_code == 413
    assert_error_envelope(project.json(), code="payload_too_large")

    upload = api_client.post(
        "/api/versifications/upload",
        headers=_auth(),
        files={"file": ("tiny.vrs", blob, "application/octet-stream")},
    )
    assert upload.status_code == 413
    assert_error_envelope(upload.json(), code="payload_too_large")


@pytest.mark.phase3
@pytest.mark.ingest
def test_usfm_only_project_fail_closed(
    api_client: TestClient, seeded_session: Session
) -> None:
    """TC-INGEST-017: USFM-only project path (convert or fail closed)."""
    before = seeded_session.scalar(select(func.count()).select_from(Translation)) or 0
    response = api_client.post(
        "/api/ingest/project",
        headers=_auth(),
        data={"name": f"Usfm-{uuid4().hex[:8]}", "language": "en"},
        files={"file": ("project.zip", zip_usfm_only(), "application/zip")},
    )
    # Convert-to-USX is not implemented: fail closed with a clear ingest error.
    assert response.status_code in {400, 422}
    assert_error_envelope(response.json())
    after = seeded_session.scalar(select(func.count()).select_from(Translation)) or 0
    assert after == before


@pytest.mark.phase3
@pytest.mark.ingest
def test_project_blank_metadata_422(api_client: TestClient) -> None:
    """Whitespace-only project metadata is rejected before persistence."""
    response = api_client.post(
        "/api/ingest/project",
        headers=_auth(),
        data={"name": "   ", "language": "\t"},
        files={"file": ("project.zip", b"not-needed", "application/zip")},
    )
    assert response.status_code == 422
    assert_error_envelope(response.json(), code="validation_failed")
    assert response.json().get("errors")
