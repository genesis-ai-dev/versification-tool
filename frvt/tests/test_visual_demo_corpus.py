"""Visual Demo Corpus regression tests (Phases 2–7 gate)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from frvt.ingest.burrito_validate import validate_ingredient
from frvt.resolver.parse_ref import parse_ref
from frvt.testops.fixtures.api_setup import seed_visual_demo_corpus
from frvt.testops.fixtures.visual_demo_corpus import (
    build_demo_project_zip,
    demo_max_verses,
    demo_project_zip_path,
    extract_usx_books,
    identity_vrs,
    usx_book_codes,
    validate_demo_zip_bytes,
    validate_usx_mapping_alignment,
)
from frvt.testops.fixtures.visual_demo_ingredients import (
    CATEGORY_CASES,
    SCHEME_BUILDERS,
    VERIFICATION_CASES,
    VerificationCase,
)
from frvt.testops.http_client import basic_auth_header
from frvt.testops.sample_assets import repo_root

pytestmark = pytest.mark.visual_demo


def _auth() -> dict[str, str]:
    return basic_auth_header()


def _translation_for_scheme(logical: str, ctx: dict) -> str:
    """Map logical scheme key to EN or ES translation id."""
    if logical == "identity-es":
        return ctx["es_translation_id"]
    if logical == "identity-en":
        return ctx["en_translation_id"]
    if logical in (
        "psalm-a",
        "scheme-a",
        "visual-demo-lxx",
        "visual-demo-synodal",
        "visual-demo-nt-omit",
    ):
        return ctx["en_translation_id"]
    return (
        ctx["es_translation_id"]
        if logical in ("scheme-b", "psalm-b")
        else ctx["en_translation_id"]
    )


def _resolve(
    api_client: TestClient,
    ctx: dict,
    case: VerificationCase,
) -> dict:
    params: dict[str, str] = {
        "from_translation": _translation_for_scheme(case.from_scheme, ctx),
        "to_translation": _translation_for_scheme(case.to_scheme, ctx),
        "ref": case.ref,
        "from_versification": ctx["schemes"][case.from_scheme],
        "to_versification": ctx["schemes"][case.to_scheme],
    }
    if case.part is not None:
        params["part"] = case.part
    response = api_client.get("/api/resolve", headers=_auth(), params=params)
    assert response.status_code == 200, response.text
    return response.json()


@pytest.fixture
def visual_demo_ctx(api_client: TestClient, seeded_session) -> dict:
    """Seeded visual demo corpus ids for Layer B–C tests."""
    return seed_visual_demo_corpus(api_client, seeded_session)


def test_demo_zip_structure_en() -> None:
    issues = validate_demo_zip_bytes(build_demo_project_zip("en"))
    assert issues == []


def test_demo_zip_structure_es() -> None:
    issues = validate_demo_zip_bytes(build_demo_project_zip("es"))
    assert issues == []


def test_psa_verse0_present_in_built_zip() -> None:
    import io
    import zipfile

    data = build_demo_project_zip("en")
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        psa = archive.read("release/USX_1/PSA.usx").decode("utf-8")
    assert 'sid="PSA 3:0"' in psa


def test_on_disk_demo_zips_include_psa_verse0() -> None:
    """Committed asset zips must match fresh builder output for PSA verse 0."""
    import zipfile

    for language in ("en", "es"):
        path = demo_project_zip_path(language)
        with zipfile.ZipFile(path) as archive:
            psa = archive.read("release/USX_1/PSA.usx").decode("utf-8")
        assert 'sid="PSA 3:0"' in psa, language


def test_on_disk_en_act_24_7_has_visible_content() -> None:
    """ACT 24:7 in committed EN zip ingests with non-empty exclude-fixture text."""
    import zipfile

    from frvt.ingest.usx_parse import parse_usx

    path = demo_project_zip_path("en")
    with zipfile.ZipFile(path) as archive:
        act = archive.read("release/USX_1/ACT.usx").decode("utf-8")
    spans = parse_usx(act)
    verse7 = next(
        span
        for span in spans
        if span.book == "ACT" and span.chapter == 24 and span.verse == 7
    )
    assert verse7.content.strip()


def test_on_disk_es_gen_1_includes_split_verses() -> None:
    """Committed ES zip splits hyphen milestones so GEN 1:11 is ingested."""
    import zipfile

    from frvt.ingest.usx_parse import parse_usx

    path = demo_project_zip_path("es")
    with zipfile.ZipFile(path) as archive:
        gen = archive.read("release/USX_1/GEN.usx").decode("utf-8")
    assert "11-12" not in gen
    spans = parse_usx(gen)
    gen1 = {span.verse for span in spans if span.book == "GEN" and span.chapter == 1}
    assert {11, 12}.issubset(gen1)


def test_all_ingredients_validate() -> None:
    for name, builder in SCHEME_BUILDERS.items():
        issues = validate_ingredient(builder())
        assert issues == (), f"{name}: {issues}"


def test_all_ingredients_usx_aligned() -> None:
    sample = repo_root() / "research/SampleTranslations/american-standard-1.zip"
    usx = extract_usx_books(sample, {"JHN", "PSA", "GEN", "ACT"})
    usx["SIR"] = ""
    books = usx_book_codes(usx)
    # Psalm cancel fixtures reuse org-wide synthetic mappings (e.g. 1SA), not demo USX.
    skip = frozenset({"visual-demo-psalm-a", "visual-demo-psalm-b"})
    for name, builder in SCHEME_BUILDERS.items():
        if name in skip:
            continue
        errors = validate_usx_mapping_alignment(books, builder())
        assert errors == [], f"{name}: {errors}"


def test_verification_refs_parse() -> None:
    for case in VERIFICATION_CASES:
        parse_ref(case.ref)


def test_merged_verses_have_mapped_targets() -> None:
    for name, builder in SCHEME_BUILDERS.items():
        ingredient = builder()
        mapped = ingredient.get("mappedVerses", {})
        for merged in ingredient.get("mergedVerses", []):
            assert (
                merged in mapped
            ), f"{name} merged {merged!r} missing mappedVerses key"


def test_verification_case_ids_unique() -> None:
    ids = [case.id for case in VERIFICATION_CASES] + [
        case.id for case in CATEGORY_CASES
    ]
    assert len(ids) == len(set(ids))


def test_max_verses_per_chapter() -> None:
    mv = demo_max_verses()
    assert len(mv["JHN"]) == 21
    assert len(mv["PSA"]) == 150


def test_ingest_demo_en_project(api_client: TestClient, seeded_session) -> None:
    from frvt.testops.fixtures.api_setup import ingest_project_bytes

    body = ingest_project_bytes(
        api_client,
        build_demo_project_zip("en"),
        name="demo-en-ingest-test",
    )
    assert body["translation"]["id"]
    assert body["versification"]["id"]


def test_ingest_demo_es_project(api_client: TestClient, seeded_session) -> None:
    from frvt.testops.fixtures.api_setup import ingest_project_bytes

    body = ingest_project_bytes(
        api_client,
        build_demo_project_zip("es"),
        name="demo-es-ingest-test",
    )
    assert body["translation"]["id"]


def test_upload_all_demo_schemes(api_client: TestClient, seeded_session) -> None:
    from frvt.testops.fixtures.api_setup import upload_ingredient_json

    for name, builder in SCHEME_BUILDERS.items():
        body = upload_ingredient_json(api_client, name, builder())
        assert body["id"]
        detail = api_client.get(
            f"/api/versifications/{body['id']}",
            headers=_auth(),
        )
        assert detail.status_code == 200, detail.text
        ingredient = detail.json()["ingredient"]
        has_mappings = bool(ingredient.get("mappedVerses"))
        has_exclusions = bool(ingredient.get("excludedVerses"))
        assert has_mappings or has_exclusions or name == "visual-demo-nt-omit"


def test_seed_visual_demo_corpus_wiring(
    api_client: TestClient,
    seeded_session,
) -> None:
    ctx = seed_visual_demo_corpus(api_client, seeded_session)
    scheme_keys = {case.from_scheme for case in VERIFICATION_CASES} | {
        case.to_scheme for case in VERIFICATION_CASES
    }
    for key in scheme_keys:
        assert key in ctx["schemes"], key


@pytest.mark.parametrize(
    "case_id",
    [
        "C-ident",
        "C-shift",
        "C-renumber",
        "C-exclude",
        "C-merge",
        "C-split",
        "C-partial",
    ],
)
def test_resolve_verification_cases_atomic(
    api_client: TestClient,
    visual_demo_ctx: dict,
    case_id: str,
) -> None:
    case = next(item for item in VERIFICATION_CASES if item.id == case_id)
    body = _resolve(api_client, visual_demo_ctx, case)
    assert body["relation"] == case.expected_relation
    if case.expected_relation == "exclude":
        assert body["target_spans"] == []
    if case.expected_relation == "merge":
        assert len(body["source_spans"]) >= 2
        assert len(body["target_spans"]) == 1
    if case.expected_relation == "split":
        assert len(body["source_spans"]) == 1
        assert len(body["target_spans"]) >= 2
    if case.expected_relation == "partial":
        assert body["source_spans"][0].get("part") == case.part


@pytest.mark.parametrize(
    "case_id",
    ["C-shift-renum", "C-chapter-count", "C-complex", "C-cancel-jump"],
)
def test_resolve_verification_cases_composed(
    api_client: TestClient,
    visual_demo_ctx: dict,
    case_id: str,
) -> None:
    case = next(item for item in VERIFICATION_CASES if item.id == case_id)
    body = _resolve(api_client, visual_demo_ctx, case)
    assert body["relation"] == case.expected_relation
    if case_id == "C-cancel-jump":
        assert len(body["source_spans"]) == 1
        assert len(body["target_spans"]) == 1
        assert body["source_spans"][0]["ref"] == body["target_spans"][0]["ref"]
    if case_id == "C-complex":
        assert body.get("edges")
        assert body.get("source_rel")
        assert body.get("target_rel")
    if case_id == "C-chapter-count":
        assert len(body["source_spans"]) == 3
        assert len(body["target_spans"]) == 2
        assert len(body["edges"]) == 2


@pytest.mark.parametrize("case", CATEGORY_CASES, ids=lambda c: c.id)
def test_misalignment_categories(
    api_client: TestClient,
    visual_demo_ctx: dict,
    case,
) -> None:
    if case.expected_category == "cancel":
        pytest.skip("covered by test_cancel_filter_psalm_pair")
    scheme_key = case.scheme
    if scheme_key == "visual-demo-lxx":
        scheme_id = visual_demo_ctx["schemes"]["visual-demo-lxx"]
    elif scheme_key == "visual-demo-synodal":
        scheme_id = visual_demo_ctx["schemes"]["visual-demo-synodal"]
    elif scheme_key == "visual-demo-nt-omit":
        scheme_id = visual_demo_ctx["schemes"]["visual-demo-nt-omit"]
    else:
        scheme_id = visual_demo_ctx["schemes"].get(
            scheme_key, visual_demo_ctx["schemes"]["scheme-a"]
        )
    params = {
        "from_translation": visual_demo_ctx["en_translation_id"],
        "to_translation": visual_demo_ctx["es_translation_id"],
        "from_versification": scheme_id,
        "to_versification": visual_demo_ctx["schemes"]["identity-es"],
        "category": case.expected_category,
    }
    response = api_client.get(
        "/api/resolve/misalignments",
        headers=_auth(),
        params=params,
    )
    assert response.status_code == 200, response.text
    refs = {item["navigation_ref"] for item in response.json()["items"]}
    assert case.ref in refs, f"expected {case.ref!r} in {sorted(refs)}"


def test_cancel_filter_psalm_pair(
    api_client: TestClient,
    visual_demo_ctx: dict,
) -> None:
    params = {
        "from_translation": visual_demo_ctx["en_translation_id"],
        "to_translation": visual_demo_ctx["es_translation_id"],
        "from_versification": visual_demo_ctx["schemes"]["psalm-a"],
        "to_versification": visual_demo_ctx["schemes"]["psalm-b"],
    }
    response = api_client.get(
        "/api/resolve/misalignments",
        headers=_auth(),
        params=params,
    )
    assert response.status_code == 200, response.text
    refs = {item["navigation_ref"] for item in response.json()["items"]}
    assert "PSA 3:1" not in refs


def test_regenerate_zips_match_structure() -> None:
    for language in ("en", "es"):
        path = demo_project_zip_path(language)
        issues = validate_demo_zip_bytes(path.read_bytes())
        assert issues == []


def test_identity_vrs_has_no_mappings() -> None:
    text = identity_vrs(demo_max_verses())
    assert "=" not in text
