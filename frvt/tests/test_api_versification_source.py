"""HTTP contracts for reading and attaching a versification source."""

from __future__ import annotations

import json
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from frvt.api.models import Translation, VersificationScheme
from frvt.ingest.source_document import derive_ingredient, make_source
from frvt.testops.http_client import basic_auth_header
from sqlalchemy import select
from sqlalchemy.orm import Session

_BODY = {
    "maxVerses": {"GEN": ["2"]},
    "mappedVerses": {},
    "excludedVerses": [],
    "partialVerses": {},
}


def _auth() -> dict[str, str]:
    """Build HTTP Basic headers from settings."""
    return basic_auth_header()


def _legacy_scheme(session: Session) -> VersificationScheme:
    """Insert a custom scheme that has an ingredient and no source row."""
    org = session.scalar(select(Translation).where(Translation.name == "org"))
    assert org is not None
    text = json.dumps(_BODY)
    derived, issues = derive_ingredient(
        make_source(
            format="copenhagen_json", document_text=text, filename="legacy.json"
        )
    )
    assert derived is not None and issues == ()
    scheme = VersificationScheme(
        name=f"legacy-{uuid4().hex[:8]}",
        based_on_name="org",
        based_on_id=org.id,
        canonical=False,
        ingredient=derived,
    )
    session.add(scheme)
    session.flush()
    return scheme


@pytest.mark.phase2
@pytest.mark.api
def test_get_source_missing_is_404(
    api_client: TestClient, seeded_session: Session
) -> None:
    """A scheme with no source row has no source document."""
    scheme = _legacy_scheme(seeded_session)
    response = api_client.get(
        f"/api/versifications/{scheme.id}/source", headers=_auth()
    )
    assert response.status_code == 404


@pytest.mark.phase2
@pytest.mark.api
def test_put_source_then_second_put_conflicts(
    api_client: TestClient, seeded_session: Session
) -> None:
    """A matching file attaches once. A second attach is a conflict."""
    scheme = _legacy_scheme(seeded_session)
    files = {"file": ("legacy.json", json.dumps(_BODY), "application/json")}
    first = api_client.put(
        f"/api/versifications/{scheme.id}/source", files=files, headers=_auth()
    )
    assert first.status_code == 200
    assert first.json()["document_text"]
    second = api_client.put(
        f"/api/versifications/{scheme.id}/source", files=files, headers=_auth()
    )
    assert second.status_code == 409
    detail = api_client.get(f"/api/versifications/{scheme.id}", headers=_auth())
    assert detail.status_code == 200
    assert detail.json()["source"]["sha256"] == first.json()["sha256"]


@pytest.mark.phase2
@pytest.mark.api
def test_put_source_mismatch_names_the_key(
    api_client: TestClient, seeded_session: Session
) -> None:
    """A file with different maxima is rejected and names maxVerses."""
    scheme = _legacy_scheme(seeded_session)
    other = dict(_BODY)
    other["maxVerses"] = {"GEN": ["3"]}
    response = api_client.put(
        f"/api/versifications/{scheme.id}/source",
        files={"file": ("other.json", json.dumps(other), "application/json")},
        headers=_auth(),
    )
    assert response.status_code == 422
    assert "maxVerses" in response.json()["detail"]


@pytest.mark.phase2
@pytest.mark.api
def test_put_source_on_canonical_conflicts(
    api_client: TestClient, seeded_session: Session
) -> None:
    """Canonical schemes already carry a packaged source."""
    scheme = seeded_session.scalar(
        select(VersificationScheme).where(VersificationScheme.name == "eng")
    )
    assert scheme is not None
    response = api_client.put(
        f"/api/versifications/{scheme.id}/source",
        files={"file": ("eng.json", json.dumps(_BODY), "application/json")},
        headers=_auth(),
    )
    assert response.status_code == 409
