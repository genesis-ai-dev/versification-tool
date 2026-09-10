"""Unit tests for jump-menu target-content filtering."""

from __future__ import annotations

from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from frvt.api.jump_cancel import JumpCancelContext
from frvt.api.jump_target_content import (
    filter_unreachable_jump_rows,
    is_unreachable_jump_entry,
    target_books_from_resolution,
    target_content_books_or_unfiltered,
)
from frvt.api.models import Translation
from frvt.api.routers.navigation import JumpMapping
from frvt.resolver.types import ResolutionDTO, ResolvedSpanDTO, SchemeRef
from sqlalchemy import select
from sqlalchemy.orm import Session


def _span(ref: str, part: str | None = None) -> ResolvedSpanDTO:
    return ResolvedSpanDTO(ref=ref, part=part)


@pytest.mark.nav
def test_target_books_from_resolution_collects_distinct_books() -> None:
    """Split targets contribute every resolved book code."""
    dto = ResolutionDTO(
        source_spans=(_span("GEN 1:1"),),
        target_spans=(_span("GEN 1:1"), _span("EXO 1:1")),
        relation="split",
        edges=(),
    )
    assert target_books_from_resolution(dto) == frozenset({"GEN", "EXO"})


@pytest.mark.nav
def test_is_unreachable_jump_entry_hides_missing_target_book() -> None:
    """Rows resolving to books without stored target content are suppressed."""
    context = JumpCancelContext(
        session=MagicMock(),
        from_translation=uuid4(),
        to_translation=uuid4(),
        source_scheme=SchemeRef(scheme_id=uuid4(), based_on_id=None),
        target_scheme=SchemeRef(scheme_id=uuid4(), based_on_id=None),
    )
    dto = ResolutionDTO(
        source_spans=(_span("GEN 1:1"),),
        target_spans=(_span("GEN 1:1"),),
        relation="shift",
        edges=(),
    )
    with patch.object(JumpCancelContext, "_resolve_navigation", return_value=dto):
        assert (
            is_unreachable_jump_entry(context, "GEN 1:1", None, frozenset({"MAT"}))
            is True
        )
        assert (
            is_unreachable_jump_entry(context, "GEN 1:1", None, frozenset({"GEN"}))
            is False
        )


@pytest.mark.nav
def test_is_unreachable_jump_entry_keeps_exclude() -> None:
    """Exclude rows with no target spans remain visible."""
    context = JumpCancelContext(
        session=MagicMock(),
        from_translation=uuid4(),
        to_translation=uuid4(),
        source_scheme=SchemeRef(scheme_id=uuid4(), based_on_id=None),
        target_scheme=SchemeRef(scheme_id=uuid4(), based_on_id=None),
    )
    dto = ResolutionDTO(
        source_spans=(_span("GEN 1:1"),),
        target_spans=(),
        relation="exclude",
        edges=(),
    )
    with patch.object(JumpCancelContext, "_resolve_navigation", return_value=dto):
        assert is_unreachable_jump_entry(context, "GEN 1:1", None, frozenset()) is False


@pytest.mark.nav
def test_is_unreachable_jump_entry_skips_when_target_books_unfiltered() -> None:
    """Numbering-space anchors pass ``None`` so scheme differences stay visible."""
    context = JumpCancelContext(
        session=MagicMock(),
        from_translation=uuid4(),
        to_translation=uuid4(),
        source_scheme=SchemeRef(scheme_id=uuid4(), based_on_id=None),
        target_scheme=SchemeRef(scheme_id=uuid4(), based_on_id=None),
    )
    dto = ResolutionDTO(
        source_spans=(_span("PSA 3:0"),),
        target_spans=(_span("PSA 3:1"),),
        relation="shift",
        edges=(),
    )
    with patch.object(JumpCancelContext, "_resolve_navigation", return_value=dto):
        assert is_unreachable_jump_entry(context, "PSA 3:0", None, None) is False


@pytest.mark.nav
def test_filter_unreachable_jump_rows_drops_only_unreachable() -> None:
    """Batch filter removes rows whose targets are absent from stored content."""
    rows = [
        JumpMapping("GEN 1:1", "GEN 1:2", None, "shift", "eng"),
        JumpMapping("MAT 1:1", "MAT 1:1", None, "shift", "eng"),
    ]
    context = JumpCancelContext(
        session=MagicMock(),
        from_translation=uuid4(),
        to_translation=uuid4(),
        source_scheme=SchemeRef(scheme_id=uuid4(), based_on_id=None),
        target_scheme=SchemeRef(scheme_id=uuid4(), based_on_id=None),
    )

    def resolve(ref: str, part: str | None = None) -> ResolutionDTO:
        return ResolutionDTO(
            source_spans=(_span(ref, part),),
            target_spans=(_span(ref, part),),
            relation="shift",
            edges=(),
        )

    with patch.object(JumpCancelContext, "_resolve_navigation", side_effect=resolve):
        kept = filter_unreachable_jump_rows(
            rows,
            context,
            frozenset({"MAT"}),
            lambda row: (row.source_ref, row.part),
        )
    assert [row.source_ref for row in kept] == ["MAT 1:1"]


@pytest.mark.nav
def test_anchor_translations_skip_target_content_filter(
    seeded_session: Session,
) -> None:
    """Numbering-space anchors have no verse text; jump menus must still list them."""
    org = seeded_session.scalar(select(Translation).where(Translation.name == "org"))
    assert org is not None
    assert target_content_books_or_unfiltered(seeded_session, org.id) is None
