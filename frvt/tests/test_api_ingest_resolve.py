"""Contract tests for ingest, resolve, and jump-menu navigation endpoints."""

from __future__ import annotations

import base64
import io
import zipfile
from pathlib import Path
from uuid import uuid4

from fastapi.testclient import TestClient
from frvt.api.config import get_settings
from frvt.api.routers.navigation import navigation_target

_SAMPLES = Path(__file__).resolve().parents[2] / "research" / "SampleTranslations"


def _auth() -> dict[str, str]:
    """Build HTTP Basic headers from settings."""
    settings = get_settings()
    token = base64.b64encode(
        f"{settings.basic_auth_username}:{settings.basic_auth_password}".encode()
    ).decode()
    return {"Authorization": f"Basic {token}"}


def test_navigation_ref_from_range() -> None:
    """Range-form source_ref yields a discrete lower-bound navigation target."""
    nav_ref, navigation = navigation_target("PSA 3:0-8")
    assert nav_ref == "PSA 3:0"
    assert navigation.book == "PSA"
    assert navigation.chapter == 3
    assert navigation.verse == 0
    assert navigation.part is None


def test_upload_size_cap_413(api_client: TestClient, monkeypatch: object) -> None:
    """Uploads over MAX_UPLOAD_BYTES return payload_too_large."""
    settings = get_settings()
    monkeypatch.setattr(settings, "max_upload_bytes", 16)  # type: ignore[attr-defined]
    response = api_client.post(
        "/api/versifications/upload",
        headers=_auth(),
        files={"file": ("tiny.vrs", b"x" * 64, "application/octet-stream")},
    )
    assert response.status_code == 413
    assert response.json()["code"] == "payload_too_large"


def test_project_missing_vrs_400(api_client: TestClient) -> None:
    """A zip without a .vrs returns 400 bad_request with errors."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as archive:
        archive.writestr("release/USX_1/GEN.usx", "<usx><book code='GEN'/></usx>")
    response = api_client.post(
        "/api/ingest/project",
        headers=_auth(),
        data={"name": f"MissingVrs-{uuid4().hex[:8]}", "language": "en"},
        files={"file": ("project.zip", buf.getvalue(), "application/zip")},
    )
    assert response.status_code == 400
    body = response.json()
    assert body["code"] == "bad_request"
    assert body.get("errors")


def test_project_blank_metadata_422(api_client: TestClient) -> None:
    """Whitespace-only project metadata is rejected before persistence."""
    response = api_client.post(
        "/api/ingest/project",
        headers=_auth(),
        data={"name": "   ", "language": "\t"},
        files={"file": ("project.zip", b"not-needed", "application/zip")},
    )
    assert response.status_code == 422
    assert response.json()["code"] == "validation_failed"
    assert response.json().get("errors")


def test_invalid_versification_422(api_client: TestClient) -> None:
    """An invalid ingredient JSON returns 422 with populated errors."""
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
    body = response.json()
    assert body["code"] == "validation_failed"
    assert body.get("errors")


def test_project_ingest_and_resolve(api_client: TestClient) -> None:
    """Uploading a sample project persists data and resolve covers key relations."""
    samples = sorted(_SAMPLES.glob("*.zip"))
    assert samples, "Expected sample translation zips under research/SampleTranslations"
    headers = _auth()
    name = f"Sample-{uuid4().hex[:8]}"
    with samples[0].open("rb") as handle:
        response = api_client.post(
            "/api/ingest/project",
            headers=headers,
            data={"name": name, "language": "en"},
            files={"file": (samples[0].name, handle, "application/zip")},
        )
    assert response.status_code == 201, response.text
    body = response.json()
    translation_id = body["translation"]["id"]

    navigation = api_client.get(
        f"/api/translations/{translation_id}/navigation",
        headers=headers,
    )
    assert navigation.status_code == 200, navigation.text
    assert any(
        book["book"] == "GEN" and 1 in book["chapters"] for book in navigation.json()
    )

    schemes = api_client.get(
        "/api/versifications?canonical=true", headers=headers
    ).json()["items"]
    eng = next(s for s in schemes if s["name"].lower() == "eng")
    org = next(s for s in schemes if s["name"].lower() == "org")
    org_translation_id = eng["based_on_id"]
    assert org_translation_id

    assoc = api_client.post(
        f"/api/translations/{translation_id}/versifications",
        headers=headers,
        json={"scheme_id": eng["id"]},
    )
    assert assoc.status_code == 201

    identity = api_client.get(
        "/api/resolve",
        headers=headers,
        params={
            "from_translation": translation_id,
            "to_translation": org_translation_id,
            "ref": "JHN 3:16",
            "from_versification": eng["id"],
            "to_versification": org["id"],
        },
    )
    assert identity.status_code == 200, identity.text
    identity_body = identity.json()
    assert identity_body["relation"] == "one_to_one"
    assert identity_body["source_spans"][0]["book"] == "JHN"
    assert identity_body["source_spans"][0]["chapter"] == 3
    assert identity_body["source_spans"][0]["verse"] == 16

    shift = api_client.get(
        "/api/resolve",
        headers=headers,
        params={
            "from_translation": translation_id,
            "to_translation": org_translation_id,
            "ref": "PSA 3:1",
            "from_versification": eng["id"],
            "to_versification": org["id"],
        },
    )
    assert shift.status_code == 200
    assert shift.json()["relation"] == "shift"
    assert shift.json()["target_spans"][0]["ref"] == "PSA 3:2"

    ranged = api_client.get(
        "/api/resolve",
        headers=headers,
        params={
            "from_translation": translation_id,
            "to_translation": org_translation_id,
            "ref": "PSA 3:0-2",
            "from_versification": eng["id"],
            "to_versification": org["id"],
        },
    )
    assert ranged.status_code == 200
    assert all("-" not in s["ref"] for s in ranged.json()["source_spans"])
    assert ranged.json()["relation"] == "shift"
    assert ranged.json()["edges"] == []

    missing = api_client.get(
        "/api/resolve",
        headers=headers,
        params={
            "from_translation": translation_id,
            "to_translation": org_translation_id,
            "ref": "GEN 1:1",
            "from_versification": "00000000-0000-0000-0000-000000000099",
        },
    )
    assert missing.status_code == 404

    not_assoc = api_client.get(
        "/api/resolve",
        headers=headers,
        params={
            "from_translation": org_translation_id,
            "to_translation": translation_id,
            "ref": "GEN 1:1",
            "from_versification": eng["id"],
        },
    )
    assert not_assoc.status_code == 409

    deltas = api_client.get(
        "/api/resolve/deltas",
        headers=headers,
        params={
            "from_translation": translation_id,
            "to_translation": org_translation_id,
            "from_versification": eng["id"],
            "to_versification": org["id"],
            "book": "PSA",
            "limit": 5,
        },
    )
    assert deltas.status_code == 200
    items = deltas.json()["items"]
    assert items
    for item in items:
        assert "navigation_ref" in item
        assert ":" in item["navigation_ref"]

    inverse_deltas = api_client.get(
        "/api/resolve/deltas",
        headers=headers,
        params={
            "from_translation": org_translation_id,
            "to_translation": translation_id,
            "from_versification": org["id"],
            "to_versification": eng["id"],
            "book": "PSA",
            "limit": 5,
        },
    )
    assert inverse_deltas.status_code == 200
    assert inverse_deltas.json()["items"]

    org_assoc = api_client.post(
        f"/api/translations/{translation_id}/versifications",
        headers=headers,
        json={"scheme_id": org["id"]},
    )
    assert org_assoc.status_code == 201
    same_scheme_deltas = api_client.get(
        "/api/resolve/deltas",
        headers=headers,
        params={
            "from_translation": translation_id,
            "to_translation": org_translation_id,
            "from_versification": org["id"],
            "to_versification": org["id"],
        },
    )
    assert same_scheme_deltas.status_code == 200
    assert same_scheme_deltas.json() == {"items": [], "total": 0}


def test_no_preferred_scheme_409(api_client: TestClient) -> None:
    """Resolve against a translation with no associations returns 409."""
    headers = _auth()
    created = api_client.post(
        "/api/translations",
        headers=headers,
        json={
            "name": f"NoPref-{uuid4().hex[:8]}",
            "language": "en",
            "source_format": "usx",
        },
    )
    translation_id = created.json()["id"]
    schemes = api_client.get(
        "/api/versifications?canonical=true", headers=headers
    ).json()["items"]
    eng = next(s for s in schemes if s["name"].lower() == "eng")
    response = api_client.get(
        "/api/resolve",
        headers=headers,
        params={
            "from_translation": translation_id,
            "to_translation": eng["based_on_id"],
            "ref": "GEN 1:1",
        },
    )
    assert response.status_code == 409
    assert response.json()["code"] == "conflict"
