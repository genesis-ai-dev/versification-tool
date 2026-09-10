"""HTTP contract tests for batch resolve range and verses endpoints."""

from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from frvt.testops.fixtures.api_setup import (
    canonical_scheme_ids,
    eng_org_resolve_context,
)
from frvt.testops.http_client import assert_error_envelope, basic_auth_header


def _auth() -> dict[str, str]:
    """Build HTTP Basic headers from settings."""
    return basic_auth_header()


def _span_refs(
    api_client: TestClient, translation_id: str, book: str, chapter: int
) -> list[str]:
    """Whole-verse BCV strings from the spans endpoint for one chapter."""
    response = api_client.get(
        f"/api/translations/{translation_id}/spans",
        headers=_auth(),
        params={"book": book, "chapter": chapter, "limit": 500},
    )
    assert response.status_code == 200, response.text
    refs: list[str] = []
    seen: set[str] = set()
    for item in response.json()["items"]:
        if item["part"] is not None:
            continue
        ref = f"{item['book']} {item['chapter']}:{item['verse']}"
        if ref not in seen:
            seen.add(ref)
            refs.append(ref)
    assert refs, "expected stored spans in the sample chapter"
    return refs


@pytest.fixture
def eng_org(api_client: TestClient) -> dict[str, str]:
    """Shared eng→org resolve pair built from the primary sample project."""
    return eng_org_resolve_context(api_client)


@pytest.mark.phase4
@pytest.mark.resolve
def test_range_happy_path_one_chapter(
    api_client: TestClient, eng_org: dict[str, str]
) -> None:
    """GET /api/resolve/range over one chapter returns a well-formed page."""
    refs = _span_refs(api_client, eng_org["translation_id"], "JHN", 3)
    response = api_client.get(
        "/api/resolve/range",
        headers=_auth(),
        params={
            "from_translation": eng_org["translation_id"],
            "to_translation": eng_org["org_translation_id"],
            "from_ref": "JHN 3",
            "to_ref": "JHN 3",
            "from_versification": eng_org["eng_id"],
            "to_versification": eng_org["org_id"],
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] >= len(refs)
    assert len(body["items"]) == body["total"]
    assert body["from_versification"] == eng_org["eng_id"]
    assert body["to_versification"] == eng_org["org_id"]
    assert body["items"][0]["ref"].startswith("JHN 3:")
    assert body["items"][0]["result"] is not None
    assert body["items"][0]["error"] is None


@pytest.mark.phase4
@pytest.mark.resolve
def test_range_honors_limit_offset(
    api_client: TestClient, eng_org: dict[str, str]
) -> None:
    """Query limit and offset slice the range expansion over the wire."""
    response = api_client.get(
        "/api/resolve/range",
        headers=_auth(),
        params={
            "from_translation": eng_org["translation_id"],
            "to_translation": eng_org["org_translation_id"],
            "from_ref": "JHN 3",
            "to_ref": "JHN 3",
            "limit": 2,
            "offset": 1,
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] >= 3
    assert len(body["items"]) == 2
    assert all(item["ref"].startswith("JHN 3:") for item in body["items"])


@pytest.mark.phase4
@pytest.mark.resolve
def test_verses_happy_path(api_client: TestClient, eng_org: dict[str, str]) -> None:
    """POST /api/resolve/verses returns one entry per requested ref."""
    refs = _span_refs(api_client, eng_org["translation_id"], "JHN", 3)[:3]
    response = api_client.post(
        "/api/resolve/verses",
        headers=_auth(),
        json={
            "from_translation": eng_org["translation_id"],
            "to_translation": eng_org["org_translation_id"],
            "refs": refs,
            "from_versification": eng_org["eng_id"],
            "to_versification": eng_org["org_id"],
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == len(refs)
    assert [item["ref"] for item in body["items"]] == refs
    assert body["from_versification"] == eng_org["eng_id"]
    assert body["to_versification"] == eng_org["org_id"]


@pytest.mark.phase4
@pytest.mark.resolve
def test_verses_serializes_error_and_result(
    api_client: TestClient, eng_org: dict[str, str]
) -> None:
    """A mixed POST keeps both result and error keys on every entry."""
    good = _span_refs(api_client, eng_org["translation_id"], "JHN", 3)[0]
    response = api_client.post(
        "/api/resolve/verses",
        headers=_auth(),
        json={
            "from_translation": eng_org["translation_id"],
            "to_translation": eng_org["org_translation_id"],
            "refs": [good, "GEN 1:1a"],
        },
    )
    assert response.status_code == 200, response.text
    items = response.json()["items"]
    assert items[0]["ref"] == good
    assert items[0]["result"] is not None
    assert items[0]["error"] is None
    assert items[1]["ref"] == "GEN 1:1a"
    assert items[1]["result"] is None
    assert items[1]["error"]["code"] == "bad_request"
    assert items[1]["error"]["detail"]


@pytest.mark.phase4
@pytest.mark.resolve
def test_range_unknown_translation_404(
    api_client: TestClient, eng_org: dict[str, str]
) -> None:
    """Unknown from_translation is 404."""
    response = api_client.get(
        "/api/resolve/range",
        headers=_auth(),
        params={
            "from_translation": str(uuid4()),
            "to_translation": eng_org["org_translation_id"],
            "from_ref": "JHN 3",
            "to_ref": "JHN 3",
        },
    )
    assert response.status_code == 404
    assert_error_envelope(response.json(), code="not_found")


@pytest.mark.phase4
@pytest.mark.resolve
def test_range_unassociated_override_409(
    api_client: TestClient, eng_org: dict[str, str]
) -> None:
    """An override scheme not associated with the translation is 409."""
    lxx_id = canonical_scheme_ids(api_client)["lxx"]
    response = api_client.get(
        "/api/resolve/range",
        headers=_auth(),
        params={
            "from_translation": eng_org["translation_id"],
            "to_translation": eng_org["org_translation_id"],
            "from_ref": "JHN 3",
            "to_ref": "JHN 3",
            "from_versification": lxx_id,
        },
    )
    assert response.status_code == 409
    assert_error_envelope(response.json(), code="conflict")


@pytest.mark.phase4
@pytest.mark.resolve
def test_range_reversed_bounds_422(
    api_client: TestClient, eng_org: dict[str, str]
) -> None:
    """to_ref before from_ref is 422."""
    response = api_client.get(
        "/api/resolve/range",
        headers=_auth(),
        params={
            "from_translation": eng_org["translation_id"],
            "to_translation": eng_org["org_translation_id"],
            "from_ref": "EXO",
            "to_ref": "GEN",
        },
    )
    assert response.status_code == 422
    assert_error_envelope(response.json(), code="validation_failed")


@pytest.mark.phase4
@pytest.mark.resolve
def test_range_malformed_from_ref_400(
    api_client: TestClient, eng_org: dict[str, str]
) -> None:
    """A truncated from_ref is 400."""
    response = api_client.get(
        "/api/resolve/range",
        headers=_auth(),
        params={
            "from_translation": eng_org["translation_id"],
            "to_translation": eng_org["org_translation_id"],
            "from_ref": "GEN 3:",
            "to_ref": "GEN 3:1",
        },
    )
    assert response.status_code == 400
    assert_error_envelope(response.json(), code="bad_request")


@pytest.mark.phase4
@pytest.mark.resolve
def test_range_limit_too_large_422(
    api_client: TestClient, eng_org: dict[str, str]
) -> None:
    """limit=501 is 422."""
    response = api_client.get(
        "/api/resolve/range",
        headers=_auth(),
        params={
            "from_translation": eng_org["translation_id"],
            "to_translation": eng_org["org_translation_id"],
            "from_ref": "JHN 3",
            "to_ref": "JHN 3",
            "limit": 501,
        },
    )
    assert response.status_code == 422
    assert_error_envelope(response.json(), code="validation_failed")


@pytest.mark.phase4
@pytest.mark.resolve
def test_verses_too_many_refs_422(
    api_client: TestClient, eng_org: dict[str, str]
) -> None:
    """More than 500 refs is 422 from request validation."""
    response = api_client.post(
        "/api/resolve/verses",
        headers=_auth(),
        json={
            "from_translation": eng_org["translation_id"],
            "to_translation": eng_org["org_translation_id"],
            "refs": ["GEN 1:1"] * 501,
        },
    )
    assert response.status_code == 422
    assert_error_envelope(response.json(), code="validation_failed")


@pytest.mark.phase4
@pytest.mark.resolve
def test_verses_empty_refs_422(api_client: TestClient, eng_org: dict[str, str]) -> None:
    """An empty refs list is 422."""
    response = api_client.post(
        "/api/resolve/verses",
        headers=_auth(),
        json={
            "from_translation": eng_org["translation_id"],
            "to_translation": eng_org["org_translation_id"],
            "refs": [],
        },
    )
    assert response.status_code == 422
    assert_error_envelope(response.json(), code="validation_failed")


@pytest.mark.phase4
@pytest.mark.resolve
def test_batch_routes_require_auth(api_client: TestClient) -> None:
    """Unauthenticated requests to both new routes return 401."""
    missing = str(uuid4())
    get_response = api_client.get(
        "/api/resolve/range",
        params={
            "from_translation": missing,
            "to_translation": missing,
            "from_ref": "GEN",
            "to_ref": "GEN",
        },
    )
    assert get_response.status_code == 401
    assert_error_envelope(get_response.json(), code="unauthorized")
    post_response = api_client.post(
        "/api/resolve/verses",
        json={
            "from_translation": missing,
            "to_translation": missing,
            "refs": ["GEN 1:1"],
        },
    )
    assert post_response.status_code == 401
    assert_error_envelope(post_response.json(), code="unauthorized")
