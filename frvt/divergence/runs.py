"""Ladder runs: contiguous 1:1 relations with a constant offset merge into bands."""

from __future__ import annotations

from typing import Any

from frvt.divergence.refs import span, verse_pos


def _offset(relation: dict[str, Any], side: str) -> tuple[str, int, int]:
    """Book and chapter/verse offset from the first A verse to ``side``."""
    left, right = relation["A"][0], relation[side][0]
    return (right[0], right[1] - left[1], right[2] - left[2])


def build_runs(relations: list[dict[str, Any]]) -> list[list[Any]]:
    """Return ladder rows in the prototype's seven-column shape.

    The type column is the type name (or ``SAME``). ``build_comparison`` replaces
    it with a type index. Flag letters are ``a``, ``w``, ``v``, and ``s``.
    """
    rows: list[dict[str, Any]] = []
    ordered = sorted(
        relations, key=lambda relation: verse_pos((relation["A"] or relation["B"])[0])
    )
    current: dict[str, Any] | None = None
    for relation in ordered:
        simple = (
            len(relation["A"]) == 1
            and len(relation["B"]) == 1
            and len(relation["O"]) == 1
        )
        type_name = relation.get("etype") or relation["type"] or "SAME"
        if (
            current
            and simple
            and current["simple"]
            and current["t"] == type_name
            and _offset(relation, "O") == current["dO"]
            and _offset(relation, "B") == current["dB"]
            and relation["A"][0][0] == current["A"][-1][0]
            and relation["A"][0][1] == current["A"][-1][1]
            and relation["A"][0][2] == current["A"][-1][2] + 1
        ):
            for key in "AOB":
                current[key].append(relation[key][0])
            current["fl"] |= relation["flags"]
            continue
        if current:
            rows.append(current)
        current = {
            "A": list(relation["A"]),
            "O": list(relation["O"]),
            "B": list(relation["B"]),
            "t": type_name,
            "simple": simple,
            "fl": set(relation["flags"]) | ({"warn"} if relation["warn"] else set()),
            "exA": [verse for verse in relation["A"] if verse not in relation["Ap"]],
            "exB": [verse for verse in relation["B"] if verse not in relation["Bp"]],
        }
        if simple:
            current["dO"] = _offset(relation, "O")
            current["dB"] = _offset(relation, "B")
    if current:
        rows.append(current)
    letters = {"approx": "a", "warn": "w", "vrs": "v", "segment": "s"}
    encoded: list[list[Any]] = []
    for row in rows:
        encoded.append(
            [
                span(sorted(row["A"], key=verse_pos)),
                span(sorted(row["O"], key=verse_pos)),
                span(sorted(row["B"], key=verse_pos)),
                row["t"],
                "".join(sorted(letters.get(flag, "") for flag in row["fl"])),
                1 if row["exA"] else 0,
                1 if row["exB"] else 0,
            ]
        )
    return encoded
