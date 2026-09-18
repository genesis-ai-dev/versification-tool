"""Tests for the shared index-key normalizer."""

from __future__ import annotations

import pytest
from frvt.api.indexing.keys import index_key

pytestmark = [pytest.mark.phase6, pytest.mark.resolve]


def test_index_key_accepts_a_single_verse() -> None:
    """A whole-verse BCV string is the stored mapping key."""
    assert index_key("GEN 1:1") == "GEN 1:1"
    assert index_key("  PSA 3:0  ") == "PSA 3:0"


def test_index_key_rejects_ranges_and_garbage() -> None:
    """Ranges and unparseable refs fall back to live resolve rather than a key."""
    assert index_key("GEN 1:1-3") is None
    assert index_key("not-a-ref") is None
    assert index_key("GEN 1:1a") is None
