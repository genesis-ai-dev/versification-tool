"""Contract tests for translation CRUD, associations, and error envelopes."""

from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from frvt.testops.fixtures.api_setup import ingest_primary_project
from frvt.testops.http_client import assert_error_envelope, basic_auth_header
from frvt.testops.sample_assets import copenhagen_json, read_bytes


def _auth() -> dict[str, str]:
    """Build HTTP Basic headers from settings."""
    return basic_auth_header()


@pytest.mark.phase1
@pytest.mark.server
def test_anchors_excluded_from_listing(api_client: TestClient) -> None:
    """TC-SERVER-003: Anchors are hidden from the translations list."""
    response = api_client.get("/api/translations", headers=_auth())
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 0
    assert body["items"] == []
    names = {item["name"].lower() for item in body["items"]}
    assert "org" not in names
    assert "eng" not in names


@pytest.mark.phase2
@pytest.mark.api
def test_translation_lifecycle_create_list_patch_delete(api_client: TestClient) -> None:
    """TC-API-001: Translation create / list / patch / delete lifecycle."""
    headers = _auth()
    name = f"Life-{uuid4().hex[:8]}"
    created = api_client.post(
        "/api/translations",
        headers=headers,
        json={"name": name, "language": "en", "source_format": "usx"},
    )
    assert created.status_code == 201
    translation_id = created.json()["id"]

    listed = api_client.get("/api/translations", headers=headers)
    assert listed.status_code == 200
    assert any(item["id"] == translation_id for item in listed.json()["items"])

    schemes = api_client.get(
        "/api/versifications?canonical=true", headers=headers
    ).json()["items"]
    eng_id = next(s["id"] for s in schemes if s["name"].lower() == "eng")
    assoc = api_client.post(
        f"/api/translations/{translation_id}/versifications",
        headers=headers,
        json={"scheme_id": eng_id},
    )
    assert assoc.status_code == 201

    patched = api_client.patch(
        f"/api/translations/{translation_id}",
        headers=headers,
        json={"name": f"{name}-renamed"},
    )
    assert patched.status_code == 200
    assert patched.json()["name"] == f"{name}-renamed"

    deleted = api_client.delete(f"/api/translations/{translation_id}", headers=headers)
    assert deleted.status_code == 204

    still = api_client.get(f"/api/versifications/{eng_id}", headers=headers)
    assert still.status_code == 200
    gone = api_client.get(f"/api/translations/{translation_id}", headers=headers)
    assert gone.status_code == 404


@pytest.mark.phase2
@pytest.mark.api
def test_spans_ordered_by_seq(api_client: TestClient) -> None:
    """TC-API-002: Spans returned by book/chapter ordered by seq."""
    headers = _auth()
    ingested = ingest_primary_project(api_client)
    translation_id = ingested["translation"]["id"]

    populated = api_client.get(
        f"/api/translations/{translation_id}/spans",
        headers=headers,
        params={"book": "GEN", "chapter": 1, "limit": 50},
    )
    assert populated.status_code == 200, populated.text
    items = populated.json()["items"]
    assert items
    seqs = [item["seq"] for item in items]
    assert seqs == sorted(seqs)

    unknown = api_client.get(
        f"/api/translations/{translation_id}/spans",
        headers=headers,
        params={"book": "ZZZ"},
    )
    assert unknown.status_code == 200
    assert unknown.json()["items"] == []


@pytest.mark.phase2
@pytest.mark.api
def test_duplicate_name_conflict(api_client: TestClient) -> None:
    """TC-API-011: Duplicate translation name conflicts."""
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
    assert_error_envelope(second.json(), code="conflict")


@pytest.mark.phase2
@pytest.mark.api
def test_missing_translation_404(api_client: TestClient) -> None:
    """TC-API-017: Unknown translation id on CRUD returns 404."""
    response = api_client.get(f"/api/translations/{uuid4()}", headers=_auth())
    assert response.status_code == 404
    assert_error_envelope(response.json(), code="not_found")


@pytest.mark.phase2
@pytest.mark.api
def test_delete_base_translation_conflict(api_client: TestClient) -> None:
    """TC-API-012: Deleting a translation used as based_on is blocked."""
    listed = api_client.get("/api/versifications?canonical=true", headers=_auth())
    assert listed.status_code == 200
    eng = next(item for item in listed.json()["items"] if item["name"].lower() == "eng")
    org_id = eng["based_on_id"]
    assert org_id is not None
    response = api_client.delete(f"/api/translations/{org_id}", headers=_auth())
    assert response.status_code == 409
    assert_error_envelope(response.json(), code="conflict")


@pytest.mark.phase2
@pytest.mark.api
def test_association_preferred_invariants(api_client: TestClient) -> None:
    """TC-API-004 / TC-API-013: Associate schemes and preferred delete rules."""
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


@pytest.mark.phase2
@pytest.mark.api
def test_versification_list_detail_rename(api_client: TestClient) -> None:
    """TC-API-003: Versification list / detail / rename contracts."""
    headers = _auth()
    upload = api_client.post(
        "/api/versifications/upload",
        headers=headers,
        files={
            "file": (
                "custom.json",
                read_bytes(copenhagen_json("validated")),
                "application/json",
            )
        },
        data={"name": f"Scheme-{uuid4().hex[:8]}"},
    )
    assert upload.status_code == 201, upload.text
    scheme_id = upload.json()["id"]

    listing = api_client.get("/api/versifications", headers=headers)
    assert listing.status_code == 200
    listed_item = next(i for i in listing.json()["items"] if i["id"] == scheme_id)
    assert "ingredient" not in listed_item

    detail = api_client.get(f"/api/versifications/{scheme_id}", headers=headers)
    assert detail.status_code == 200
    assert "ingredient" in detail.json()

    new_name = f"Renamed-{uuid4().hex[:8]}"
    patched = api_client.patch(
        f"/api/versifications/{scheme_id}",
        headers=headers,
        json={"name": new_name},
    )
    assert patched.status_code == 200
    assert patched.json()["name"] == new_name


@pytest.mark.phase2
@pytest.mark.api
def test_versification_list_includes_associated_translation_names(
    api_client: TestClient,
) -> None:
    """Listed schemes expose sorted non-anchor translation names per association."""
    headers = _auth()
    scheme_name = f"Scheme-{uuid4().hex[:8]}"
    upload = api_client.post(
        "/api/versifications/upload",
        headers=headers,
        files={
            "file": (
                "custom.json",
                read_bytes(copenhagen_json("validated")),
                "application/json",
            )
        },
        data={"name": scheme_name},
    )
    assert upload.status_code == 201, upload.text
    unassociated_id = upload.json()["id"]

    project_name = f"Assoc-{uuid4().hex[:8]}"
    ingested = ingest_primary_project(api_client, name=project_name)
    associated_id = ingested["versification"]["id"]

    second_translation = api_client.post(
        "/api/translations",
        headers=headers,
        json={
            "name": f"Second-{uuid4().hex[:8]}",
            "language": "en",
            "source_format": "usx",
        },
    )
    assert second_translation.status_code == 201, second_translation.text
    second_id = second_translation.json()["id"]
    second_name = second_translation.json()["name"]
    third_translation = api_client.post(
        "/api/translations",
        headers=headers,
        json={
            "name": f"Third-{uuid4().hex[:8]}",
            "language": "en",
            "source_format": "usx",
        },
    )
    assert third_translation.status_code == 201, third_translation.text
    third_id = third_translation.json()["id"]
    third_name = third_translation.json()["name"]
    for translation_id in (second_id, third_id):
        linked = api_client.post(
            f"/api/translations/{translation_id}/versifications",
            headers=headers,
            json={"scheme_id": unassociated_id},
        )
        assert linked.status_code == 201, linked.text

    listing = api_client.get("/api/versifications", headers=headers)
    assert listing.status_code == 200
    by_id = {item["id"]: item for item in listing.json()["items"]}

    assert by_id[unassociated_id]["associated_translation_names"] == sorted(
        [second_name, third_name]
    )
    assert by_id[associated_id]["associated_translation_names"] == [project_name]


@pytest.mark.phase2
@pytest.mark.api
def test_pagination_and_nested_arrays(api_client: TestClient) -> None:
    """TC-API-005: Pagination defaults, max, and bare nested arrays."""
    headers = _auth()
    created = api_client.post(
        "/api/translations",
        headers=headers,
        json={
            "name": f"Page-{uuid4().hex[:8]}",
            "language": "en",
            "source_format": "usx",
        },
    )
    translation_id = created.json()["id"]
    schemes = api_client.get(
        "/api/versifications?canonical=true", headers=headers
    ).json()["items"]
    eng_id = next(s["id"] for s in schemes if s["name"].lower() == "eng")
    api_client.post(
        f"/api/translations/{translation_id}/versifications",
        headers=headers,
        json={"scheme_id": eng_id},
    )

    page = api_client.get("/api/translations?limit=10&offset=0", headers=headers)
    assert page.status_code == 200
    body = page.json()
    assert "items" in body and "total" in body

    nested = api_client.get(
        f"/api/translations/{translation_id}/versifications", headers=headers
    )
    assert nested.status_code == 200
    assert isinstance(nested.json(), list)


@pytest.mark.phase2
@pytest.mark.api
def test_pagination_limit_above_max_rejected(api_client: TestClient) -> None:
    """TC-API-016: Pagination limit above the maximum is rejected."""
    response = api_client.get("/api/translations?limit=501", headers=_auth())
    assert response.status_code == 422
    assert_error_envelope(response.json(), code="validation_failed")


@pytest.mark.phase2
@pytest.mark.api
def test_schemes_cannot_be_created_by_plain_post(api_client: TestClient) -> None:
    """TC-API-015: Schemes cannot be created by plain POST."""
    response = api_client.post(
        "/api/versifications",
        headers=_auth(),
        json={"name": "nope", "ingredient": {}},
    )
    assert response.status_code in (405, 404, 422)


@pytest.mark.phase2
@pytest.mark.api
def test_delete_associated_scheme_blocked(api_client: TestClient) -> None:
    """TC-API-014: Deleting an associated scheme is blocked."""
    headers = _auth()
    created = api_client.post(
        "/api/translations",
        headers=headers,
        json={
            "name": f"DelSch-{uuid4().hex[:8]}",
            "language": "en",
            "source_format": "usx",
        },
    )
    translation_id = created.json()["id"]
    schemes = api_client.get(
        "/api/versifications?canonical=true", headers=headers
    ).json()["items"]
    eng_id = next(s["id"] for s in schemes if s["name"].lower() == "eng")
    api_client.post(
        f"/api/translations/{translation_id}/versifications",
        headers=headers,
        json={"scheme_id": eng_id},
    )
    response = api_client.delete(f"/api/versifications/{eng_id}", headers=headers)
    assert response.status_code == 409
    assert_error_envelope(response.json(), code="conflict")


@pytest.mark.phase2
@pytest.mark.api
def test_delete_translation_removes_coupled_preferred_scheme(
    api_client: TestClient,
) -> None:
    """TC-API-018: Ingested project delete removes same-named preferred scheme."""
    headers = _auth()
    body = ingest_primary_project(api_client)
    translation_id = body["translation"]["id"]
    scheme_id = body["versification"]["id"]
    assert body["translation"]["name"].lower() == body["versification"]["name"].lower()

    response = api_client.delete(
        f"/api/translations/{translation_id}", headers=headers
    )
    assert response.status_code == 204
    assert (
        api_client.get(f"/api/translations/{translation_id}", headers=headers).status_code
        == 404
    )
    assert (
        api_client.get(f"/api/versifications/{scheme_id}", headers=headers).status_code
        == 404
    )


@pytest.mark.phase2
@pytest.mark.api
def test_delete_translation_preserves_differently_named_preferred_scheme(
    api_client: TestClient,
) -> None:
    """TC-API-019: Preferred scheme survives when translation name differs."""
    headers = _auth()
    body = ingest_primary_project(api_client)
    translation_id = body["translation"]["id"]
    scheme_id = body["versification"]["id"]
    renamed = api_client.patch(
        f"/api/translations/{translation_id}",
        headers=headers,
        json={"name": f"Renamed-{uuid4().hex[:8]}"},
    )
    assert renamed.status_code == 200

    response = api_client.delete(
        f"/api/translations/{translation_id}", headers=headers
    )
    assert response.status_code == 204
    assert (
        api_client.get(f"/api/versifications/{scheme_id}", headers=headers).status_code
        == 200
    )
    api_client.delete(f"/api/versifications/{scheme_id}", headers=headers)


@pytest.mark.phase2
@pytest.mark.api
def test_delete_translation_preserves_shared_preferred_scheme(
    api_client: TestClient,
) -> None:
    """TC-API-020: Coupled scheme survives when another translation references it."""
    label = f"Shared-{uuid4().hex[:8]}"
    headers = _auth()
    body = ingest_primary_project(api_client, name=label)
    translation_a_id = body["translation"]["id"]
    scheme_id = body["versification"]["id"]

    other = api_client.post(
        "/api/translations",
        headers=headers,
        json={
            "name": f"Other-{uuid4().hex[:8]}",
            "language": "en",
            "source_format": "usx",
        },
    )
    assert other.status_code == 201
    translation_b_id = other.json()["id"]
    assoc = api_client.post(
        f"/api/translations/{translation_b_id}/versifications",
        headers=headers,
        json={"scheme_id": scheme_id},
    )
    assert assoc.status_code == 201

    response = api_client.delete(
        f"/api/translations/{translation_a_id}", headers=headers
    )
    assert response.status_code == 204
    assert (
        api_client.get(f"/api/versifications/{scheme_id}", headers=headers).status_code
        == 200
    )

    api_client.delete(f"/api/translations/{translation_b_id}", headers=headers)
    api_client.delete(f"/api/versifications/{scheme_id}", headers=headers)


@pytest.mark.phase2
@pytest.mark.api
def test_error_envelope_vocabulary_sample(api_client: TestClient) -> None:
    """TC-API-010: Error envelope vocabulary and status mapping (sample)."""
    missing = api_client.get(f"/api/translations/{uuid4()}", headers=_auth())
    assert missing.status_code == 404
    assert_error_envelope(missing.json(), code="not_found")
    unauth = api_client.get("/api/translations")
    assert unauth.status_code == 401
    assert_error_envelope(unauth.json(), code="unauthorized")
