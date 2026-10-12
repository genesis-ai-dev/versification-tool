"""Database-path parity for a schemes-mode divergence report."""

from __future__ import annotations

import gzip
import json
from pathlib import Path

import pytest
from frvt.api.divergence.compute import _note, compute_report
from frvt.api.divergence.inputs import LoadedSide
from frvt.api.divergence.keys import ReportKey
from frvt.api.divergence.registry import claim_report
from frvt.api.models import Translation, VersificationScheme
from frvt.divergence.scheme import Scheme
from sqlalchemy import select
from sqlalchemy.orm import Session

_GOLDEN = (
    Path(__file__).resolve().parents[1]
    / "tests"
    / "data"
    / "divergence"
    / "eng-rso-published.json.gz"
)


def test_note_mentions_multi_target_lines_only_when_present() -> None:
    """An empty supplement is not described as containing mapping lines."""
    empty = _side("demo", [], supplement_lines=False)
    present = _side("eng", [("GEN 1:1", "GEN 1:1")], supplement_lines=True)
    assert _note(empty, empty) == "Texts mode."
    assert _note(present, present) == (
        "Texts mode. eng includes multi-target lines from its source file. "
        "eng includes multi-target lines from its source file."
    )


def _side(
    label: str,
    pairs: list[tuple[str, str]],
    *,
    supplement_lines: bool,
) -> LoadedSide:
    """One side whose note depends only on the supplement flag."""
    return LoadedSide(
        scheme=Scheme(label, {"maxVerses": {"GEN": ["31"]}}, pairs),
        fidelity="source",
        multi_target=True,
        text_facts=True,
        supplement_lines=supplement_lines,
    )


@pytest.mark.phase6
def test_anchor_eng_rso_matches_published(seeded_session: Session) -> None:
    """Anchor translations have no spans, so the report is schemes mode."""
    eng_t = seeded_session.scalar(select(Translation).where(Translation.name == "eng"))
    rso_t = seeded_session.scalar(select(Translation).where(Translation.name == "rso"))
    eng_s = seeded_session.scalar(
        select(VersificationScheme).where(VersificationScheme.name == "eng")
    )
    rso_s = seeded_session.scalar(
        select(VersificationScheme).where(VersificationScheme.name == "rso")
    )
    assert eng_t and rso_t and eng_s and rso_s
    claim = claim_report(
        seeded_session,
        ReportKey(eng_t.id, eng_s.id, rso_t.id, rso_s.id),
    )
    seeded_session.commit()
    compute_report(seeded_session, claim.report.id)
    row = claim.report
    seeded_session.refresh(row)
    assert row.status == "ready"
    assert row.payload is not None
    payload = json.loads(row.payload)
    with gzip.open(_GOLDEN, "rt", encoding="utf-8") as handle:
        expected = json.load(handle)
    assert payload["comparisons"][0]["events"] == expected["comparisons"][0]["events"]
    sides = {side[0]: side for side in payload["sides"]}
    assert sides["a"][3] is True
    assert sides["b"][3] is False
