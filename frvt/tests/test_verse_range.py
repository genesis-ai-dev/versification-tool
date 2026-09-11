"""Unit tests for partial-reference parsing and range windows."""

from __future__ import annotations

import pytest
from frvt.api.errors import AppError
from frvt.api.verse_range import parse_partial_ref, range_window, verse_key


@pytest.mark.phase6
@pytest.mark.resolve
def test_parse_partial_ref_three_grammars() -> None:
    """BOOK, BOOK C, and BOOK C:V each parse into the expected fields."""
    book_only = parse_partial_ref("GEN")
    assert book_only.book == "GEN"
    assert book_only.chapter is None
    assert book_only.verse is None

    chapter = parse_partial_ref("GEN 3")
    assert chapter.book == "GEN"
    assert chapter.chapter == 3
    assert chapter.verse is None

    verse = parse_partial_ref("GEN 3:5")
    assert verse.book == "GEN"
    assert verse.chapter == 3
    assert verse.verse == 5


@pytest.mark.phase6
@pytest.mark.resolve
def test_range_window_book_slices() -> None:
    """A whole-book window is one book; a cross-book window lists USX order."""
    whole = range_window("GEN", "GEN")
    assert whole.books == ("GEN",)

    cross = range_window("GEN", "LEV")
    assert cross.books == ("GEN", "EXO", "LEV")


@pytest.mark.phase6
@pytest.mark.resolve
def test_range_window_open_lower_and_verse_upper() -> None:
    """GEN to EXO 3:5 includes GEN 1:0 and EXO 3:5, and excludes EXO 3:6."""
    window = range_window("GEN", "EXO 3:5")
    assert verse_key("GEN", 1, 0) >= window.lower
    assert verse_key("EXO", 3, 5) <= window.upper
    assert verse_key("EXO", 3, 6) > window.upper


@pytest.mark.phase6
@pytest.mark.resolve
def test_range_window_reversed_raises_422() -> None:
    """Reversed books or reversed chapters inside one book are 422."""
    with pytest.raises(AppError) as reversed_books:
        range_window("EXO", "GEN")
    assert reversed_books.value.status_code == 422

    with pytest.raises(AppError) as reversed_chapter:
        range_window("GEN 5", "GEN 2")
    assert reversed_chapter.value.status_code == 422


@pytest.mark.phase6
@pytest.mark.resolve
def test_parse_partial_ref_rejects_unknown_and_malformed() -> None:
    """Unknown book codes are 422; malformed strings are 400."""
    with pytest.raises(AppError) as unknown:
        parse_partial_ref("ZZZ")
    assert unknown.value.status_code == 422

    for bad in ("GEN 3:", "GEN 3:5a", "GEN 1-2"):
        with pytest.raises(AppError) as malformed:
            parse_partial_ref(bad)
        assert malformed.value.status_code == 400, bad
