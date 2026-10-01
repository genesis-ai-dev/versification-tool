"""Relation classification, including order inversions.

``classify`` mutates each relation in place. Order inversions are applied after
the first pass, and they replace whatever type the first pass chose.
"""

from __future__ import annotations

import bisect
import collections
from typing import Any

from frvt.divergence.catalog import book_order
from frvt.divergence.refs import verse_pos
from frvt.divergence.scheme import Scheme


def _lis_keep(seq: list[tuple[int, int, int]]) -> set[int]:
    """Indices of one longest non-decreasing subsequence."""
    tails: list[tuple[int, int, int]] = []
    tails_idx: list[int] = []
    prev = [-1] * len(seq)
    for index, value in enumerate(seq):
        place = bisect.bisect_right(tails, value)
        if place == len(tails):
            tails.append(value)
            tails_idx.append(index)
        else:
            tails[place] = value
            tails_idx[place] = index
        prev[index] = tails_idx[place - 1] if place > 0 else -1
    keep: set[int] = set()
    cursor = tails_idx[-1] if tails_idx else -1
    while cursor != -1:
        keep.add(cursor)
        cursor = prev[cursor]
    return keep


def _split_alternates(relation: dict[str, Any]) -> list[dict[str, Any]]:
    """Separate alternate book forms that share org verses.

    Same-book verses pair first. Leftovers on one side are alternates of text
    that already matched, not extra divergences.
    """
    books_a = {verse[0] for verse in relation["A"]}
    books_b = {verse[0] for verse in relation["B"]}
    common = books_a & books_b
    if not books_a or not books_b or (len(books_a) == 1 and len(books_b) == 1):
        return [relation]
    codes = relation.get("codes", {"a": set(), "b": set()})

    def _copy(
        verses_a: list[Any], verses_b: list[Any], *, warn: bool
    ) -> dict[str, Any]:
        return {
            "A": verses_a,
            "O": relation["O"],
            "B": verses_b,
            "flags": set(relation["flags"]),
            "warn": warn,
            "codes": {"a": set(codes["a"]), "b": set(codes["b"])},
        }

    if not common:
        if len(books_a) > 1:
            return [
                _copy(
                    [verse for verse in relation["A"] if verse[0] == book],
                    relation["B"],
                    warn=False,
                )
                for book in sorted(books_a, key=book_order)
            ]
        return [
            _copy(
                relation["A"],
                [verse for verse in relation["B"] if verse[0] == book],
                warn=False,
            )
            for book in sorted(books_b, key=book_order)
        ]
    out: list[dict[str, Any]] = []
    for book in sorted(common, key=book_order):
        out.append(
            _copy(
                [verse for verse in relation["A"] if verse[0] == book],
                [verse for verse in relation["B"] if verse[0] == book],
                warn=False,
            )
        )
    left_a = [verse for verse in relation["A"] if verse[0] not in common]
    left_b = [verse for verse in relation["B"] if verse[0] not in common]
    if left_a and left_b:
        out.append(_copy(left_a, left_b, warn=relation["warn"]))
    return out


def classify(relations: list[dict[str, Any]], side_a: Scheme, side_b: Scheme) -> None:
    """Assign ``type``, ``rel``, ``Ap``, and ``Bp`` on each relation.

    Merges, splits, and segments are marked approximate unless both sides have
    multi-target data. Verses that leave the longest increasing backbone become
    order inversions.
    """
    for relation in relations:
        present_a = [verse for verse in relation["A"] if verse not in side_a.excluded]
        present_b = [verse for verse in relation["B"] if verse not in side_b.excluded]
        relation["Ap"] = present_a
        relation["Bp"] = present_b
        count_a, count_b = len(present_a), len(present_b)
        relation["rel"] = (
            f"{'n' if count_a > 1 else count_a}:{'n' if count_b > 1 else count_b}"
        )
        if count_a == 0 and count_b == 0:
            relation["type"] = None
            continue
        if count_a == 0 or count_b == 0:
            if count_a == 0:
                relation["type"] = "EXCLUDED" if relation["A"] else "ONE_SIDED"
            else:
                relation["type"] = "EXCLUDED" if relation["B"] else "ONE_SIDED"
            if "noanchor" in relation["flags"]:
                relation["warn"] = True
                codes = relation.setdefault("codes", {"a": set(), "b": set()})
                codes["a" if relation["A"] else "b"].add("no_org_anchor")
            continue
        books = {verse[0] for verse in present_a} | {verse[0] for verse in present_b}
        if len(books) > 1:
            relation["type"] = "CROSS_BOOK"
        elif {(verse[0], verse[1]) for verse in present_a} != {
            (verse[0], verse[1]) for verse in present_b
        }:
            relation["type"] = "CHAPTER_MOVE"
        elif count_a == 1 and count_b == 1:
            left, right = present_a[0], present_b[0]
            if left == right:
                relation["type"] = None
            elif left[2] == 0 or right[2] == 0:
                relation["type"] = "VERSE0_TITLE"
            else:
                relation["type"] = "RENUMBER"
        elif present_a == present_b:
            relation["type"] = None
        elif "segment" in relation["flags"]:
            relation["type"] = "SEGMENT"
        elif count_a > count_b:
            relation["type"] = "MERGE"
        elif count_a < count_b:
            relation["type"] = "SPLIT"
        else:
            relation["type"] = "RENUMBER"
        if relation["type"] in ("MERGE", "SPLIT", "SEGMENT") and not (
            side_a.has_vrs and side_b.has_vrs
        ):
            relation["flags"].add("approx")
    by_book: dict[str, list[dict[str, Any]]] = collections.defaultdict(list)
    for relation in relations:
        if relation["Ap"] and relation["Bp"]:
            by_book[relation["Ap"][0][0]].append(relation)
    for group in by_book.values():
        group.sort(key=lambda relation: verse_pos(relation["Ap"][0]))
        seq = [verse_pos(relation["Bp"][0]) for relation in group]
        keep = _lis_keep(seq)
        for index, relation in enumerate(group):
            if index not in keep:
                relation["type"] = "ORDER_INVERSION"


def split_alternates(relation: dict[str, Any]) -> list[dict[str, Any]]:
    """Split one component into same-book pairs. See ``_split_alternates``."""
    return _split_alternates(relation)
