"""Multi-hop Chain Test Bed regression tests (Phases 9–11 gate)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from frvt.ingest.burrito_validate import validate_ingredient
from frvt.testops.fixtures.api_setup import seed_multihop_chain_testbed
from frvt.testops.fixtures.multihop_chain_fixtures import (
    NONTRIVIAL_HOP_CASES,
    PARITY_CASES,
    build_spanish_org_zip,
    engdemo_ingredient,
    infer_spanish_eng_ingredient,
    spanish_org_ref_ingredient,
    verify_parity_pair,
)
from frvt.testops.http_client import basic_auth_header

pytestmark = pytest.mark.multihop


def _auth() -> dict[str, str]:
    return basic_auth_header()


def _resolve(
    api_client: TestClient,
    *,
    spanish_id: str,
    american_id: str,
    ref: str,
    from_scheme: str,
    to_scheme: str,
) -> dict:
    params = {
        "from_translation": spanish_id,
        "to_translation": american_id,
        "ref": ref,
        "from_versification": from_scheme,
        "to_versification": to_scheme,
    }
    response = api_client.get("/api/resolve", headers=_auth(), params=params)
    assert response.status_code == 200, response.text
    return response.json()


@pytest.fixture
def multihop_ctx(api_client: TestClient, seeded_session) -> dict:
    return seed_multihop_chain_testbed(api_client, seeded_session)


def test_multihop_ingredients_validate() -> None:
    for ingredient in (
        engdemo_ingredient(),
        spanish_org_ref_ingredient(),
        infer_spanish_eng_ingredient(
            spanish_org_ref_ingredient(),
            engdemo_ingredient(),
        ),
    ):
        assert validate_ingredient(ingredient) == ()


def test_infer_spanish_eng_produces_nontrivial_hop1_rows() -> None:
    hop1 = infer_spanish_eng_ingredient(
        spanish_org_ref_ingredient(),
        engdemo_ingredient(),
    )
    nontrivial = [pair for pair in hop1["mappedVerses"].items() if pair[0] != pair[1]]
    assert len(nontrivial) >= 3


def test_verify_parity_pair_unit() -> None:
    baseline = {
        "relation": "shift",
        "target_spans": [{"book": "PSA", "chapter": 3, "verse": 2, "part": None}],
    }
    assert verify_parity_pair(baseline, dict(baseline)) == []
    mismatch = {"relation": "one_to_one", "target_spans": baseline["target_spans"]}
    assert verify_parity_pair(baseline, mismatch)


def test_spanish_org_zip_includes_act_24_6_and_7() -> None:
    """Spanish sample USX uses hyphen milestones (ACT 24:6-7); zip must split them."""
    import io
    import zipfile

    from frvt.ingest.usx_parse import parse_usx

    with zipfile.ZipFile(io.BytesIO(build_spanish_org_zip())) as archive:
        act_usx = archive.read("release/USX_1/ACT.usx").decode("utf-8")
    verses = {
        span.verse
        for span in parse_usx(act_usx)
        if span.book == "ACT" and span.chapter == 24
    }
    assert verses >= {6, 7, 8}


def test_multihop_seed_creates_engdemo_translation(
    api_client: TestClient,
    seeded_session,
) -> None:
    ctx = seed_multihop_chain_testbed(api_client, seeded_session)
    response = api_client.get(
        f"/api/translations/{ctx['engdemo_translation_id']}",
        headers=_auth(),
    )
    assert response.status_code == 200
    assert response.json()["name"] == "engdemo"


def test_multihop_engdemo_preferred_scheme(
    api_client: TestClient,
    seeded_session,
) -> None:
    ctx = seed_multihop_chain_testbed(api_client, seeded_session)
    response = api_client.get(
        f"/api/translations/{ctx['engdemo_translation_id']}/versifications",
        headers=_auth(),
    )
    assert response.status_code == 200
    rows = response.json()
    preferred = [row for row in rows if row["preferred"]]
    assert len(preferred) == 1
    assert preferred[0]["scheme_id"] == ctx["engdemo_scheme_id"]


def test_spanish_eng_based_on_engdemo(
    api_client: TestClient,
    seeded_session,
) -> None:
    ctx = seed_multihop_chain_testbed(api_client, seeded_session)
    response = api_client.get(
        f"/api/versifications/{ctx['spanish_eng_scheme_id']}",
        headers=_auth(),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["based_on_name"] == "engdemo"
    assert body["based_on_id"] == ctx["engdemo_translation_id"]


@pytest.mark.parametrize("case", PARITY_CASES, ids=lambda c: c.id)
def test_multihop_parity_cases(
    api_client: TestClient,
    multihop_ctx: dict,
    case,
) -> None:
    baseline = _resolve(
        api_client,
        spanish_id=multihop_ctx["spanish_translation_id"],
        american_id=multihop_ctx["american_translation_id"],
        ref=case.ref,
        from_scheme=multihop_ctx["spanish_org_ref_scheme_id"],
        to_scheme=multihop_ctx["org_scheme_id"],
    )
    chain = _resolve(
        api_client,
        spanish_id=multihop_ctx["spanish_translation_id"],
        american_id=multihop_ctx["american_translation_id"],
        ref=case.ref,
        from_scheme=multihop_ctx["spanish_eng_scheme_id"],
        to_scheme=multihop_ctx["org_scheme_id"],
    )
    errors = verify_parity_pair(baseline, chain)
    assert errors == [], errors


def test_multihop_nontrivial_hops(
    api_client: TestClient,
    multihop_ctx: dict,
) -> None:
    for case_id in NONTRIVIAL_HOP_CASES:
        case = next(item for item in PARITY_CASES if item.id == case_id)
        chain = _resolve(
            api_client,
            spanish_id=multihop_ctx["spanish_translation_id"],
            american_id=multihop_ctx["american_translation_id"],
            ref=case.ref,
            from_scheme=multihop_ctx["spanish_eng_scheme_id"],
            to_scheme=multihop_ctx["org_scheme_id"],
        )
        assert chain["relation"] in {
            "one_to_one",
            "shift",
            "renumber",
            "exclude",
        }, case_id
