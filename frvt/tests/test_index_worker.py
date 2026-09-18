"""Tests for index worker claim, reclaim, recovery, and fingerprint sweep."""

from __future__ import annotations

from uuid import uuid4

import pytest
from frvt.api.indexing.registry import create_index, delete_index
from frvt.api.indexing.worker import (
    INDEX_BUILD_LOCK_KEY,
    build_lock_keys,
    drain_reclaim,
    process_next_index,
    purge_orphan_mappings,
    recover_orphaned_builds,
    release_build_lock,
    sweep_fingerprints,
    try_build_lock,
)
from frvt.api.models import (
    INDEX_STATUS_BUILDING,
    INDEX_STATUS_CANCELLED,
    INDEX_STATUS_PENDING,
    INDEX_STATUS_READY,
    IndexMapping,
    IndexReclaim,
    Translation,
    TranslationIndex,
)
from frvt.testops.fixtures.api_setup import insert_verse_span
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

pytestmark = [pytest.mark.phase6, pytest.mark.resolve]


def _translation(session: Session) -> Translation:
    """Insert a metadata-only translation."""
    row = Translation(
        name=f"IdxWork-{uuid4().hex[:8]}",
        language="en",
        source_format="usx",
        is_anchor=False,
    )
    session.add(row)
    session.flush()
    return row


def test_process_next_index_builds_pending(seeded_session: Session) -> None:
    """A pending index is claimed and becomes ready."""
    translation = _translation(seeded_session)
    index = create_index(seeded_session, translation_id=translation.id)
    assert process_next_index(seeded_session, chunk_size=50) is True
    row = seeded_session.get(TranslationIndex, index.id)
    assert row is not None
    assert row.status == INDEX_STATUS_READY


def test_process_next_index_empty_queue(seeded_session: Session) -> None:
    """An empty queue is not work."""
    assert process_next_index(seeded_session, chunk_size=50) is False


def test_process_next_index_cancels_flagged_pending(seeded_session: Session) -> None:
    """A pending index with cancel_requested becomes cancelled without building."""
    translation = _translation(seeded_session)
    index = create_index(seeded_session, translation_id=translation.id)
    index.cancel_requested = True
    seeded_session.flush()
    assert process_next_index(seeded_session, chunk_size=50) is True
    row = seeded_session.get(TranslationIndex, index.id)
    assert row is not None
    assert row.status == INDEX_STATUS_CANCELLED
    assert row.cancel_requested is False


def test_recover_orphaned_builds_requeues(seeded_session: Session) -> None:
    """A crash while building returns the index to the pending queue."""
    translation = _translation(seeded_session)
    index = create_index(seeded_session, translation_id=translation.id)
    index.status = INDEX_STATUS_BUILDING
    seeded_session.flush()
    assert recover_orphaned_builds(seeded_session) == 1
    row = seeded_session.get(TranslationIndex, index.id)
    assert row is not None
    assert row.status == INDEX_STATUS_PENDING
    assert row.pending_reason == "interrupted"


def test_recover_orphaned_builds_honors_cancel(seeded_session: Session) -> None:
    """A cancel requested before a crash is not turned into a rebuild."""
    translation = _translation(seeded_session)
    index = create_index(seeded_session, translation_id=translation.id)
    index.status = INDEX_STATUS_BUILDING
    index.cancel_requested = True
    seeded_session.flush()
    assert recover_orphaned_builds(seeded_session) == 1
    row = seeded_session.get(TranslationIndex, index.id)
    assert row is not None
    assert row.status == INDEX_STATUS_CANCELLED
    assert row.cancel_requested is False


def test_build_lock_acquire_and_release(seeded_session: Session) -> None:
    """The per-database lock uses this database's catalog OID as the first key."""
    db_key, resource_key = build_lock_keys(seeded_session)
    oid = seeded_session.scalar(
        text("SELECT oid FROM pg_database WHERE datname = current_database()")
    )
    assert oid is not None
    unsigned = int(oid) % 2**32
    expected = unsigned - 2**32 if unsigned >= 2**31 else unsigned
    assert db_key == expected
    assert resource_key == INDEX_BUILD_LOCK_KEY
    assert try_build_lock(seeded_session) is True
    release_build_lock(seeded_session)


def test_drain_reclaim_removes_rows_then_entry(seeded_session: Session) -> None:
    """Reclaim deletes orphaned mappings and then the queue row."""
    translation = _translation(seeded_session)
    index = create_index(seeded_session, translation_id=translation.id)
    index_id = index.id
    seeded_session.add(
        IndexMapping(
            source_index_id=index_id,
            target_index_id=uuid4(),
            source_ref="GEN 1:1",
            payload={"relation": "one_to_one"},
        )
    )
    seeded_session.flush()
    delete_index(seeded_session, index_id)
    step = drain_reclaim(seeded_session, chunk_size=100)
    assert step.deleted == 1
    assert step.completed is True
    assert seeded_session.get(IndexReclaim, index_id) is None
    remaining = seeded_session.scalar(
        select(func.count())
        .select_from(IndexMapping)
        .where(IndexMapping.source_index_id == index_id)
    )
    assert int(remaining or 0) == 0


def test_purge_orphan_mappings_queues_reclaim(seeded_session: Session) -> None:
    """Mappings whose index is gone are queued for chunked cleanup."""
    source_id = uuid4()
    target_id = uuid4()
    seeded_session.add(
        IndexMapping(
            source_index_id=source_id,
            target_index_id=target_id,
            source_ref="GEN 1:1",
            payload={"relation": "one_to_one"},
        )
    )
    seeded_session.flush()
    assert purge_orphan_mappings(seeded_session) == 2
    assert seeded_session.get(IndexReclaim, source_id) is not None
    assert seeded_session.get(IndexReclaim, target_id) is not None


def test_sweep_fingerprints_requeues_after_span_added(seeded_session: Session) -> None:
    """A ready index is re-queued when its translation content changes."""
    translation = _translation(seeded_session)
    index = create_index(seeded_session, translation_id=translation.id)
    assert process_next_index(seeded_session, chunk_size=50) is True
    insert_verse_span(seeded_session, translation.id, book="GEN", chapter=1, verse=1)
    assert sweep_fingerprints(seeded_session) == 1
    row = seeded_session.get(TranslationIndex, index.id)
    assert row is not None
    assert row.status == INDEX_STATUS_PENDING
    assert row.pending_reason == "content changed"
