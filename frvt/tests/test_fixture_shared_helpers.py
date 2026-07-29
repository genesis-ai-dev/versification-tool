"""Tests for shared fixture helpers in ``api_setup`` (Phase 1 gate)."""

from __future__ import annotations

from uuid import UUID

import pytest
from frvt.api.models import VerseSpan
from frvt.testops.fixtures.api_setup import (
    associate,
    ingest_project_bytes,
    insert_partial_verse_span,
    set_preferred,
    upload_ingredient_json,
)
from frvt.testops.fixtures.synthetic_schemes import exclude_ingredient
from frvt.testops.fixtures.verse0_project import zip_with_psalm_verse0
from sqlalchemy import select


@pytest.mark.usefixtures("seeded_session")
def test_ingest_project_bytes(api_client, seeded_session) -> None:
    """In-memory zip ingest returns translation and preferred scheme ids."""
    body = ingest_project_bytes(
        api_client,
        zip_with_psalm_verse0(),
        name="FixtureBytesIngest",
        language="en",
    )
    assert body["translation"]["name"] == "FixtureBytesIngest"
    assert body["versification"]["id"]


@pytest.mark.usefixtures("seeded_session")
def test_set_preferred(api_client, seeded_session) -> None:
    """Second association can be marked preferred via PUT."""
    ingested = ingest_project_bytes(
        api_client,
        zip_with_psalm_verse0(),
        name="PreferredFixture",
    )
    translation_id = ingested["translation"]["id"]
    primary_scheme_id = ingested["versification"]["id"]
    extra = upload_ingredient_json(
        api_client,
        "fixture-exclude",
        exclude_ingredient(),
    )
    associate(api_client, translation_id, extra["id"])
    updated = set_preferred(api_client, translation_id, extra["id"])
    assert updated["scheme_id"] == extra["id"]
    assert updated["preferred"] is True
    assert updated["scheme_id"] != primary_scheme_id


@pytest.mark.usefixtures("seeded_session")
def test_insert_partial_verse_span(api_client, seeded_session) -> None:
    """Partial part row persists and is queryable on the translation."""
    ingested = ingest_project_bytes(
        api_client,
        zip_with_psalm_verse0(),
        name="PartialSpanFixture",
    )
    translation_id = ingested["translation"]["id"]
    insert_partial_verse_span(
        seeded_session,
        translation_id,
        book="SIR",
        chapter=36,
        verse=13,
        part="a",
        content="partial anchor",
    )
    row = seeded_session.scalar(
        select(VerseSpan).where(
            VerseSpan.translation_id == UUID(translation_id),
            VerseSpan.book == "SIR",
            VerseSpan.chapter == 36,
            VerseSpan.verse == 13,
            VerseSpan.part == "a",
        )
    )
    assert row is not None
    assert row.content == "partial anchor"
