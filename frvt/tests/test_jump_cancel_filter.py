"""Unit tests for jump-menu cancel filtering helpers."""

from __future__ import annotations

from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from frvt.api.jump_cancel import (
    JumpCancelContext,
    is_canceling_jump_entry,
    is_canceling_resolution,
    spans_share_bcv,
)
from frvt.resolver.types import ResolutionDTO, ResolvedSpanDTO, SchemeRef


def _span(ref: str, part: str | None = None) -> ResolvedSpanDTO:
    return ResolvedSpanDTO(ref=ref, part=part)


@pytest.mark.nav
def test_spans_share_bcv_matches_same_coordinates() -> None:
    """Same book/chapter/verse/part is a canceling coordinate match."""
    assert spans_share_bcv(_span("PSA 3:1"), _span("PSA 3:1")) is True


@pytest.mark.nav
def test_spans_share_bcv_differs_by_verse() -> None:
    """Different verse numbers are not a canceling match."""
    assert spans_share_bcv(_span("PSA 3:1"), _span("PSA 3:2")) is False


@pytest.mark.nav
def test_spans_share_bcv_includes_part() -> None:
    """Partial spans must match on part as well as BCV."""
    assert spans_share_bcv(_span("SIR 36:13", "a"), _span("SIR 36:13", "a")) is True
    assert spans_share_bcv(_span("SIR 36:13", "a"), _span("SIR 36:13", "b")) is False


@pytest.mark.nav
def test_is_canceling_resolution_complementary_psalm() -> None:
    """One-to-one same BCV resolves cancel even when relation is shift."""
    dto = ResolutionDTO(
        source_spans=(_span("PSA 3:1"),),
        target_spans=(_span("PSA 3:1"),),
        relation="shift",
        edges=(),
    )
    assert is_canceling_resolution(dto) is True


@pytest.mark.nav
def test_is_canceling_resolution_eng_org_psalm_shift() -> None:
    """Real coordinate shifts between schemes are not canceling."""
    dto = ResolutionDTO(
        source_spans=(_span("PSA 3:1"),),
        target_spans=(_span("PSA 3:2"),),
        relation="shift",
        edges=(),
    )
    assert is_canceling_resolution(dto) is False


@pytest.mark.nav
def test_is_canceling_resolution_exclude() -> None:
    """Exclude results have no target span and must remain visible."""
    dto = ResolutionDTO(
        source_spans=(_span("GEN 1:1"),),
        target_spans=(),
        relation="exclude",
        edges=(),
    )
    assert is_canceling_resolution(dto) is False


@pytest.mark.nav
def test_is_canceling_resolution_split() -> None:
    """Split results with multiple targets are not canceling."""
    dto = ResolutionDTO(
        source_spans=(_span("GEN 1:1"),),
        target_spans=(_span("GEN 1:1"), _span("GEN 1:2")),
        relation="split",
        edges=(),
    )
    assert is_canceling_resolution(dto) is False


@pytest.mark.nav
def test_is_canceling_resolution_merge() -> None:
    """Merge results with multiple sources are not canceling."""
    dto = ResolutionDTO(
        source_spans=(_span("GEN 1:1"), _span("GEN 1:2")),
        target_spans=(_span("GEN 1:1"),),
        relation="merge",
        edges=(),
    )
    assert is_canceling_resolution(dto) is False


@pytest.mark.nav
def test_is_canceling_resolution_partial_stays_visible() -> None:
    """Identity-locus partial annotations must remain in the jump menu."""
    dto = ResolutionDTO(
        source_spans=(_span("GEN 1:1", "a"),),
        target_spans=(_span("GEN 1:1", "a"),),
        relation="partial",
        edges=(),
    )
    assert is_canceling_resolution(dto) is False


@pytest.mark.nav
def test_is_canceling_jump_entry_fails_open_on_resolve_error() -> None:
    """Resolve failures keep the jump entry visible."""
    context = JumpCancelContext(
        session=MagicMock(),
        from_translation=uuid4(),
        to_translation=uuid4(),
        source_scheme=SchemeRef(scheme_id=uuid4(), based_on_id=None),
        target_scheme=SchemeRef(scheme_id=uuid4(), based_on_id=None),
    )
    with patch.object(
        JumpCancelContext,
        "_resolve_navigation",
        side_effect=LookupError("no ancestor"),
    ):
        assert is_canceling_jump_entry(context, "PSA 3:1") is False
