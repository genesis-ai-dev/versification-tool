"""Unit tests for resolve-span seq enrichment."""

from __future__ import annotations

from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from frvt.api.errors import AppError
from frvt.api.models import Translation, TranslationVersification, VersificationScheme
from frvt.api.ports.resolver_port import (
    _enrich_span,
    build_resolve_path,
    resolve_single_with_path,
    resolve_single_with_schemes,
)
from frvt.resolver.types import ResolvedSpanDTO, SchemeRef
from sqlalchemy import func, select
from sqlalchemy.orm import Session


def _stored_span(*, seq: int) -> MagicMock:
    """Build a verse-span mock with scalar fields pydantic will accept."""
    row = MagicMock()
    row.seq = seq
    row.book = "GEN"
    row.chapter = 1
    row.verse = 1
    row.verse_label = None
    row.verse_range = None
    return row


@pytest.mark.phase6
@pytest.mark.resolve
def test_enrich_span_copies_stored_seq_and_part() -> None:
    """A finder hit supplies seq while the DTO's part is preserved."""
    translation_id = uuid4()
    finder = MagicMock(return_value=_stored_span(seq=42))

    with patch("frvt.api.ports.resolver_port.parse_ref") as parse_ref:
        parse_ref.return_value = MagicMock(book="GEN", chapter=1, verse_start=1)
        result = _enrich_span(
            translation_id,
            ResolvedSpanDTO(ref="GEN 1:1", part="a"),
            finder,
        )

    assert result.seq == 42
    assert result.part == "a"
    assert result.ref == "GEN 1:1"
    finder.assert_called_once()


@pytest.mark.phase6
@pytest.mark.resolve
def test_enrich_span_uses_bare_coordinates_when_missing() -> None:
    """A finder miss still returns structured coordinates without a stored seq."""
    finder = MagicMock(return_value=None)

    with patch("frvt.api.ports.resolver_port.parse_ref") as parse_ref:
        parse_ref.return_value = MagicMock(book="GEN", chapter=1, verse_start=1)
        result = _enrich_span(
            uuid4(),
            ResolvedSpanDTO(ref="GEN 1:1", part=None),
            finder,
        )

    assert result.seq is None
    assert result.book == "GEN"
    assert result.verse == 1


def _canonical_scheme_ref(session: Session, name: str) -> tuple[SchemeRef, Translation]:
    """Load a canonical scheme and its same-named anchor translation."""
    scheme = session.scalar(
        select(VersificationScheme).where(
            func.lower(VersificationScheme.name) == name.lower(),
            VersificationScheme.canonical.is_(True),
        )
    )
    translation = session.scalar(
        select(Translation).where(func.lower(Translation.name) == name.lower())
    )
    assert scheme is not None
    assert translation is not None
    return (
        SchemeRef(
            scheme_id=scheme.id,
            based_on_id=scheme.based_on_id,
            based_on_name=scheme.based_on_name,
        ),
        translation,
    )


@pytest.mark.phase6
@pytest.mark.resolve
def test_resolve_single_with_path_matches_schemes(seeded_session: Session) -> None:
    """Hoisted path and scheme-based resolve produce the same result."""
    org_scheme, org = _canonical_scheme_ref(seeded_session, "org")
    via_schemes = resolve_single_with_schemes(
        seeded_session,
        from_translation=org.id,
        to_translation=org.id,
        ref="GEN 1:1",
        part=None,
        source_scheme=org_scheme,
        target_scheme=org_scheme,
    )
    path = build_resolve_path(
        seeded_session,
        source_scheme=org_scheme,
        target_scheme=org_scheme,
    )
    via_path = resolve_single_with_path(
        seeded_session,
        from_translation=org.id,
        to_translation=org.id,
        ref="GEN 1:1",
        part=None,
        path=path,
    )
    assert via_path == via_schemes


@pytest.mark.phase6
@pytest.mark.resolve
def test_resolve_path_is_reusable(seeded_session: Session) -> None:
    """One ResolvePath can resolve two different references."""
    org_scheme, org = _canonical_scheme_ref(seeded_session, "org")
    path = build_resolve_path(
        seeded_session,
        source_scheme=org_scheme,
        target_scheme=org_scheme,
    )
    first = resolve_single_with_path(
        seeded_session,
        from_translation=org.id,
        to_translation=org.id,
        ref="GEN 1:1",
        part=None,
        path=path,
    )
    second = resolve_single_with_path(
        seeded_session,
        from_translation=org.id,
        to_translation=org.id,
        ref="GEN 1:2",
        part=None,
        path=path,
    )
    assert first.source_spans
    assert second.source_spans
    assert first.source_spans[0].verse != second.source_spans[0].verse


@pytest.mark.phase6
@pytest.mark.resolve
def test_build_resolve_path_no_shared_ancestor_422(seeded_session: Session) -> None:
    """Two root schemes with no shared ancestor raise 422."""
    orphan_a = Translation(
        name=f"orphan-a-{uuid4().hex[:8]}",
        language="en",
        source_format="usx",
        is_anchor=False,
    )
    orphan_b = Translation(
        name=f"orphan-b-{uuid4().hex[:8]}",
        language="en",
        source_format="usx",
        is_anchor=False,
    )
    seeded_session.add_all([orphan_a, orphan_b])
    seeded_session.flush()
    scheme_a = VersificationScheme(
        name=f"scheme-a-{uuid4().hex[:8]}",
        based_on_name=None,
        based_on_id=None,
        canonical=False,
        ingredient={"maxVerses": {"GEN": ["1"]}},
    )
    scheme_b = VersificationScheme(
        name=f"scheme-b-{uuid4().hex[:8]}",
        based_on_name=None,
        based_on_id=None,
        canonical=False,
        ingredient={"maxVerses": {"GEN": ["1"]}},
    )
    seeded_session.add_all([scheme_a, scheme_b])
    seeded_session.flush()
    seeded_session.add_all(
        [
            TranslationVersification(
                translation_id=orphan_a.id, scheme_id=scheme_a.id, preferred=True
            ),
            TranslationVersification(
                translation_id=orphan_b.id, scheme_id=scheme_b.id, preferred=True
            ),
        ]
    )
    seeded_session.flush()
    with pytest.raises(AppError) as raised:
        build_resolve_path(
            seeded_session,
            source_scheme=SchemeRef(
                scheme_id=scheme_a.id,
                based_on_id=scheme_a.based_on_id,
                based_on_name=scheme_a.based_on_name,
            ),
            target_scheme=SchemeRef(
                scheme_id=scheme_b.id,
                based_on_id=scheme_b.based_on_id,
                based_on_name=scheme_b.based_on_name,
            ),
        )
    assert raised.value.status_code == 422
