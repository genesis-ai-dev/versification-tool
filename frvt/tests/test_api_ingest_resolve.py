"""HTTP contract tests for project and versification ingest (Required)."""

from __future__ import annotations

import io
import zipfile
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
from frvt.testops.sample_assets import (
    copenhagen_json,
    paratext_vrs,
    primary_project_zip,
    read_bytes,
    repo_root,
)
from sqlalchemy import func, select
from sqlalchemy.orm import Session

_METADATA_EN = (
    "<DBLMetadata><identification><name>Metadata English Project</name></identification>"
    "<language><iso>eng</iso><ldml>en</ldml>"
    "<scriptDirection>LTR</scriptDirection></language></DBLMetadata>"
)
_MINIMAL_USX = (
    "<usx version='3.0'><book code='GEN'/><chapter number='1'/>"
    "<verse number='1' sid='GEN 1:1'/>In the beginning.<verse eid='GEN 1:1'/>"
    "</usx>"
)


def _minimal_project_zip(*, metadata_xml: str | None = None) -> bytes:
    """Build a tiny ingestable project zip with optional metadata."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        if metadata_xml is not None:
            archive.writestr("metadata.xml", metadata_xml)
        archive.writestr("release/USX_1/GEN.usx", _MINIMAL_USX)
        archive.writestr("release/versification.vrs", "GEN 1:31\n")
    return buffer.getvalue()


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
def test_project_missing_name_and_language_400(api_client: TestClient) -> None:
    """Ingest without metadata or form name/language returns 400."""
    response = api_client.post(
        "/api/ingest/project",
        headers=_auth(),
        files={
            "file": (
                "project.zip",
                _minimal_project_zip(metadata_xml=None),
                "application/zip",
            )
        },
    )
    assert response.status_code == 400
    body = response.json()
    assert_error_envelope(body, code="bad_request")
    fields = {error["field"] for error in body.get("errors", [])}
    assert "name" in fields
    assert "language" in fields


@pytest.mark.phase3
@pytest.mark.ingest
def test_project_metadata_name_authoritative(api_client: TestClient) -> None:
    """Metadata translation name overrides the form when both are present."""
    response = api_client.post(
        "/api/ingest/project",
        headers=_auth(),
        data={"name": "Form Override", "language": "en"},
        files={
            "file": (
                "project.zip",
                _minimal_project_zip(metadata_xml=_METADATA_EN),
                "application/zip",
            )
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["translation"]["name"] == "Metadata English Project"
    assert body["versification"]["name"] == "Metadata English Project"


@pytest.mark.phase3
@pytest.mark.ingest
def test_project_metadata_name_from_zip_only(api_client: TestClient) -> None:
    """Metadata supplies translation name when the form omits it."""
    response = api_client.post(
        "/api/ingest/project",
        headers=_auth(),
        files={
            "file": (
                "project.zip",
                _minimal_project_zip(metadata_xml=_METADATA_EN),
                "application/zip",
            )
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["translation"]["name"] == "Metadata English Project"
    assert body["translation"]["language"] == "en"


@pytest.mark.phase3
@pytest.mark.ingest
def test_project_metadata_language_authoritative(api_client: TestClient) -> None:
    """Metadata language overrides the form when both are present."""
    name = f"MetaLang-{uuid4().hex[:8]}"
    response = api_client.post(
        "/api/ingest/project",
        headers=_auth(),
        data={"name": name, "language": "es"},
        files={
            "file": (
                "project.zip",
                _minimal_project_zip(metadata_xml=_METADATA_EN),
                "application/zip",
            )
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["translation"]["language"] == "en"
    assert body["translation"]["text_direction"] == "ltr"
    assert body["versification"]["name"] == "Metadata English Project"


@pytest.mark.phase3
@pytest.mark.ingest
def test_project_form_language_fallback(api_client: TestClient) -> None:
    """Form language is used when metadata omits a language code."""
    name = f"FormLang-{uuid4().hex[:8]}"
    response = api_client.post(
        "/api/ingest/project",
        headers=_auth(),
        data={"name": name, "language": "fr"},
        files={
            "file": (
                "project.zip",
                _minimal_project_zip(metadata_xml=None),
                "application/zip",
            )
        },
    )
    assert response.status_code == 201, response.text
    assert response.json()["translation"]["language"] == "fr"


@pytest.mark.phase3
@pytest.mark.ingest
def test_project_missing_language_400(api_client: TestClient) -> None:
    """Ingest without metadata language or form language returns 400."""
    response = api_client.post(
        "/api/ingest/project",
        headers=_auth(),
        data={"name": f"NoLang-{uuid4().hex[:8]}"},
        files={
            "file": (
                "project.zip",
                _minimal_project_zip(metadata_xml=None),
                "application/zip",
            )
        },
    )
    assert response.status_code == 400
    assert_error_envelope(response.json(), code="bad_request")


@pytest.mark.phase3
@pytest.mark.ingest
def test_project_arabic_sample_rtl(api_client: TestClient) -> None:
    """Arabic sample zip persists rtl text_direction from metadata."""
    zip_path = repo_root() / "research" / "SampleTranslations" / "biblica-arabic-1.zip"
    if not zip_path.is_file():
        pytest.skip("Arabic sample zip not available")
    name = f"Arabic-{uuid4().hex[:8]}"
    with zip_path.open("rb") as handle:
        response = api_client.post(
            "/api/ingest/project",
            headers=_auth(),
            data={"name": name},
            files={"file": (zip_path.name, handle, "application/zip")},
        )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["translation"]["text_direction"] == "rtl"
    assert body["translation"]["language"] == "arb"
    assert body["versification"]["name"] == body["translation"]["name"]


@pytest.mark.phase3
@pytest.mark.ingest
def test_project_scheme_name_matches_translation_name(api_client: TestClient) -> None:
    """Ingested versification scheme uses the project translation name."""
    name = f"SchemeName-{uuid4().hex[:8]}"
    with primary_project_zip().open("rb") as handle:
        response = api_client.post(
            "/api/ingest/project",
            headers=_auth(),
            data={"name": name},
            files={"file": (primary_project_zip().name, handle, "application/zip")},
        )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["versification"]["name"] == body["translation"]["name"]
    assert body["versification"]["name"] != "versification"
