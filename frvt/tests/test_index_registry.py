"""Tests for the translation-index registry component."""

from __future__ import annotations

from uuid import uuid4

import pytest
from frvt.api.errors import AppError
from frvt.api.indexing.registry import (
    create_index,
    delete_index,
    get_index,
    index_row_counts,
    request_cancel,
    request_rebuild,
    set_versification,
    usage_summary,
)
from frvt.api.models import (
    INDEX_STATUS_CANCELLED,
    INDEX_STATUS_PENDING,
    INDEX_STATUS_READY,
    IndexMapping,
    IndexReclaim,
    Translation,
    TranslationVersification,
    VersificationScheme,
)
from frvt.api.scheme_select import org_scheme_ref
from sqlalchemy import func, select
from sqlalchemy.orm import Session

pytestmark = [pytest.mark.phase6, pytest.mark.resolve]


def _translation(session: Session) -> Translation:
    """Insert a metadata-only translation with no associations."""
    row = Translation(
        name=f"IndexReg-{uuid4().hex[:8]}",
        language="en",
        source_format="usx",
        is_anchor=False,
    )
    session.add(row)
    session.flush()
    return row


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


def test_create_index_defaults_to_org_when_unassociated(
    seeded_session: Session,
) -> None:
    """Omitted versification falls back to canonical org (criterion 4.2)."""
    translation = _translation(seeded_session)
    row = create_index(seeded_session, translation_id=translation.id)
    assert row.scheme_id == org_scheme_ref(seeded_session).scheme_id
    assert row.scheme_explicit is False
    assert row.status == INDEX_STATUS_PENDING
    assert row.pending_reason == "created"


def test_create_index_uses_preferred_when_present(seeded_session: Session) -> None:
    """Omitted versification uses the translation's preferred scheme (criterion 4.1)."""
    translation = _translation(seeded_session)
    eng = _canonical(seeded_session, "eng")
    seeded_session.add(
        TranslationVersification(
            translation_id=translation.id, scheme_id=eng.id, preferred=True
        )
    )
    seeded_session.flush()
    row = create_index(seeded_session, translation_id=translation.id)
    assert row.scheme_id == eng.id
    assert row.scheme_explicit is False


def test_create_index_honors_explicit_associated_scheme(
    seeded_session: Session,
) -> None:
    """An explicit associated versification is stored as pinned."""
    translation = _translation(seeded_session)
    eng = _canonical(seeded_session, "eng")
    seeded_session.add(
        TranslationVersification(
            translation_id=translation.id, scheme_id=eng.id, preferred=True
        )
    )
    seeded_session.flush()
    row = create_index(seeded_session, translation_id=translation.id, scheme_id=eng.id)
    assert row.scheme_id == eng.id
    assert row.scheme_explicit is True


def test_duplicate_index_is_conflict(seeded_session: Session) -> None:
    """A second index for the same translation and versification is 409."""
    translation = _translation(seeded_session)
    create_index(seeded_session, translation_id=translation.id)
    with pytest.raises(AppError) as raised:
        create_index(seeded_session, translation_id=translation.id)
    assert raised.value.status_code == 409


def test_cancel_pending_becomes_cancelled(seeded_session: Session) -> None:
    """Cancelling a queued index marks it cancelled without waiting for the worker."""
    translation = _translation(seeded_session)
    row = create_index(seeded_session, translation_id=translation.id)
    cancelled = request_cancel(seeded_session, row.id)
    assert cancelled.status == INDEX_STATUS_CANCELLED
    assert cancelled.cancel_requested is False


def test_cancel_ready_is_conflict(seeded_session: Session) -> None:
    """There is nothing to cancel on a finished index."""
    translation = _translation(seeded_session)
    row = create_index(seeded_session, translation_id=translation.id)
    row.status = INDEX_STATUS_READY
    seeded_session.flush()
    with pytest.raises(AppError) as raised:
        request_cancel(seeded_session, row.id)
    assert raised.value.status_code == 409


def test_rebuild_from_ready_returns_to_pending(seeded_session: Session) -> None:
    """A manual rebuild is legal from a finished index."""
    translation = _translation(seeded_session)
    row = create_index(seeded_session, translation_id=translation.id)
    row.status = INDEX_STATUS_READY
    seeded_session.flush()
    rebuilt = request_rebuild(seeded_session, row.id)
    assert rebuilt.status == INDEX_STATUS_PENDING
    assert rebuilt.pending_reason == "manual rebuild"


def test_delete_index_queues_reclaim(seeded_session: Session) -> None:
    """Deleting an index removes the row and records it for mapping cleanup."""
    translation = _translation(seeded_session)
    row = create_index(seeded_session, translation_id=translation.id)
    index_id = row.id
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
    with pytest.raises(AppError) as raised:
        get_index(seeded_session, index_id)
    assert raised.value.status_code == 404
    assert seeded_session.get(IndexReclaim, index_id) is not None
    outbound, inbound = index_row_counts(seeded_session, index_id)
    assert outbound == 1
    assert inbound == 0


def test_set_versification_collision_is_conflict(seeded_session: Session) -> None:
    """Changing versification cannot land on a pair another index already holds."""
    translation = _translation(seeded_session)
    eng = _canonical(seeded_session, "eng")
    org = _canonical(seeded_session, "org")
    seeded_session.add_all(
        [
            TranslationVersification(
                translation_id=translation.id, scheme_id=eng.id, preferred=True
            ),
            TranslationVersification(
                translation_id=translation.id, scheme_id=org.id, preferred=False
            ),
        ]
    )
    seeded_session.flush()
    create_index(seeded_session, translation_id=translation.id, scheme_id=eng.id)
    other = create_index(
        seeded_session, translation_id=translation.id, scheme_id=org.id
    )
    with pytest.raises(AppError) as raised:
        set_versification(seeded_session, other.id, eng.id)
    assert raised.value.status_code == 409


def test_usage_summary_counts_indexes(seeded_session: Session) -> None:
    """Usage reports at least the index just created."""
    translation = _translation(seeded_session)
    create_index(seeded_session, translation_id=translation.id)
    usage = usage_summary(seeded_session)
    assert usage.total_indexes >= 1
    assert usage.mapping_bytes >= 0
