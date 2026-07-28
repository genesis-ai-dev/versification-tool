"""Multi-hop chain test bed fixtures, inference, and parity verification."""

from __future__ import annotations

import io
import zipfile
from dataclasses import dataclass
from typing import Any

from frvt.api.logging_config import get_logger
from frvt.testops.fixtures.visual_demo_corpus import (
    _METADATA,
    _SAMPLE_ZIPS,
    demo_max_verses,
    ensure_psa_verse0,
    extract_usx_books,
    identity_vrs,
)

logger = get_logger(__name__)

MULTIHOP_BOOKS = frozenset({"JHN", "PSA", "GEN", "ACT"})


@dataclass(frozen=True)
class ParityCase:
    """Two-hop vs baseline parity row for spanish-eng chain tests."""

    id: str
    ref: str
    expect_nontrivial_hops: bool
    notes: str = ""


def multihop_max_verses() -> dict[str, list[str]]:
    """Return per-chapter maxima for multihop book subset."""
    full = demo_max_verses()
    return {book: full[book] for book in sorted(MULTIHOP_BOOKS)}


def engdemo_ingredient() -> dict[str, Any]:
    """Return hop-2 engdemo scheme with decomposed org paths."""
    logger.debug("Building engdemo hop-2 ingredient")
    return {
        "basedOn": "org",
        "maxVerses": multihop_max_verses(),
        "mappedVerses": {
            "GEN 31:55": "GEN 32:1",
            "PSA 3:0": "PSA 3:1",
            "PSA 3:1": "PSA 3:2",
            "PSA 3:2": "PSA 3:3",
            "GEN 2:10": "GEN 2:11",
            "GEN 2:11": "GEN 2:12",
        },
        "excludedVerses": [],
        "mergedVerses": [],
        "partialVerses": {},
    }


def spanish_org_ref_ingredient() -> dict[str, Any]:
    """Return baseline spanish-org-ref direct org mappings."""
    logger.debug("Building spanish-org-ref baseline ingredient")
    return {
        "basedOn": "org",
        "maxVerses": multihop_max_verses(),
        "mappedVerses": {
            "GEN 31:55": "GEN 32:1",
            "PSA 3:0": "PSA 3:2",
            "PSA 3:1": "PSA 3:3",
            "GEN 2:10": "GEN 2:12",
        },
        "excludedVerses": ["ACT 24:7"],
        "mergedVerses": [],
        "partialVerses": {},
    }


def _reverse_hop_targets(mapped: dict[str, str]) -> dict[str, list[str]]:
    """Build org-target → list of source refs for engdemo hop-2 rows."""
    index: dict[str, list[str]] = {}
    for source, target in mapped.items():
        index.setdefault(target, []).append(source)
    return index


def infer_spanish_eng_ingredient(
    org_ref: dict[str, Any],
    engdemo: dict[str, Any],
) -> dict[str, Any]:
    """Infer hop-1 spanish-eng mappings via org-pivot (Inference B).

    For each ``S → O`` in ``org_ref`` find unique ``E`` with ``E → O`` in
    ``engdemo``. Raises ``ValueError`` when no match or ambiguous multi-source.
    """
    logger.debug("Inferring spanish-eng hop-1 ingredient")
    reverse = _reverse_hop_targets(engdemo.get("mappedVerses", {}))
    hop1: dict[str, str] = {}
    for source, org_target in org_ref.get("mappedVerses", {}).items():
        candidates = reverse.get(org_target, [])
        if not candidates:
            raise ValueError(f"No engdemo source for org target {org_target} ({source})")
        if len(candidates) > 1:
            raise ValueError(
                f"Ambiguous engdemo sources for {org_target}: {candidates}"
            )
        hop1[source] = candidates[0]
    return {
        "basedOn": "engdemo",
        "maxVerses": org_ref.get("maxVerses", multihop_max_verses()),
        "mappedVerses": hop1,
        "excludedVerses": list(org_ref.get("excludedVerses", [])),
        "mergedVerses": [],
        "partialVerses": {},
    }


def verify_parity_pair(baseline: dict[str, Any], chain: dict[str, Any]) -> list[str]:
    """Compare resolve JSON bodies; return human-readable mismatch strings."""
    errors: list[str] = []
    if baseline.get("relation") != chain.get("relation"):
        errors.append(
            f"relation {baseline.get('relation')!r} != {chain.get('relation')!r}"
        )

    def _bcv_set(body: dict[str, Any]) -> set[tuple[str, int, int, str | None]]:
        spans = body.get("target_spans") or []
        return {
            (s["book"], s["chapter"], s["verse"], s.get("part"))
            for s in spans
        }

    base_targets = _bcv_set(baseline)
    chain_targets = _bcv_set(chain)
    if base_targets != chain_targets:
        errors.append(f"target BCV sets differ: {base_targets} vs {chain_targets}")
    base_empty = len(baseline.get("target_spans") or []) == 0
    chain_empty = len(chain.get("target_spans") or []) == 0
    if base_empty != chain_empty:
        errors.append("exclude emptiness mismatch")
    return errors


def build_spanish_org_zip() -> bytes:
    """Build Spanish multihop carrier zip (identity VRS, four books + PSA verse-0)."""
    logger.debug("Building spanish-org project zip")
    usx = extract_usx_books(_SAMPLE_ZIPS["es"], MULTIHOP_BOOKS)
    usx["PSA"] = ensure_psa_verse0(usx["PSA"], chapter=3)
    max_verses = multihop_max_verses()
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("metadata.xml", _METADATA.format(language="es"))
        archive.writestr("release/versification.vrs", identity_vrs(max_verses))
        for book, content in sorted(usx.items()):
            archive.writestr(f"release/USX_1/{book}.usx", content)
    return buffer.getvalue()


PARITY_CASES: tuple[ParityCase, ...] = (
    ParityCase("P-ident", "JHN 3:16", False),
    ParityCase("P-psa-title", "PSA 3:0", True),
    ParityCase("P-gen-chain", "GEN 2:10", True),
    ParityCase("P-renumber", "GEN 31:55", False, notes="hop2 only"),
    ParityCase("P-exclude", "ACT 24:7", False),
)

NONTRIVIAL_HOP_CASES: tuple[str, ...] = ("P-psa-title", "P-gen-chain")
