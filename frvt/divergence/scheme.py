"""One versification loaded the way the prototype loads a Copenhagen document.

Edges remember insertion order. Classification and event grouping depend on it,
so this module does not sort mapping keys.
"""

from __future__ import annotations

import collections
from typing import Any

from frvt.divergence.catalog import book_order
from frvt.divergence.refs import Verse, parse

# Flags carried on one source-verse to org-verse edge.
EdgeFlags = set[str]


class Scheme:
    """A numbering scheme: maxima, exclusions, bridges, segments, and org edges.

    ``vrs_pairs`` supplements ``mappedVerses`` with multi-target lines. Pass
    ``None`` when the side has no supplement. An empty list still counts as
    having multi-target data, matching the prototype's ``has_vrs`` flag.
    """

    def __init__(
        self,
        label: str,
        doc: dict[str, Any],
        vrs_pairs: list[tuple[str, str]] | None = None,
    ) -> None:
        """Load maxima, exclusions, bridges, segments, and mapping edges."""
        self.label = label
        self.warnings: list[str] = []
        self.max: dict[str, list[int]] = {}
        for book, chapters in doc["maxVerses"].items():
            try:
                self.max[book] = [int(item) for item in chapters]
            except (TypeError, ValueError):
                self.warnings.append(f"maxVerses {book}: non-numeric entries")
        self.excluded: set[Verse] = set()
        for ref in doc.get("excludedVerses", []):
            parsed = parse(ref)
            if parsed:
                self.excluded.add((parsed[0], parsed[1], parsed[2]))
        self.bridges: list[tuple[str, int, int, int]] = []
        for ref in doc.get("mergedVerses", []):
            parsed = parse(ref)
            if parsed and parsed[3] > parsed[2]:
                self.bridges.append(parsed[:4])
        self.segments: dict[Verse, tuple[str, ...]] = {}
        for key, parts in doc.get("partialVerses", {}).items():
            parsed = parse(key)
            if parsed:
                self.segments[(parsed[0], parsed[1], parsed[2])] = tuple(
                    sorted(part.strip() for part in parts)
                )
        self.edges: dict[Verse, dict[Verse, EdgeFlags]] = collections.defaultdict(dict)
        # Warning codes keyed by source verse. Copied onto relations at compose time.
        self._codes: dict[Verse, set[str]] = {}
        # Verses excluded because the translation does not contain them.
        self.text_omissions: set[Verse] = set()
        self.has_vrs = vrs_pairs is not None
        json_pairs = list(doc.get("mappedVerses", {}).items())
        for key, value in json_pairs:
            self._add(key, value, "json")
        if vrs_pairs:
            json_map = dict(json_pairs)
            for key, value in vrs_pairs:
                if json_map.get(key) != value:
                    self._add(key, value, "vrs")

    def _exists(self, book: str, chapter: int, verse: int) -> bool:
        """Whether ``maxVerses`` lists this verse. Verse 0 is never in maxima."""
        chapters = self.max.get(book)
        return (
            chapters is not None
            and 1 <= chapter <= len(chapters)
            and 1 <= verse <= chapters[chapter - 1]
        )

    def _add(self, key: str, value: str, provenance: str) -> None:
        """Record one mapping line. Unequal ranges are aligned by position."""
        source, target = parse(key), parse(value)
        if not source or not target:
            self.warnings.append(f"unparseable mapping {key!r} -> {value!r}")
            return
        if source[3] < source[2] or target[3] < target[2]:
            self.warnings.append(f"reversed range {key!r} -> {value!r}")
            return
        source_len = source[3] - source[2] + 1
        target_len = target[3] - target[2] + 1
        sources = [
            (source[0], source[1], verse) for verse in range(source[2], source[3] + 1)
        ]
        targets = [
            (target[0], target[1], verse) for verse in range(target[2], target[3] + 1)
        ]
        flags: EdgeFlags = set()
        if target[4] or source[4]:
            flags.add("segment")
        if provenance == "vrs":
            flags.add("vrs")
        if source_len == target_len:
            pairs = list(zip(sources, targets, strict=True))
        elif source_len == 1 or target_len == 1:
            pairs = [(item, other) for item in sources for other in targets]
        else:
            self.warnings.append(
                f"unequal ranges {key!r} -> {value!r} (aligned by position)"
            )
            flags.add("approx")
            flags.add("warn")
            width = max(source_len, target_len)
            pairs = [
                (
                    sources[min(index, source_len - 1)],
                    targets[min(index, target_len - 1)],
                )
                for index in range(width)
            ]
        for src, org in pairs:
            if org[2] == 0:
                continue
            if src[2] != 0 and not self._exists(*src):
                self.warnings.append(
                    f"mapping from undefined verse {src[0]} {src[1]}:{src[2]}"
                )
                continue
            self.edges[src].setdefault(org, set()).update(flags)
            if "warn" in flags:
                self._codes.setdefault(src, set()).add("unequal_ranges")

    def verses(self) -> list[Verse]:
        """Verse universe in catalog order, including explicit verse-0 sources."""
        out: list[Verse] = []
        zero = {verse for verse in self.edges if verse[2] == 0}
        for book in sorted(self.max, key=book_order):
            for chapter, count in enumerate(self.max[book], start=1):
                if (book, chapter, 0) in zero:
                    out.append((book, chapter, 0))
                out.extend((book, chapter, verse) for verse in range(1, count + 1))
        return out

    def to_org(self, verse: Verse) -> tuple[dict[Verse, EdgeFlags], bool]:
        """Org targets for one verse.

        The bool is true when the edge is a default identity.
        """
        found = self.edges.get(verse)
        if found:
            return found, False
        return {verse: set()}, True
