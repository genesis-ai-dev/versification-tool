"""Compose two schemes through org into classified relations.

The disjoint-set links each side's verse to the org verses it maps to. A
connected component becomes one relation, then alternate book forms are split
and the component is classified.
"""

from __future__ import annotations

import collections
from typing import Any

from frvt.divergence.classify import classify, split_alternates
from frvt.divergence.refs import Verse, verse_pos
from frvt.divergence.scheme import Scheme


class _DisjointSet:
    """Union-find with path compression. Used only while composing one pair."""

    def __init__(self) -> None:
        self._parent: dict[tuple[str, Verse], tuple[str, Verse]] = {}

    def find(self, node: tuple[str, Verse]) -> tuple[str, Verse]:
        """Return the representative of ``node``, compressing the path."""
        self._parent.setdefault(node, node)
        while self._parent[node] != node:
            self._parent[node] = self._parent[self._parent[node]]
            node = self._parent[node]
        return node

    def union(self, left: tuple[str, Verse], right: tuple[str, Verse]) -> None:
        """Join the sets that contain the two nodes."""
        root_left, root_right = self.find(left), self.find(right)
        if root_left != root_right:
            self._parent[root_right] = root_left

    def nodes(self) -> list[tuple[str, Verse]]:
        """Every node that was inserted, in insertion order."""
        return list(self._parent)


def compose_schemes(
    side_a: Scheme, side_b: Scheme, org: Scheme | None = None
) -> list[dict[str, Any]]:
    """Return classified relations for A through org to B.

    ``org`` may be omitted only in tests that already speak a shared numbering.
    Production calls pass the root scheme.
    """
    parts = _DisjointSet()
    canon: dict[Verse, Verse] = {}
    if org is not None:
        for source, targets in org.edges.items():
            if len(targets) == 1:
                canon[source] = next(iter(targets))
    org_books = set(org.max) if org is not None else None
    flags_of: dict[tuple[str, Verse], set[str]] = collections.defaultdict(set)
    org_sources: dict[Verse, dict[str, list[tuple[Verse, bool]]]] = (
        collections.defaultdict(lambda: {"A": [], "B": []})
    )
    for side, scheme, verses in (
        ("A", side_a, side_a.verses()),
        ("B", side_b, side_b.verses()),
    ):
        for verse in verses:
            targets, default = scheme.to_org(verse)
            if verse[2] == 0 and default:
                continue
            node = (side, verse)
            parts.find(node)
            for org_verse, edge_flags in targets.items():
                mapped = canon.get(org_verse, org_verse)
                if (
                    default
                    and org_books is not None
                    and org is not None
                    and not org._exists(*mapped)
                    and mapped[0] not in org_books
                ):
                    flags_of[node].add("noanchor")
                parts.union(node, ("O", mapped))
                flags_of[node] |= edge_flags
                org_sources[mapped][side].append((verse, default))
    collide: set[tuple[str, Verse]] = set()
    for grouped in org_sources.values():
        for side in "AB":
            sources = grouped[side]
            if (
                len(sources) > 1
                and any(default for _, default in sources)
                and any(not default for _, default in sources)
                and len({verse[0] for verse, _ in sources}) == 1
                and len({(verse[0], verse[1]) for verse, _ in sources}) > 1
            ):
                for verse, _ in sources:
                    collide.add((side, verse))
    components: dict[tuple[str, Verse], dict[str, list[Verse]]] = (
        collections.defaultdict(lambda: {"A": [], "O": [], "B": []})
    )
    for node in parts.nodes():
        components[parts.find(node)][node[0]].append(node[1])
    relations: list[dict[str, Any]] = []
    for members in components.values():
        verses_a = sorted(members["A"], key=verse_pos)
        verses_b = sorted(members["B"], key=verse_pos)
        verses_o = sorted(members["O"], key=verse_pos)
        if not verses_a and not verses_b:
            continue
        flags: set[str] = set()
        for verse in verses_a:
            flags |= flags_of[("A", verse)]
        for verse in verses_b:
            flags |= flags_of[("B", verse)]
        warn = (
            any(("A", verse) in collide for verse in verses_a)
            or any(("B", verse) in collide for verse in verses_b)
            or "warn" in flags
        )
        codes: dict[str, set[str]] = {"a": set(), "b": set()}
        for verse in verses_a:
            codes["a"] |= side_a._codes.get(verse, set())
            if ("A", verse) in collide:
                codes["a"].add("identity_collision")
        for verse in verses_b:
            codes["b"] |= side_b._codes.get(verse, set())
            if ("B", verse) in collide:
                codes["b"].add("identity_collision")
        relations.extend(
            split_alternates(
                {
                    "A": verses_a,
                    "O": verses_o,
                    "B": verses_b,
                    "flags": flags,
                    "warn": warn,
                    "codes": codes,
                }
            )
        )
    classify(relations, side_a, side_b)
    return relations
