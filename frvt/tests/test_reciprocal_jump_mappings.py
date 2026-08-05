"""Unit tests for reciprocal jump-menu row discovery."""

from __future__ import annotations

from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from frvt.api.jump_cancel import JumpCancelContext
from frvt.api.routers.navigation import (
    JumpMapping,
    _reciprocal_jump_mappings,
    jump_navigation_ref,
)
from frvt.resolver.types import ResolutionDTO, ResolvedSpanDTO, SchemeRef


def _span(ref: str) -> ResolvedSpanDTO:
    return ResolvedSpanDTO(ref=ref, part=None)


@pytest.mark.nav
def test_reciprocal_jump_mappings_adds_composed_target_locus() -> None:
    """Counterpart pair target becomes a from-side jump when not already listed."""
    context = JumpCancelContext(
        session=MagicMock(),
        from_translation=uuid4(),
        to_translation=uuid4(),
        source_scheme=SchemeRef(scheme_id=uuid4(), based_on_id=None),
        target_scheme=SchemeRef(scheme_id=uuid4(), based_on_id=None),
    )
    counterpart_row = JumpMapping(
        source_ref="EZK 20:44",
        base_ref="EZK 21:3",
        part=None,
        relation="renumber",
        scheme_name="ASV",
    )
    reciprocal_dto = ResolutionDTO(
        source_spans=(_span("EZK 20:47"),),
        target_spans=(_span("EZK 20:44"),),
        relation="renumber",
        edges=(),
    )
    with patch(
        "frvt.api.routers.navigation._scheme_diff_filtered_jump_mappings",
        return_value=([counterpart_row], context),
    ), patch(
        "frvt.api.routers.navigation.translation_books_with_content",
        return_value=frozenset({"EZK"}),
    ), patch(
        "frvt.api.routers.navigation.resolved_target_ref_for_jump",
        side_effect=["EZK 20:47", "EZK 20:44"],
    ), patch(
        "frvt.api.routers.navigation.is_canceling_jump_entry",
        return_value=False,
    ), patch(
        "frvt.api.routers.navigation.is_unreachable_jump_entry",
        return_value=False,
    ), patch(
        "frvt.api.routers.navigation.resolve_navigation_dto",
        return_value=reciprocal_dto,
    ):
        reciprocals = _reciprocal_jump_mappings(
            MagicMock(),
            context.from_translation,
            context.to_translation,
            "EZK",
            None,
            None,
            context,
            set(),
        )
    assert len(reciprocals) == 1
    assert reciprocals[0].source_ref == "EZK 20:47"
    assert reciprocals[0].base_ref == "EZK 20:44"
    assert jump_navigation_ref(reciprocals[0]) == ("EZK 20:47", None)


@pytest.mark.nav
def test_reciprocal_jump_mappings_skips_existing_navigation() -> None:
    """Do not duplicate a row already present on the from side."""
    context = JumpCancelContext(
        session=MagicMock(),
        from_translation=uuid4(),
        to_translation=uuid4(),
        source_scheme=SchemeRef(scheme_id=uuid4(), based_on_id=None),
        target_scheme=SchemeRef(scheme_id=uuid4(), based_on_id=None),
    )
    counterpart_row = JumpMapping(
        source_ref="EZK 20:44",
        base_ref="EZK 21:3",
        part=None,
        relation="renumber",
        scheme_name="ASV",
    )
    with patch(
        "frvt.api.routers.navigation._scheme_diff_filtered_jump_mappings",
        return_value=([counterpart_row], context),
    ), patch(
        "frvt.api.routers.navigation.translation_books_with_content",
        return_value=frozenset({"EZK"}),
    ), patch(
        "frvt.api.routers.navigation.resolved_target_ref_for_jump",
        return_value="EZK 20:47",
    ):
        reciprocals = _reciprocal_jump_mappings(
            MagicMock(),
            context.from_translation,
            context.to_translation,
            "EZK",
            None,
            None,
            context,
            {("EZK 20:47", None)},
        )
    assert reciprocals == []
