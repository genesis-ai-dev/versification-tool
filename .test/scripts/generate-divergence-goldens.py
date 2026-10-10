"""Build gzipped divergence oracles from the prototype engine and its published data.

Set VERSIF_PROTOTYPE_DIR to the prototype checkout. The default is the shared
mount used while this repository and the prototype sit on the same machine.
"""

from __future__ import annotations

import gzip
import json
import os
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
PROTO = Path(
    os.environ.get(
        "VERSIF_PROTOTYPE_DIR",
        "/mnt/hgfs/files/versification-prototype",
    )
)
RESOURCES = REPO / "frvt" / "resources"
VRS = REPO / "research" / "ParatextFormat"
OUT = REPO / "frvt" / "tests" / "data" / "divergence"


def _load_proto():
    """Import the prototype engine and catalog from VERSIF_PROTOTYPE_DIR."""
    sys.path.insert(0, str(PROTO))
    from catalog import CATALOG
    from engine import LAYER, SEVERITY, Versification, build_events, build_runs, compose

    return CATALOG, LAYER, SEVERITY, Versification, build_events, build_runs, compose


def _bundle(comparison: dict, types: list, org: dict, catalog: list) -> dict:
    """Wrap one comparison in the wire-format document."""
    return {
        "types": types,
        "comparisons": [comparison],
        "org": org,
        "catalog": catalog,
    }


def _write(name: str, payload: dict) -> None:
    """Gzip one oracle into the test data directory."""
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / name
    raw = json.dumps(payload, separators=(",", ":")).encode()
    path.write_bytes(gzip.compress(raw))
    print(name, "events", len(payload["comparisons"][0]["events"]), "bytes", path.stat().st_size)


def _published(data: dict, cid: str) -> dict:
    """Lift one published comparison out of the prototype data bundle."""
    comparison = next(item for item in data["comparisons"] if item["id"] == cid)
    return _bundle(comparison, data["types"], data["org"], data["catalog"])


def _generated(label_a: str, label_b: str, a_vrs: bool, b_vrs: bool) -> dict:
    """Run the prototype engine on packaged JSON, optionally supplemented."""
    (
        CATALOG,
        LAYER,
        SEVERITY,
        Versification,
        build_events,
        build_runs,
        compose,
    ) = _load_proto()
    from catalog import NAME, SECTION, book_order

    def load(name: str, use_vrs: bool):
        doc = json.loads((RESOURCES / f"{name}.json").read_text(encoding="utf-8"))
        pairs = None
        if use_vrs:
            from engine import parse_vrs_pairs

            pairs = parse_vrs_pairs(str(VRS / f"{name}.vrs"))
        return Versification(name, doc, pairs)

    types = list(SEVERITY)
    org = load("org", False)
    side_a = load(label_a, a_vrs)
    side_b = load(label_b, b_vrs)
    relations = compose(side_a, side_b, org)
    events = build_events(relations, side_a, side_b)
    runs = build_runs(relations)
    books = sorted(set(side_a.max) | set(side_b.max), key=book_order)
    encoded = []
    for event in sorted(
        events,
        key=lambda item: (
            book_order((item["a"] or item["b"])[0]),
            (item["a"] or item["b"])[1:3],
        ),
    ):
        row = [
            types.index(event["type"]),
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
            types.index(run[3]) if run[3] in types else -1,
            run[4],
            run[5],
            run[6],
        ]
        for run in runs
    ]
    note = f"{label_a} vrs={a_vrs}; {label_b} vrs={b_vrs}"
    comparison = {
        "id": f"{label_a}-{label_b}",
        "a": label_a,
        "b": label_b,
        "mode": "schemes",
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
    type_rows = [
        {"id": name, "severity": SEVERITY[name], "layer": LAYER[name]} for name in types
    ]
    catalog = [[code, name, section] for code, name, section in CATALOG]
    return _bundle(comparison, type_rows, org.max, catalog)


def main() -> None:
    """Write the four oracles named by the execution plan."""
    data = json.loads((PROTO / "data.json").read_text(encoding="utf-8"))
    _write("eng-lxx-published.json.gz", _published(data, "eng-lxx"))
    _write("eng-rso-published.json.gz", _published(data, "eng-rso"))
    _write("eng-lxx-both-vrs.json.gz", _generated("eng", "lxx", True, True))
    _write("eng-vul-eng-vrs.json.gz", _generated("eng", "vul", True, False))


if __name__ == "__main__":
    main()
