"""Source-document contracts: re-derivation, rejection, and idempotent bootstrap."""

from __future__ import annotations

import json

import pytest
from frvt.api.bootstrap import _prepare_ingredient, seed_canonical
from frvt.api.errors import AppError
from frvt.api.models import VerseSpan, VersificationScheme
from frvt.api.models.divergence import VersificationSource
from frvt.api.ports.ingest_port import persist_project, persist_versification
from frvt.ingest.derive_combined_milestones import apply_combined_milestone_splits
from frvt.ingest.source_document import derive_ingredient, make_source
from frvt.ingest.types import ParsedSpan
from frvt.testops.sample_assets import repo_root
from sqlalchemy import select
from sqlalchemy.orm import Session

_TINY = json.dumps(
    {
        "maxVerses": {"GEN": ["2"]},
        "mappedVerses": {},
        "excludedVerses": [],
        "partialVerses": {},
    }
)


@pytest.mark.phase3
@pytest.mark.ingest
def test_upload_ingredient_rederives_from_source(seeded_session: Session) -> None:
    """A standalone upload stores an ingredient that derive_ingredient reproduces."""
    created = persist_versification(seeded_session, _TINY.encode(), "tiny.json")
    source = seeded_session.get(VersificationSource, created.id)
    scheme = seeded_session.get(VersificationScheme, created.id)
    assert source is not None and scheme is not None
    derived, issues = derive_ingredient(
        make_source(
            format="copenhagen_json",
            document_text=source.document_text,
            filename=source.filename,
            companion_vrs_text=source.companion_vrs_text,
        )
    )
    assert issues == ()
    assert derived == scheme.ingredient


@pytest.mark.phase3
@pytest.mark.ingest
def test_project_ingredient_includes_milestone_splits(seeded_session: Session) -> None:
    """A project scheme is the derived ingredient plus that project's splits."""
    archive = (
        repo_root() / "research" / "SampleTranslations" / "american-standard-1.zip"
    ).read_bytes()
    created = persist_project(seeded_session, archive, "Source Sample", "en")
    scheme_id = created.versification.id
    source = seeded_session.get(VersificationSource, scheme_id)
    scheme = seeded_session.get(VersificationScheme, scheme_id)
    assert source is not None and scheme is not None
    derived, issues = derive_ingredient(
        make_source(
            format="vrs",
            document_text=source.document_text,
            filename=source.filename,
        )
    )
    assert issues == () and derived is not None
    rows = seeded_session.scalars(
        select(VerseSpan).where(VerseSpan.translation_id == created.translation.id)
    ).all()
    spans = tuple(
        ParsedSpan(
            seq=row.seq,
            book=row.book,
            chapter=row.chapter,
            verse=row.verse,
            part=row.part,
            content=row.content,
            verse_label=row.verse_label,
            verse_range=row.verse_range,
        )
        for row in rows
    )
    expected = apply_combined_milestone_splits(
        derived,
        spans,
        session=seeded_session,
        based_on_translation_id=scheme.based_on_id,
    )
    assert expected == scheme.ingredient


@pytest.mark.phase3
@pytest.mark.ingest
def test_canonical_ingredient_rederives_from_packaged_json(
    seeded_session: Session,
) -> None:
    """Bootstrap keeps the prepared ingredient equal to the packaged JSON source."""
    scheme = seeded_session.scalar(
        select(VersificationScheme).where(VersificationScheme.name == "eng")
    )
    assert scheme is not None
    source = seeded_session.get(VersificationSource, scheme.id)
    assert source is not None
    assert source.companion_vrs_text
    prepared = _prepare_ingredient("eng", json.loads(source.document_text))
    assert prepared == scheme.ingredient


@pytest.mark.phase3
@pytest.mark.ingest
def test_nul_versification_is_rejected(seeded_session: Session) -> None:
    """NUL text is a validation failure and does not insert a scheme."""
    before = seeded_session.scalars(select(VersificationScheme.id)).all()
    with pytest.raises(AppError) as caught:
        persist_versification(seeded_session, b'{"maxVerses":\x00}', "nul.json")
    assert caught.value.status_code == 422
    after = seeded_session.scalars(select(VersificationScheme.id)).all()
    assert set(after) == set(before)


@pytest.mark.phase3
@pytest.mark.ingest
def test_second_canonical_seed_does_not_rewrite(db_session: Session) -> None:
    """A repeated startup leaves scheme timestamps and source digests alone."""
    seed_canonical(db_session)
    db_session.flush()
    db_session.expire_all()
    schemes = db_session.scalars(select(VersificationScheme)).all()
    stamps = {row.id: row.updated_at for row in schemes}
    digests = {
        row.scheme_id: row.sha256
        for row in db_session.scalars(select(VersificationSource)).all()
    }
    assert digests
    seed_canonical(db_session)
    db_session.flush()
    db_session.expire_all()
    again = db_session.scalars(select(VersificationScheme)).all()
    assert {row.id: row.updated_at for row in again} == stamps
    assert {
        row.scheme_id: row.sha256
        for row in db_session.scalars(select(VersificationSource)).all()
    } == digests
