"""Tests for the BCV parse / expand / format helpers."""

from __future__ import annotations

import pytest
from frvt.resolver.parse_ref import (
    covers,
    expand,
    format_bcv,
    index_in_range,
    parse_ref,
)
from frvt.resolver.types import RefRange, VerseId


def test_parse_single_verse() -> None:
    """A plain BCV string becomes a single-verse range."""
    ref = parse_ref("GEN 31:55")
    assert ref == RefRange(book="GEN", chapter=31, verse_start=55, verse_end=55)


def test_parse_verse_zero() -> None:
    """Psalm-title verse 0 is a valid BCV coordinate."""
    ref = parse_ref("PSA 3:0")
    assert ref.verse_start == 0 and ref.verse_end == 0


def test_parse_range() -> None:
    """Same-chapter ranges parse with inclusive start and end."""
    ref = parse_ref("PSA 3:0-8")
    assert ref == RefRange(book="PSA", chapter=3, verse_start=0, verse_end=8)


def test_expand_range() -> None:
    """Expand yields one VerseId per verse with part left unset."""
    members = expand(parse_ref("PSA 3:0-2"))
    assert [format_bcv(v) for v in members] == ["PSA 3:0", "PSA 3:1", "PSA 3:2"]
    assert all(v.part is None for v in members)


def test_covers_and_index() -> None:
    """covers/index_in_range locate a verse inside a range."""
    rng = parse_ref("PSA 3:0-8")
    verse = VerseId(book="PSA", chapter=3, verse=1)
    assert covers(rng, verse)
    assert index_in_range(rng, verse) == 1
    assert not covers(rng, VerseId(book="PSA", chapter=4, verse=1))


def test_reject_part_suffix() -> None:
    """Part suffixes must not appear inside the reference string."""
    with pytest.raises(ReferenceError):
        parse_ref("SIR 36:13a")


def test_reject_cross_chapter_style_invalid() -> None:
    """Malformed references that are not same-chapter BCV ranges raise."""
    with pytest.raises(ReferenceError):
        parse_ref("GEN 31:55-GEN 32:1")


def test_reject_end_before_start() -> None:
    """A range whose end is before its start is rejected."""
    with pytest.raises(ReferenceError):
        parse_ref("PSA 3:8-0")
