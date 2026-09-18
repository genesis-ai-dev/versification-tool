"""Tests for cartesian index mapping materialization."""

from __future__ import annotations

from uuid import uuid4

import pytest
from frvt.api.indexing.builder import build_index
from frvt.api.indexing.registry import create_index
from frvt.api.models import (
    INDEX_STATUS_BUILDING,
    INDEX_STATUS_CANCELLED,
    INDEX_STATUS_READY,
    IndexMapping,
    Translation,
    TranslationIndex,
    TranslationVersification,
    VersificationScheme,
)
from frvt.api.ports.resolver_port import build_resolve_path, resolve_single_with_path
from frvt.api.resolve_batch import stored_verse_refs
from frvt.api.schemas import ResolveResult
from frvt.resolver.chains import scheme_ref_from_id
from frvt.testops.fixtures.api_setup import insert_verse_span
from sqlalchemy import func, select
from sqlalchemy.orm import Session

pytestmark = [pytest.mark.phase6, pytest.mark.resolve]


def _canonical(session: Session, name: str) -> VersificationScheme:
    """Load a bootstrapped canonical scheme by lowercase name."""
    scheme = session.scalar(
        select(VersificationScheme).where(
            func.lower(VersificationScheme.name) == name.lower(),
            VersificationScheme.canonical.is_(True),
        )
    )
    assert scheme is not None
    return scheme


def _indexed_translation(
    session: Session, verses: tuple[int, ...] = (1, 2)
) -> TranslationIndex:
    """Create a translation with GEN 1 verses, preferred org, and a pending index."""
    translation = Translation(
        name=f"IdxBuild-{uuid4().hex[:8]}",
        language="en",
        source_format="usx",
        is_anchor=False,
    )
    session.add(translation)
    session.flush()
    org = _canonical(session, "org")
    session.add(
        TranslationVersification(
            translation_id=translation.id, scheme_id=org.id, preferred=True
        )
    )
    for verse in verses:
        insert_verse_span(session, translation.id, book="GEN", chapter=1, verse=verse)
    session.flush()
    return create_index(session, translation_id=translation.id)


def _claim_and_build(
    session: Session, index_id: object, *, chunk_size: int = 50
) -> None:
    """Mark the index building and run the pair builder."""
    row = session.get(TranslationIndex, index_id)
    assert row is not None
    row.status = INDEX_STATUS_BUILDING
    session.flush()
    build_index(session, row.id, chunk_size=chunk_size)


def test_two_indexes_populate_both_directions(seeded_session: Session) -> None:
    """Building the second index writes A→B and B→A for every stored ref."""
    first = _indexed_translation(seeded_session)
    _claim_and_build(seeded_session, first.id)
    second = _indexed_translation(seeded_session)
    _claim_and_build(seeded_session, second.id)

    first_refs = stored_verse_refs(seeded_session, first.translation_id)
    second_refs = stored_verse_refs(seeded_session, second.translation_id)
    outbound = seeded_session.scalars(
        select(IndexMapping.source_ref).where(
            IndexMapping.source_index_id == first.id,
            IndexMapping.target_index_id == second.id,
        )
    ).all()
    inbound = seeded_session.scalars(
        select(IndexMapping.source_ref).where(
            IndexMapping.source_index_id == second.id,
            IndexMapping.target_index_id == first.id,
        )
    ).all()
    assert sorted(outbound) == sorted(first_refs)
    assert sorted(inbound) == sorted(second_refs)


def test_three_indexes_cover_every_ordered_pair(seeded_session: Session) -> None:
    """Cartesian completeness: every ordered pair covers the source's stored refs."""
    indexes = [_indexed_translation(seeded_session) for _ in range(3)]
    for index in indexes:
        _claim_and_build(seeded_session, index.id)
    for source in indexes:
        refs = stored_verse_refs(seeded_session, source.translation_id)
        for target in indexes:
            if source.id == target.id:
                continue
            stored = seeded_session.scalars(
                select(IndexMapping.source_ref).where(
                    IndexMapping.source_index_id == source.id,
                    IndexMapping.target_index_id == target.id,
                )
            ).all()
            assert sorted(stored) == sorted(refs)


def test_payload_round_trips_to_live_resolve(seeded_session: Session) -> None:
    """A stored payload equals a live resolve of the same verse."""
    first = _indexed_translation(seeded_session, verses=(1,))
    _claim_and_build(seeded_session, first.id)
    second = _indexed_translation(seeded_session, verses=(1,))
    _claim_and_build(seeded_session, second.id)
    mapping = seeded_session.scalar(
        select(IndexMapping).where(
            IndexMapping.source_index_id == first.id,
            IndexMapping.target_index_id == second.id,
            IndexMapping.source_ref == "GEN 1:1",
        )
    )
    assert mapping is not None
    stored = ResolveResult.model_validate(mapping.payload)
    source_scheme = scheme_ref_from_id(seeded_session, first.scheme_id)
    target_scheme = scheme_ref_from_id(seeded_session, second.scheme_id)
    assert source_scheme is not None and target_scheme is not None
    path = build_resolve_path(
        seeded_session, source_scheme=source_scheme, target_scheme=target_scheme
    )
    live = resolve_single_with_path(
        seeded_session,
        from_translation=first.translation_id,
        to_translation=second.translation_id,
        ref="GEN 1:1",
        part=None,
        path=path,
    )
    assert stored == live


def test_empty_translation_becomes_ready(seeded_session: Session) -> None:
    """An index on a translation with no spans is ready with zero mapping rows."""
    translation = Translation(
        name=f"IdxEmpty-{uuid4().hex[:8]}",
        language="en",
        source_format="usx",
        is_anchor=False,
    )
    seeded_session.add(translation)
    seeded_session.flush()
    index = create_index(seeded_session, translation_id=translation.id)
    _claim_and_build(seeded_session, index.id)
    row = seeded_session.get(TranslationIndex, index.id)
    assert row is not None
    assert row.status == INDEX_STATUS_READY
    outbound, inbound = (
        seeded_session.scalar(
            select(func.count())
            .select_from(IndexMapping)
            .where(IndexMapping.source_index_id == index.id)
        ),
        seeded_session.scalar(
            select(func.count())
            .select_from(IndexMapping)
            .where(IndexMapping.target_index_id == index.id)
        ),
    )
    assert int(outbound or 0) == 0
    assert int(inbound or 0) == 0


def test_rebuild_is_idempotent(seeded_session: Session) -> None:
    """A second build replaces rows rather than duplicating them."""
    first = _indexed_translation(seeded_session)
    _claim_and_build(seeded_session, first.id)
    second = _indexed_translation(seeded_session)
    _claim_and_build(seeded_session, second.id)
    _claim_and_build(seeded_session, second.id)
    count = seeded_session.scalar(
        select(func.count())
        .select_from(IndexMapping)
        .where(
            IndexMapping.source_index_id == first.id,
            IndexMapping.target_index_id == second.id,
        )
    )
    refs = stored_verse_refs(seeded_session, first.translation_id)
    assert int(count or 0) == len(refs)


def test_cancel_requested_does_not_become_ready(seeded_session: Session) -> None:
    """A cancel flag noticed at the start of a build leaves the index cancelled."""
    index = _indexed_translation(seeded_session)
    index.status = INDEX_STATUS_BUILDING
    index.cancel_requested = True
    seeded_session.flush()
    build_index(seeded_session, index.id, chunk_size=50)
    row = seeded_session.get(TranslationIndex, index.id)
    assert row is not None
    assert row.status == INDEX_STATUS_CANCELLED
    assert row.cancel_requested is False
