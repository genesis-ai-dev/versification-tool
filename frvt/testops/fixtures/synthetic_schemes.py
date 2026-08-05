"""Synthetic Copenhagen-style ingredients for exclude/merge/complex resolve cases.

These builders return minimal valid-shaped ingredients for T4/T5/T11-style tests.
Merge/complex mapping rows that need an explicit ``base_ref`` are typically seeded
via ``MappingRecord`` after upload when the ingredient shape alone is insufficient.
"""

from __future__ import annotations

from typing import Any

from frvt.api.logging_config import get_logger

logger = get_logger(__name__)


def exclude_ingredient(*, based_on: str = "org") -> dict[str, Any]:
    """Return an ingredient that excludes a single verse for exclude-relation tests."""
    logger.debug("Building exclude ingredient based_on=%s", based_on)
    return {
        "basedOn": based_on,
        "maxVerses": {"GEN": ["1"]},
        "excludedVerses": ["GEN 1:1"],
        "mappedVerses": {},
        "partialVerses": {},
        "mergedVerses": [],
    }


def merge_ingredient(*, based_on: str = "org") -> dict[str, Any]:
    """Return a shell ingredient for merge tests (mapping rows seeded in the test)."""
    logger.debug("Building merge ingredient shell based_on=%s", based_on)
    return {
        "basedOn": based_on,
        "maxVerses": {"GEN": ["2"]},
        "excludedVerses": [],
        "mappedVerses": {},
        "partialVerses": {},
        "mergedVerses": [],
    }


def complex_left_ingredient(*, based_on: str = "org") -> dict[str, Any]:
    """Return a left-side ingredient for complex hull tests (merge via shared pivot)."""
    logger.debug("Building complex left ingredient based_on=%s", based_on)
    return {
        "basedOn": based_on,
        "maxVerses": {"GEN": ["31"]},
        "excludedVerses": [],
        "mappedVerses": {"GEN 1:1-2": "GEN 1:1"},
        "partialVerses": {},
        "mergedVerses": ["GEN 1:1-2"],
    }


def complex_right_ingredient(*, based_on: str = "org") -> dict[str, Any]:
    """Return a right-side ingredient for complex hull tests (merge via shared pivot)."""
    logger.debug("Building complex right ingredient based_on=%s", based_on)
    return {
        "basedOn": based_on,
        "maxVerses": {"GEN": ["31"]},
        "excludedVerses": [],
        "mappedVerses": {"GEN 1:10-11": "GEN 1:1"},
        "partialVerses": {},
        "mergedVerses": ["GEN 1:10-11"],
    }


def complex_ingredient(*, based_on: str = "org") -> dict[str, Any]:
    """Return the left-side complex ingredient (pair with ``complex_right_ingredient``)."""
    return complex_left_ingredient(based_on=based_on)


def unequal_range_ingredient(*, based_on: str = "org") -> dict[str, Any]:
    """Return an ingredient with unequal source/target range lengths for zip clamp."""
    logger.debug("Building unequal-range ingredient based_on=%s", based_on)
    return {
        "basedOn": based_on,
        "maxVerses": {"GEN": ["3"]},
        "excludedVerses": [],
        "mappedVerses": {"GEN 1:1-3": "GEN 1:1-2"},
        "partialVerses": {},
        "mergedVerses": [],
    }


def partial_ingredient(*, based_on: str = "org") -> dict[str, Any]:
    """Return an ingredient with a partial-verse part for T12 resolve tests."""
    logger.debug("Building partial ingredient based_on=%s", based_on)
    return {
        "basedOn": based_on,
        "maxVerses": {"SIR": ["36"]},
        "excludedVerses": [],
        "mappedVerses": {},
        "partialVerses": {"SIR 36:13": ["a"]},
        "mergedVerses": [],
    }


def gen_partial_ingredient(*, based_on: str = "org") -> dict[str, Any]:
    """Return a GEN 1:1 partial used with sample translations that contain text."""
    logger.debug("Building GEN partial ingredient based_on=%s", based_on)
    return {
        "basedOn": based_on,
        "maxVerses": {"GEN": ["31"]},
        "excludedVerses": [],
        "mappedVerses": {},
        "partialVerses": {"GEN 1:1": ["a"]},
        "mergedVerses": [],
    }


def psalm_style_a_ingredient(*, based_on: str = "org") -> dict[str, Any]:
    """Return an English-style psalm ingredient for complementary cancel tests."""
    logger.debug("Building psalm style-A ingredient based_on=%s", based_on)
    return {
        "basedOn": based_on,
        "maxVerses": {"PSA": ["150"], "1SA": ["31"], "GEN": ["50"]},
        "excludedVerses": [],
        "mappedVerses": {
            "PSA 3:1-8": "PSA 3:2-9",
            "1SA 20:42": "1SA 21:1",
            "GEN 31:55": "GEN 32:1",
        },
        "partialVerses": {},
        "mergedVerses": [],
    }


def psalm_style_b_ingredient(*, based_on: str = "org") -> dict[str, Any]:
    """Return a psalm-title (verse 0) ingredient for complementary cancel tests."""
    logger.debug("Building psalm style-B ingredient based_on=%s", based_on)
    return {
        "basedOn": based_on,
        "maxVerses": {"PSA": ["150"]},
        "excludedVerses": [],
        "mappedVerses": {"PSA 3:0-8": "PSA 3:1-9"},
        "partialVerses": {},
        "mergedVerses": [],
    }
