"""Visual Demo Corpus Copenhagen schemes and verification case tables."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from frvt.api.logging_config import get_logger
from frvt.testops.fixtures.synthetic_schemes import (
    psalm_style_a_ingredient,
    psalm_style_b_ingredient,
)
from frvt.testops.fixtures.visual_demo_corpus import demo_max_verses

logger = get_logger(__name__)


@dataclass(frozen=True)
class VerificationCase:
    """Resolve contract row for overlay/category regression tests."""

    id: str
    from_scheme: str
    to_scheme: str
    ref: str
    part: str | None
    expected_relation: str
    notes: str = ""


@dataclass(frozen=True)
class CategoryCase:
    """Jump-menu category navigation row for manual and automated QA."""

    id: str
    scheme: str
    ref: str
    expected_category: str
    notes: str = ""


def scheme_a_ingredient() -> dict[str, Any]:
    """Return visual-demo-scheme-a ingredient (A-side divergence from org)."""
    logger.debug("Building visual-demo-scheme-a ingredient")
    return {
        "basedOn": "org",
        "maxVerses": demo_max_verses(),
        "mappedVerses": {
            "PSA 3:0-8": "PSA 3:1-9",
            "GEN 31:55": "GEN 32:1",
            "GEN 2:1": "GEN 2:2",
            "GEN 2:5-7": "GEN 2:4-5",
            "GEN 1:1-2": "GEN 1:1",
        },
        "excludedVerses": ["ACT 24:7"],
        "mergedVerses": ["GEN 1:1-2"],
        "partialVerses": {"SIR 36:13": ["a"]},
    }


def scheme_b_ingredient() -> dict[str, Any]:
    """Return visual-demo-scheme-b ingredient (B-side divergence from org)."""
    logger.debug("Building visual-demo-scheme-b ingredient")
    return {
        "basedOn": "org",
        "maxVerses": demo_max_verses(),
        "mappedVerses": {
            "PSA 3:1-8": "PSA 3:2-9",
            "GEN 31:55": "GEN 32:1",
            "GEN 2:1": "GEN 3:1",
            "GEN 1:10-11": "GEN 1:1",
        },
        "excludedVerses": [],
        "mergedVerses": ["GEN 1:10-11"],
        "partialVerses": {},
    }


def lxx_ingredient() -> dict[str, Any]:
    """Return LXX-named scheme for ``lxx_psalm`` jump category tests."""
    base = scheme_a_ingredient()
    return {
        **base,
        "mappedVerses": {"PSA 3:0-8": "PSA 3:1-9"},
        "mergedVerses": [],
    }


def synodal_ingredient() -> dict[str, Any]:
    """Return synodal-named scheme for synodal jump category tests."""
    return {
        "basedOn": "org",
        "maxVerses": demo_max_verses(),
        "mappedVerses": {"GEN 31:55": "GEN 32:1"},
        "excludedVerses": [],
        "mergedVerses": [],
        "partialVerses": {},
    }


def nt_omit_ingredient() -> dict[str, Any]:
    """Return NT omission scheme for ``nt_omission`` category tests."""
    return {
        "basedOn": "org",
        "maxVerses": demo_max_verses(),
        "mappedVerses": {},
        "excludedVerses": ["ACT 24:7"],
        "mergedVerses": [],
        "partialVerses": {},
    }


def psalm_a_ingredient() -> dict[str, Any]:
    """Return psalm style A for cancel-filter jump tests."""
    return psalm_style_a_ingredient()


def psalm_b_ingredient() -> dict[str, Any]:
    """Return psalm style B for cancel-filter jump tests."""
    return psalm_style_b_ingredient()


SCHEME_BUILDERS: dict[str, Any] = {
    "visual-demo-scheme-a": scheme_a_ingredient,
    "visual-demo-scheme-b": scheme_b_ingredient,
    "visual-demo-lxx": lxx_ingredient,
    "visual-demo-synodal": synodal_ingredient,
    "visual-demo-nt-omit": nt_omit_ingredient,
    "visual-demo-psalm-a": psalm_a_ingredient,
    "visual-demo-psalm-b": psalm_b_ingredient,
}


VERIFICATION_CASES: tuple[VerificationCase, ...] = (
    VerificationCase("C-ident", "scheme-a", "scheme-b", "JHN 3:16", None, "one_to_one"),
    VerificationCase("C-shift", "scheme-a", "identity-es", "PSA 3:1", None, "shift"),
    VerificationCase("C-renumber", "scheme-a", "identity-es", "GEN 31:55", None, "renumber"),
    VerificationCase("C-shift-renum", "scheme-a", "scheme-b", "GEN 2:1", None, "shift"),
    VerificationCase("C-chapter-count", "scheme-a", "identity-es", "GEN 2:5", None, "renumber"),
    VerificationCase("C-exclude", "scheme-a", "scheme-b", "ACT 24:7", None, "exclude"),
    VerificationCase("C-merge", "scheme-a", "identity-es", "GEN 1:1", None, "merge"),
    VerificationCase("C-split", "identity-en", "scheme-b", "GEN 1:1", None, "split"),
    VerificationCase("C-complex", "scheme-a", "scheme-b", "GEN 1:1", None, "complex"),
    VerificationCase("C-partial", "scheme-a", "identity-es", "SIR 36:13", "a", "partial"),
    VerificationCase(
        "C-cancel-jump",
        "psalm-a",
        "psalm-b",
        "PSA 3:1",
        None,
        "one_to_one",
        notes="jump entry absent after cancel filter",
    ),
)

CATEGORY_CASES: tuple[CategoryCase, ...] = (
    CategoryCase("CAT-psalm-title", "scheme-a", "PSA 3:1", "psalm_title"),
    CategoryCase("CAT-lxx", "visual-demo-lxx", "PSA 3:0", "lxx_psalm"),
    CategoryCase("CAT-synodal", "visual-demo-synodal", "GEN 31:55", "synodal"),
    CategoryCase("CAT-nt-omit", "visual-demo-nt-omit", "ACT 24:7", "nt_omission"),
    CategoryCase("CAT-chapter-boundary", "scheme-a", "GEN 31:55", "chapter_boundary"),
    CategoryCase("CAT-chapter-count", "scheme-a", "GEN 2:5", "chapter_count"),
    CategoryCase("CAT-other", "scheme-a", "JHN 3:16", "other"),
    CategoryCase(
        "CAT-cancel",
        "psalm-a",
        "PSA 3:1",
        "cancel",
        notes="entry not in misalignments with psalm-a vs psalm-b",
    ),
)
