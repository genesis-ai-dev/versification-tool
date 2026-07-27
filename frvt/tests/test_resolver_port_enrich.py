"""Unit tests for resolve-span seq enrichment."""

from __future__ import annotations

from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from frvt.api.ports.resolver_port import _enrich_span
from frvt.resolver.types import ResolvedSpanDTO


@pytest.mark.resolve
def test_enrich_span_falls_back_to_whole_verse_when_part_row_missing() -> None:
    """Part-bearing resolves attach the whole-verse seq when USX has part=null."""
    session = MagicMock()
    whole = MagicMock()
    whole.seq = 42
    session.scalar.side_effect = [None, whole]

    with patch("frvt.api.ports.resolver_port.parse_ref") as parse_ref:
        parse_ref.return_value = MagicMock(book="GEN", chapter=1, verse_start=1)
        result = _enrich_span(
            session,
            uuid4(),
            ResolvedSpanDTO(ref="GEN 1:1", part="a"),
        )

    assert result.seq == 42
    assert result.part == "a"
    assert result.ref == "GEN 1:1"
    assert session.scalar.call_count == 2


@pytest.mark.resolve
def test_enrich_span_uses_part_row_when_present() -> None:
    """Prefer an exact part-bearing verse_span when one exists."""
    session = MagicMock()
    part_row = MagicMock()
    part_row.seq = 7
    session.scalar.return_value = part_row

    with patch("frvt.api.ports.resolver_port.parse_ref") as parse_ref:
        parse_ref.return_value = MagicMock(book="GEN", chapter=1, verse_start=1)
        result = _enrich_span(
            session,
            uuid4(),
            ResolvedSpanDTO(ref="GEN 1:1", part="a"),
        )

    assert result.seq == 7
    assert result.part == "a"
    assert session.scalar.call_count == 1
