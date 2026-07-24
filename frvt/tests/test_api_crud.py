"""Contract tests for translation CRUD, associations, and error envelopes."""

from __future__ import annotations

import base64
from uuid import uuid4

from fastapi.testclient import TestClient
from frvt.api.config import get_settings


def _auth() -> dict[str, str]:
    """Build HTTP Basic headers from settings."""
    settings = get_settings()
    token = base64.b64encode(
        f"{settings.basic_auth_username}:{settings.basic_auth_password}".encode()
    ).decode()
    return {"Authorization": f"Basic {token}"}


def test_anchors_excluded_from_listing(api_client: TestClient) -> None:
    """Seeded canonical anchors do not appear in GET /api/translations."""
    response = api_client.get("/api/translations", headers=_auth())
    assert response.status_code == 200
    body = response.json()
    names = {item["name"].lower() for item in body["items"]}
    assert "org" not in names
    assert "eng" not in names


def test_duplicate_name_conflict(api_client: TestClient) -> None:
    """Creating a translation with a case-insensitive duplicate name returns 409."""
    headers = _auth()
    name = f"Dup-{uuid4().hex[:8]}"
    first = api_client.post(
        "/api/translations",
        headers=headers,
        json={"name": name, "language": "en", "source_format": "usx"},
    )
    assert first.status_code == 201
    second = api_client.post(
        "/api/translations",
        headers=headers,
        json={"name": name.lower(), "language": "en", "source_format": "usx"},
    )
    assert second.status_code == 409
    assert second.json()["code"] == "conflict"


def test_missing_translation_404(api_client: TestClient) -> None:
    """GET on an unknown translation id returns the not_found envelope."""
    response = api_client.get(f"/api/translations/{uuid4()}", headers=_auth())
    assert response.status_code == 404
    assert response.json()["code"] == "not_found"


def test_delete_base_translation_conflict(api_client: TestClient) -> None:
    """Deleting org while schemes still reference it returns 409."""
    listed = api_client.get("/api/versifications?canonical=true", headers=_auth())
    assert listed.status_code == 200
    eng = next(item for item in listed.json()["items"] if item["name"].lower() == "eng")
    org_id = eng["based_on_id"]
    assert org_id is not None
    response = api_client.delete(f"/api/translations/{org_id}", headers=_auth())
    assert response.status_code == 409
    assert response.json()["code"] == "conflict"


def test_association_preferred_invariants(api_client: TestClient) -> None:
    """Second preferred clears the first; unassociated preferred and preferred delete 409."""
    headers = _auth()
    created = api_client.post(
        "/api/translations",
        headers=headers,
        json={
            "name": f"Assoc-{uuid4().hex[:8]}",
            "language": "en",
            "source_format": "usx",
        },
    )
    assert created.status_code == 201
    translation_id = created.json()["id"]
    schemes = api_client.get(
        "/api/versifications?canonical=true", headers=headers
    ).json()["items"]
    eng_id = next(s["id"] for s in schemes if s["name"].lower() == "eng")
    lxx_id = next(s["id"] for s in schemes if s["name"].lower() == "lxx")

    a1 = api_client.post(
        f"/api/translations/{translation_id}/versifications",
        headers=headers,
        json={"scheme_id": eng_id},
    )
    assert a1.status_code == 201
    assert a1.json()["preferred"] is True

    a2 = api_client.post(
        f"/api/translations/{translation_id}/versifications",
        headers=headers,
        json={"scheme_id": lxx_id},
    )
    assert a2.status_code == 201
    assert a2.json()["preferred"] is False

    preferred = api_client.put(
        f"/api/translations/{translation_id}/versifications/{lxx_id}/preferred",
        headers=headers,
    )
    assert preferred.status_code == 200
    assert preferred.json()["preferred"] is True
    listing = api_client.get(
        f"/api/translations/{translation_id}/versifications", headers=headers
    ).json()
    by_scheme = {row["scheme_id"]: row["preferred"] for row in listing}
    assert by_scheme[lxx_id] is True
    assert by_scheme[eng_id] is False

    org_id = next(s["id"] for s in schemes if s["name"].lower() == "org")
    not_assoc = api_client.put(
        f"/api/translations/{translation_id}/versifications/{org_id}/preferred",
        headers=headers,
    )
    assert not_assoc.status_code == 409

    delete_preferred = api_client.delete(
        f"/api/translations/{translation_id}/versifications/{lxx_id}",
        headers=headers,
    )
    assert delete_preferred.status_code == 409

    delete_other = api_client.delete(
        f"/api/translations/{translation_id}/versifications/{eng_id}",
        headers=headers,
    )
    assert delete_other.status_code == 204
