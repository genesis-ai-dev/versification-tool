"""Tests for the index content fingerprint used to detect stale mappings."""

from __future__ import annotations

from uuid import uuid4

import pytest
from frvt.api.indexing.fingerprint import index_fingerprint
from frvt.api.models import (
    MappingRecord,
    RelationType,
    Translation,
    VersificationScheme,
)
from frvt.resolver.chains import scheme_ref_from_id
from frvt.testops.fixtures.api_setup import insert_verse_span
from sqlalchemy.orm import Session

pytestmark = [pytest.mark.phase6, pytest.mark.resolve]


def _translation(session: Session) -> Translation:
    """Insert a metadata-only translation for fingerprint fixtures."""
    row = Translation(
        name=f"Fingerprint-{uuid4().hex[:8]}",
        language="en",
        source_format="usx",
        is_anchor=False,
    )
    session.add(row)
    session.flush()
    return row


def _root_scheme(session: Session) -> VersificationScheme:
    """Insert a root scheme with no mapping rows."""
    row = VersificationScheme(
        name=f"fp-scheme-{uuid4().hex[:8]}",
        based_on_name=None,
        based_on_id=None,
        canonical=False,
        ingredient={"maxVerses": {"GEN": ["1"]}},
    )
    session.add(row)
    session.flush()
    return row


def test_fingerprint_is_stable_across_calls(seeded_session: Session) -> None:
    """The digest is deterministic for an unchanged translation and scheme."""
    translation = _translation(seeded_session)
    scheme = _root_scheme(seeded_session)
    scheme_ref = scheme_ref_from_id(seeded_session, scheme.id)
    assert scheme_ref is not None
    first = index_fingerprint(
        seeded_session, translation_id=translation.id, scheme=scheme_ref
    )
    second = index_fingerprint(
        seeded_session, translation_id=translation.id, scheme=scheme_ref
    )
    assert first == second
    assert len(first) == 64


def test_fingerprint_changes_when_a_span_is_added(seeded_session: Session) -> None:
    """Adding a stored verse changes the digest even if timestamps do not."""
    translation = _translation(seeded_session)
    scheme = _root_scheme(seeded_session)
    scheme_ref = scheme_ref_from_id(seeded_session, scheme.id)
    assert scheme_ref is not None
    before = index_fingerprint(
        seeded_session, translation_id=translation.id, scheme=scheme_ref
    )
    insert_verse_span(seeded_session, translation.id, book="GEN", chapter=1, verse=1)
    after = index_fingerprint(
        seeded_session, translation_id=translation.id, scheme=scheme_ref
    )
    assert before != after


def test_fingerprint_changes_when_scheme_mappings_change(
    seeded_session: Session,
) -> None:
    """A new mapping row on the scheme chain changes the digest."""
    translation = _translation(seeded_session)
    scheme = _root_scheme(seeded_session)
    scheme_ref = scheme_ref_from_id(seeded_session, scheme.id)
    assert scheme_ref is not None
    before = index_fingerprint(
        seeded_session, translation_id=translation.id, scheme=scheme_ref
    )
    seeded_session.add(
        MappingRecord(
            scheme_id=scheme.id,
            source_ref="GEN 1:1",
            base_ref="GEN 1:1",
            part=None,
            relation=RelationType.shift,
            ordinal=0,
        )
    )
    seeded_session.flush()
    after = index_fingerprint(
        seeded_session, translation_id=translation.id, scheme=scheme_ref
    )
    assert before != after


def test_fingerprint_differs_for_two_translations(seeded_session: Session) -> None:
    """Two translations hashed against the same scheme produce different digests."""
    left = _translation(seeded_session)
    right = _translation(seeded_session)
    scheme = _root_scheme(seeded_session)
    scheme_ref = scheme_ref_from_id(seeded_session, scheme.id)
    assert scheme_ref is not None
    left_digest = index_fingerprint(
        seeded_session, translation_id=left.id, scheme=scheme_ref
    )
    right_digest = index_fingerprint(
        seeded_session, translation_id=right.id, scheme=scheme_ref
    )
    assert left_digest != right_digest
