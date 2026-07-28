"""HTTP helpers that seed translations/schemes for ingest and resolve tests."""

from __future__ import annotations

import io
import json
from typing import Any
from uuid import UUID, uuid4

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from frvt.api.logging_config import get_logger
from frvt.api.models import VerseSpan
from frvt.testops.http_client import basic_auth_header
from frvt.testops.sample_assets import primary_project_zip, read_bytes

logger = get_logger(__name__)


def ingest_primary_project(
    api_client: TestClient,
    *,
    name: str | None = None,
    language: str = "en",
) -> dict[str, Any]:
    """Ingest the primary sample project zip and return the ``201`` response body.

    Use this when a test needs a real translation with spans and a preferred
    scheme derived from the project ``.vrs``. Raises ``AssertionError`` when
    the ingest response is not successful.
    """
    zip_path = primary_project_zip()
    label = name or f"Sample-{uuid4().hex[:8]}"
    logger.debug("Ingesting primary project name=%s path=%s", label, zip_path)
    headers = basic_auth_header()
    with zip_path.open("rb") as handle:
        response = api_client.post(
            "/api/ingest/project",
            headers=headers,
            data={"name": label, "language": language},
            files={"file": (zip_path.name, handle, "application/zip")},
        )
    assert response.status_code == 201, response.text
    body = response.json()
    logger.debug(
        "Primary project ingested translation_id=%s scheme_id=%s",
        body["translation"]["id"],
        body["versification"]["id"],
    )
    return body


def ingest_project_bytes(
    api_client: TestClient,
    data: bytes,
    *,
    name: str | None = None,
    language: str = "en",
    filename: str = "project.zip",
) -> dict[str, Any]:
    """Ingest an in-memory project zip and return the ``201`` response body.

    Use for demo zips built at runtime (``build_demo_project_zip``) when no
    on-disk path exists. Raises ``AssertionError`` when ingest is rejected.
    """
    label = name or f"Project-{uuid4().hex[:8]}"
    logger.debug("Ingesting project bytes name=%s size=%s", label, len(data))
    headers = basic_auth_header()
    response = api_client.post(
        "/api/ingest/project",
        headers=headers,
        data={"name": label, "language": language},
        files={"file": (filename, io.BytesIO(data), "application/zip")},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    logger.debug(
        "Project bytes ingested translation_id=%s scheme_id=%s",
        body["translation"]["id"],
        body["versification"]["id"],
    )
    return body


def set_preferred(
    api_client: TestClient,
    translation_id: str,
    scheme_id: str,
) -> dict[str, Any]:
    """Mark ``scheme_id`` as the preferred association for ``translation_id``.

    Mirrors e2e ``setPreferredScheme``. Raises ``AssertionError`` on failure.
    """
    logger.debug("Setting preferred scheme=%s translation=%s", scheme_id, translation_id)
    response = api_client.put(
        f"/api/translations/{translation_id}/versifications/{scheme_id}/preferred",
        headers=basic_auth_header(),
    )
    assert response.status_code == 200, response.text
    return response.json()


def insert_partial_verse_span(
    session: Session,
    translation_id: str | UUID,
    *,
    book: str,
    chapter: int,
    verse: int,
    part: str,
    content: str = "[partial fixture]",
    seq: int | None = None,
) -> VerseSpan:
    """Insert a sub-verse ``VerseSpan`` row for partial-relation UI/resolve tests.

    USX ingest sets ``part=None`` for whole verses; call this after seed when a
    case needs an explicit part anchor (for example SIR ``36:13`` part ``a``).
    Commits are the caller's responsibility (pytest ``seeded_session`` rolls back).
    """
    tid = UUID(str(translation_id))
    if seq is None:
        from sqlalchemy import func, select

        current = session.scalar(
            select(func.coalesce(func.max(VerseSpan.seq), -1)).where(
                VerseSpan.translation_id == tid
            )
        )
        seq = int(current) + 1
    row = VerseSpan(
        translation_id=tid,
        seq=seq,
        book=book,
        chapter=chapter,
        verse=verse,
        part=part,
        content=content,
    )
    session.add(row)
    session.flush()
    logger.debug(
        "Inserted partial span translation=%s %s %s:%s part=%s seq=%s",
        tid,
        book,
        chapter,
        verse,
        part,
        seq,
    )
    return row


def canonical_scheme_ids(api_client: TestClient) -> dict[str, str]:
    """Return a lowercase-name → id map for bootstrap canonical schemes.

    Call after a seeded API client is ready. Raises ``AssertionError`` when the
    listing call fails.
    """
    logger.debug("Loading canonical scheme id map")
    response = api_client.get(
        "/api/versifications?canonical=true",
        headers=basic_auth_header(),
    )
    assert response.status_code == 200, response.text
    mapping = {item["name"].lower(): item["id"] for item in response.json()["items"]}
    logger.debug("Canonical schemes loaded count=%s", len(mapping))
    return mapping


def associate(
    api_client: TestClient,
    translation_id: str,
    scheme_id: str,
) -> dict[str, Any]:
    """Associate ``scheme_id`` with ``translation_id`` and return the ``201`` body.

    Raises ``AssertionError`` when association fails (for example duplicate or
    unknown ids).
    """
    logger.debug("Associating translation=%s scheme=%s", translation_id, scheme_id)
    response = api_client.post(
        f"/api/translations/{translation_id}/versifications",
        headers=basic_auth_header(),
        json={"scheme_id": scheme_id},
    )
    assert response.status_code == 201, response.text
    return response.json()


def upload_ingredient_json(
    api_client: TestClient,
    name: str,
    ingredient_dict_or_bytes: dict[str, Any] | bytes,
) -> dict[str, Any]:
    """Upload a Copenhagen ingredient JSON and return the created scheme body.

    Accepts either a dict (serialized as UTF-8 JSON) or raw bytes. Raises
    ``AssertionError`` when the upload is rejected.
    """
    if isinstance(ingredient_dict_or_bytes, dict):
        payload = json.dumps(ingredient_dict_or_bytes).encode("utf-8")
    else:
        payload = ingredient_dict_or_bytes
    filename = f"{name}.json"
    logger.debug("Uploading ingredient JSON name=%s bytes=%s", name, len(payload))
    response = api_client.post(
        "/api/versifications/upload",
        headers=basic_auth_header(),
        files={"file": (filename, payload, "application/json")},
        data={"name": name},
    )
    assert response.status_code == 201, response.text
    return response.json()


def create_translation(
    api_client: TestClient,
    *,
    name: str | None = None,
    language: str = "en",
    source_format: str = "usx",
) -> dict[str, Any]:
    """Create an empty translation shell for association/resolve error fixtures.

    Raises ``AssertionError`` when creation fails.
    """
    label = name or f"Trans-{uuid4().hex[:8]}"
    logger.debug("Creating translation name=%s", label)
    response = api_client.post(
        "/api/translations",
        headers=basic_auth_header(),
        json={
            "name": label,
            "language": language,
            "source_format": source_format,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def eng_org_resolve_context(api_client: TestClient) -> dict[str, Any]:
    """Ingest the primary project, associate eng, and return resolve pair ids.

    Returns keys: ``translation_id``, ``org_translation_id``, ``eng_id``,
    ``org_id``, ``project_scheme_id``. The org side uses the eng scheme's
    ``based_on`` translation (canonical org anchor).
    """
    logger.debug("Building eng/org resolve context")
    ingested = ingest_primary_project(api_client)
    translation_id = ingested["translation"]["id"]
    project_scheme_id = ingested["versification"]["id"]
    schemes = api_client.get(
        "/api/versifications?canonical=true",
        headers=basic_auth_header(),
    ).json()["items"]
    eng = next(item for item in schemes if item["name"].lower() == "eng")
    org = next(item for item in schemes if item["name"].lower() == "org")
    org_translation_id = eng["based_on_id"]
    assert org_translation_id
    associate(api_client, translation_id, eng["id"])
    context = {
        "translation_id": translation_id,
        "org_translation_id": org_translation_id,
        "eng_id": eng["id"],
        "org_id": org["id"],
        "project_scheme_id": project_scheme_id,
    }
    logger.debug(
        "eng/org context ready translation=%s org_translation=%s",
        translation_id,
        org_translation_id,
    )
    return context


def complementary_psalm_context(api_client: TestClient) -> dict[str, Any]:
    """Seed two org-based psalm schemes on an eng/org pair for cancel-filter tests.

    Returns keys from ``eng_org_resolve_context`` plus ``style_a_id`` and
    ``style_b_id`` for the complementary scheme overrides.
    """
    logger.debug("Building complementary psalm resolve context")
    from frvt.testops.fixtures.synthetic_schemes import (
        psalm_style_a_ingredient,
        psalm_style_b_ingredient,
    )

    context = eng_org_resolve_context(api_client)
    style_a = upload_ingredient_json(
        api_client,
        f"psalm-a-{uuid4().hex[:8]}",
        psalm_style_a_ingredient(),
    )
    style_b = upload_ingredient_json(
        api_client,
        f"psalm-b-{uuid4().hex[:8]}",
        psalm_style_b_ingredient(),
    )
    associate(api_client, context["translation_id"], style_a["id"])
    associate(api_client, context["org_translation_id"], style_b["id"])
    context["style_a_id"] = style_a["id"]
    context["style_b_id"] = style_b["id"]
    logger.debug(
        "Complementary psalm context style_a=%s style_b=%s",
        style_a["id"],
        style_b["id"],
    )
    return context


def seed_visual_demo_corpus(
    api_client: TestClient,
    session: Session,
) -> dict[str, Any]:
    """Seed Visual Demo Corpus translations, schemes, and partial spans.

    Returns translation ids, scheme id map (logical keys from verification
    cases), and ingested identity scheme ids for EN/ES.
    """
    from frvt.testops.fixtures.visual_demo_corpus import build_demo_project_zip
    from frvt.testops.fixtures.visual_demo_ingredients import SCHEME_BUILDERS

    logger.debug("Seeding visual demo corpus")
    en_body = ingest_project_bytes(
        api_client,
        build_demo_project_zip("en"),
        name="visual-demo-en",
        language="en",
    )
    es_body = ingest_project_bytes(
        api_client,
        build_demo_project_zip("es"),
        name="visual-demo-es",
        language="es",
    )
    en_id = en_body["translation"]["id"]
    es_id = es_body["translation"]["id"]
    schemes: dict[str, str] = {
        "identity-en": en_body["versification"]["id"],
        "identity-es": es_body["versification"]["id"],
    }
    logical_to_upload_name = {
        "scheme-a": "visual-demo-scheme-a",
        "scheme-b": "visual-demo-scheme-b",
        "visual-demo-lxx": "visual-demo-lxx",
        "visual-demo-synodal": "visual-demo-synodal",
        "visual-demo-nt-omit": "visual-demo-nt-omit",
        "psalm-a": "visual-demo-psalm-a",
        "psalm-b": "visual-demo-psalm-b",
    }
    for logical, upload_name in logical_to_upload_name.items():
        uploaded = upload_ingredient_json(
            api_client,
            upload_name,
            SCHEME_BUILDERS[upload_name](),
        )
        schemes[logical] = uploaded["id"]
        associate(api_client, en_id, uploaded["id"])
        associate(api_client, es_id, uploaded["id"])
    for translation_id in (en_id, es_id):
        insert_partial_verse_span(
            session,
            translation_id,
            book="SIR",
            chapter=36,
            verse=13,
            part="a",
            content="Sirach partial fixture",
        )
    return {
        "en_translation_id": en_id,
        "es_translation_id": es_id,
        "schemes": schemes,
    }


def seed_multihop_chain_testbed(
    api_client: TestClient,
    session: Session,
) -> dict[str, Any]:
    """Seed multi-hop chain test bed per plan seed order (load-bearing).

    Returns translation/scheme ids for parity resolve tests.
    """
    from frvt.testops.fixtures.multihop_chain_fixtures import (
        build_spanish_org_zip,
        engdemo_ingredient,
        infer_spanish_eng_ingredient,
        spanish_org_ref_ingredient,
    )
    from frvt.testops.fixtures.visual_demo_corpus import build_demo_project_zip

    logger.debug("Seeding multihop chain testbed")
    _ = canonical_scheme_ids(api_client)
    engdemo_translation = create_translation(
        api_client,
        name="engdemo",
        language="en",
    )
    engdemo_scheme = upload_ingredient_json(
        api_client,
        "engdemo",
        engdemo_ingredient(),
    )
    associate(api_client, engdemo_translation["id"], engdemo_scheme["id"])
    set_preferred(api_client, engdemo_translation["id"], engdemo_scheme["id"])
    spanish_body = ingest_project_bytes(
        api_client,
        build_spanish_org_zip(),
        name="spanish-org",
        language="es",
    )
    american_body = ingest_project_bytes(
        api_client,
        build_demo_project_zip("en"),
        name="american-standard-multihop",
        language="en",
    )
    org_ref = spanish_org_ref_ingredient()
    spanish_org_ref = upload_ingredient_json(
        api_client,
        "spanish-org-ref",
        org_ref,
    )
    associate(api_client, spanish_body["translation"]["id"], spanish_org_ref["id"])
    spanish_eng = upload_ingredient_json(
        api_client,
        "spanish-eng",
        infer_spanish_eng_ingredient(org_ref, engdemo_ingredient()),
    )
    associate(api_client, spanish_body["translation"]["id"], spanish_eng["id"])
    set_preferred(api_client, spanish_body["translation"]["id"], spanish_eng["id"])
    org_scheme_id = canonical_scheme_ids(api_client)["org"]
    associate(api_client, american_body["translation"]["id"], org_scheme_id)
    return {
        "spanish_translation_id": spanish_body["translation"]["id"],
        "american_translation_id": american_body["translation"]["id"],
        "engdemo_translation_id": engdemo_translation["id"],
        "engdemo_scheme_id": engdemo_scheme["id"],
        "spanish_org_ref_scheme_id": spanish_org_ref["id"],
        "spanish_eng_scheme_id": spanish_eng["id"],
        "org_scheme_id": org_scheme_id,
    }


def read_copenhagen_upload_bytes(name: str) -> bytes:
    """Return Copenhagen fixture bytes for upload tests (e.g. ``validated``)."""
    from frvt.testops.sample_assets import copenhagen_json

    path = copenhagen_json(name)
    logger.debug("Reading Copenhagen fixture name=%s", name)
    return read_bytes(path)
