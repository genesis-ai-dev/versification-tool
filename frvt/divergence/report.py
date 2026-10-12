"""Build one wire-format comparison from two loaded schemes."""

from __future__ import annotations

from typing import Any

from frvt.api.logging_config import get_logger
from frvt.divergence.catalog import CATALOG, NAME, SECTION, book_order
from frvt.divergence.compose import compose_schemes
from frvt.divergence.events import build_events
from frvt.divergence.progress import Progress
from frvt.divergence.runs import build_runs
from frvt.divergence.scheme import Scheme
from frvt.divergence.taxonomy import ENGINE_VERSION, LAYER, SEVERITY, TYPE_IDS

# Sentences shown on a data-warning chip. Kept beside the encoder so the
# payload and the UI share one wording.
WARNING_DETAILS = {
    "unequal_ranges": (
        "The two ranges have different lengths and were aligned verse by verse. "
        "Treat the pairing as approximate."
    ),
    "identity_collision": (
        "A default identity and an explicit mapping both claim this org verse, "
        "inside one book and across more than one chapter."
    ),
    "no_org_anchor": (
        "This verse maps to a reference that does not exist in the org scheme."
    ),
}

logger = get_logger(__name__)


def load_scheme(
    label: str,
    doc: dict[str, Any],
    vrs_pairs: list[tuple[str, str]] | None = None,
) -> Scheme:
    """Load one scheme document. ``vrs_pairs`` is the multi-target supplement."""
    logger.debug(
        "Loading scheme label=%s mappings=%s supplement=%s",
        label,
        len(doc.get("mappedVerses", {})),
        vrs_pairs is not None,
    )
    return Scheme(label, doc, vrs_pairs)


def build_comparison(
    side_a: Scheme,
    side_b: Scheme,
    org: Scheme,
    *,
    mode: str = "schemes",
    note: str = "",
    progress: Progress | None = None,
) -> dict[str, Any]:
    """Compose, classify, and encode one comparison in the prototype wire format.

    Events are sorted by the anchor side's book and first coordinate. Warnings
    keep insertion order and are capped at 200 in the payload; the counts are
    the full lengths.
    """
    logger.debug("Building comparison %s vs %s", side_a.label, side_b.label)

    def _advance(stage: str) -> None:
        callback = progress
        if callback is not None:
            callback.advance(stage, 0, 0)

    _advance("composing")
    relations = compose_schemes(side_a, side_b, org)
    _advance("classifying")
    _advance("events")
    events = build_events(relations, side_a, side_b)
    _advance("runs")
    runs = build_runs(relations)
    _advance("encoding")
    books = sorted(set(side_a.max) | set(side_b.max), key=book_order)
    encoded: list[list[Any]] = []
    ordered = sorted(
        events,
        key=lambda event: (
            book_order((event["a"] or event["b"])[0]),
            (event["a"] or event["b"])[1:3],
        ),
    )
    for event in ordered:
        row: list[Any] = [
            TYPE_IDS.index(event["type"]),
            event["a"],
            event["o"],
            event["b"],
            event["n"],
            event["rel"],
            event["flags"],
        ]
        if event["type"] == "SEGMENT" and "segA" in event:
            row += [event["segA"], event["segB"]]
        encoded.append(row)
    encoded_runs = [
        [
            run[0],
            run[1],
            run[2],
            TYPE_IDS.index(run[3]) if run[3] in TYPE_IDS else -1,
            run[4],
            run[5],
            run[6],
        ]
        for run in runs
    ]
    logger.debug(
        "Comparison %s vs %s has %s events", side_a.label, side_b.label, len(encoded)
    )
    event_notes: list[list[object]] = []
    for index, event in enumerate(ordered):
        for side, code in event.get("codes", ()):
            event_notes.append([index, side, code, WARNING_DETAILS.get(code, code)])
    return {
        "types": [
            {"id": name, "severity": SEVERITY[name], "layer": LAYER[name]}
            for name in TYPE_IDS
        ],
        "comparisons": [
            {
                "id": f"{side_a.label}-{side_b.label}",
                "a": side_a.label,
                "b": side_b.label,
                "mode": mode,
                "note": note,
                "books": [
                    {
                        "code": book,
                        "name": NAME.get(book, book),
                        "section": SECTION.get(book, "NC"),
                        "a": side_a.max.get(book),
                        "b": side_b.max.get(book),
                    }
                    for book in books
                ],
                "events": encoded,
                "runs": encoded_runs,
                "warnings": {
                    "a": side_a.warnings[:200],
                    "b": side_b.warnings[:200],
                    "aCount": len(side_a.warnings),
                    "bCount": len(side_b.warnings),
                },
            }
        ],
        "org": org.max,
        "catalog": [[code, name, section] for code, name, section in CATALOG],
        "eventNotes": event_notes,
        "sides": [
            ["a", side_a.label, "source", bool(side_a.has_vrs), False],
            ["b", side_b.label, "source", bool(side_b.has_vrs), False],
        ],
        "engineVersion": ENGINE_VERSION,
    }
