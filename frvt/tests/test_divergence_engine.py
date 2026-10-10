"""Parity between the divergence engine and the prototype goldens."""

from __future__ import annotations

import gzip
import json
import random
from pathlib import Path

import pytest
from frvt.divergence.report import build_comparison, load_scheme
from frvt.divergence.vrs_reader import parse_vrs_pairs

_DATA = Path(__file__).resolve().parents[1] / "tests" / "data" / "divergence"
_RESOURCES = Path(__file__).resolve().parents[1] / "resources"
_VRS = Path(__file__).resolve().parents[2] / "research" / "ParatextFormat"


def _golden(name: str) -> dict:
    """Load one gzipped oracle."""
    with gzip.open(_DATA / name, "rt", encoding="utf-8") as handle:
        return json.load(handle)


def _doc(name: str) -> dict:
    """Load a packaged canonical ingredient."""
    return json.loads((_RESOURCES / f"{name}.json").read_text(encoding="utf-8"))


def _pairs(name: str) -> list[tuple[str, str]]:
    """Parse a research .vrs file the way the prototype does."""
    return parse_vrs_pairs((_VRS / f"{name}.vrs").read_text(encoding="utf-8-sig"))


def _assert_match(actual: dict, expected: dict) -> None:
    """Compare events, runs, and warnings. Those are the prototype contract."""
    got = actual["comparisons"][0]
    want = expected["comparisons"][0]
    assert got["events"] == want["events"]
    assert got["runs"] == want["runs"]
    assert got["warnings"] == want["warnings"]


@pytest.mark.phase6
def test_published_eng_lxx_and_eng_rso() -> None:
    """eng.vrs plus packaged JSON matches the published prototype bundle."""
    org = load_scheme("org", _doc("org"))
    eng = load_scheme("eng", _doc("eng"), _pairs("eng"))
    lxx = load_scheme("lxx", _doc("lxx"))
    rso = load_scheme("rso", _doc("rso"))
    _assert_match(build_comparison(eng, lxx, org), _golden("eng-lxx-published.json.gz"))
    _assert_match(build_comparison(eng, rso, org), _golden("eng-rso-published.json.gz"))


@pytest.mark.phase6
def test_generated_supplements() -> None:
    """Both-sides and eng-only supplements match the generated oracles."""
    org = load_scheme("org", _doc("org"))
    eng = load_scheme("eng", _doc("eng"), _pairs("eng"))
    lxx = load_scheme("lxx", _doc("lxx"), _pairs("lxx"))
    vul = load_scheme("vul", _doc("vul"))
    _assert_match(
        build_comparison(eng, lxx, org),
        _golden("eng-lxx-both-vrs.json.gz"),
    )
    _assert_match(
        build_comparison(eng, vul, org),
        _golden("eng-vul-eng-vrs.json.gz"),
    )


@pytest.mark.phase6
def test_shuffled_mapping_order_keeps_events() -> None:
    """Dict key order is not part of the result once warnings are set aside."""
    org = load_scheme("org", _doc("org"))
    eng_doc = _doc("eng")
    lxx_doc = _doc("lxx")
    baseline = build_comparison(
        load_scheme("eng", eng_doc, _pairs("eng")),
        load_scheme("lxx", lxx_doc),
        org,
    )

    def shuffled(doc: dict, seed: int) -> dict:
        copy = json.loads(json.dumps(doc))
        rng = random.Random(seed)
        for key in ("mappedVerses", "maxVerses", "partialVerses"):
            if key in copy:
                items = list(copy[key].items())
                rng.shuffle(items)
                copy[key] = dict(items)
        return copy

    org_b = load_scheme("org", shuffled(_doc("org"), 3))
    varied = build_comparison(
        load_scheme("eng", shuffled(eng_doc, 1), _pairs("eng")),
        load_scheme("lxx", shuffled(lxx_doc, 2)),
        org_b,
    )
    assert varied["comparisons"][0]["events"] == baseline["comparisons"][0]["events"]
    assert varied["comparisons"][0]["runs"] == baseline["comparisons"][0]["runs"]


def test_flags_reach_the_payload() -> None:
    """Approximate and data-warning flags survive encoding when one side has no supplement."""
    org = load_scheme("org", _doc("org"))
    eng = load_scheme("eng", _doc("eng"), _pairs("eng"))
    lxx = load_scheme("lxx", _doc("lxx"))
    comparison = build_comparison(eng, lxx, org)["comparisons"][0]
    flags = {flag for event in comparison["events"] for flag in event[6]}
    letters = "".join(run[4] for run in comparison["runs"])
    assert {"approximate", "dataWarning"} <= flags
    assert "a" in letters
    assert "w" in letters
