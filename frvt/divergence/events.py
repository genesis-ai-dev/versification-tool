"""Collapse classified relations into the events the viewer draws."""

from __future__ import annotations

import collections
from collections.abc import Callable
from typing import Any

from frvt.divergence.refs import Verse, span, verse_pos
from frvt.divergence.scheme import Scheme

Emit = Callable[[str, list[dict[str, Any]], tuple[str, ...]], None]


def _adjacent(left: Verse, right: Verse) -> bool:
    """Whether ``right`` is the next verse after ``left`` in the same book."""
    return left[0] == right[0] and (
        (left[1] == right[1] and right[2] == left[2] + 1)
        or (right[1] == left[1] + 1 and right[2] <= 1)
    )


def _delta(relation: dict[str, Any]) -> tuple[str, int, int]:
    """Book and chapter/verse offset from the first A verse to the first B verse."""
    left, right = relation["Ap"][0], relation["Bp"][0]
    return (right[0], right[1] - left[1], right[2] - left[2])


def _flush_group(group: list[dict[str, Any]], emit: Emit) -> None:
    """Emit one event, preferring the most specific type present in the group."""
    types = {relation["type"] for relation in group}
    if "ORDER_INVERSION" in types:
        chosen = "ORDER_INVERSION"
    elif "CROSS_BOOK" in types:
        chosen = "CROSS_BOOK"
    elif "CHAPTER_MOVE" in types:
        chosen = "CHAPTER_MOVE"
    elif "VERSE0_TITLE" in types:
        chosen = "VERSE0_TITLE"
    else:
        chosen = group[0]["type"]
    emit(chosen, group, ())


def _chapters(verses: list[Verse]) -> list[tuple[str, int]]:
    """Distinct book-chapter pairs, sorted."""
    return sorted({(verse[0], verse[1]) for verse in verses})


def _add_bridge_and_segment_events(
    relations: list[dict[str, Any]],
    side_a: Scheme,
    side_b: Scheme,
    events: list[dict[str, Any]],
) -> None:
    """Add bridge and segment events that the relation grouping does not emit."""
    a_to_b: dict[Verse, set[Verse]] = collections.defaultdict(set)
    b_to_a: dict[Verse, set[Verse]] = collections.defaultdict(set)
    for relation in relations:
        for verse in relation["Ap"]:
            a_to_b[verse].update(relation["Bp"])
        for verse in relation["Bp"]:
            b_to_a[verse].update(relation["Ap"])

    def bridge_set(bridge: tuple[str, int, int, int]) -> set[Verse]:
        return {
            (bridge[0], bridge[1], verse) for verse in range(bridge[2], bridge[3] + 1)
        }

    bridges_b = {frozenset(bridge_set(bridge)) for bridge in side_b.bridges}
    bridges_a = {frozenset(bridge_set(bridge)) for bridge in side_a.bridges}
    for side, scheme, other_sets, cross in (
        ("A", side_a, bridges_b, a_to_b),
        ("B", side_b, bridges_a, b_to_a),
    ):
        for bridge in scheme.bridges:
            verses = sorted(bridge_set(bridge), key=verse_pos)
            counterpart = frozenset(
                item for verse in verses for item in cross.get(verse, ())
            )
            if counterpart and counterpart in other_sets:
                continue
            paired = sorted(counterpart, key=verse_pos)
            left, right = (verses, paired) if side == "A" else (paired, verses)
            events.append(
                {
                    "type": "BRIDGE",
                    "a": span(left),
                    "o": None,
                    "b": span(right),
                    "n": len(verses),
                    "rel": "bridge",
                    "flags": [f"bridgeIn{side}"],
                    "aChapters": _chapters(left),
                    "bChapters": _chapters(right),
                }
            )
    seen: set[tuple[Verse, Verse]] = set()
    for verse_a, targets in a_to_b.items():
        parts_a = side_a.segments.get(verse_a, ())
        for verse_b in targets:
            parts_b = side_b.segments.get(verse_b, ())
            if parts_a != parts_b and (verse_a, verse_b) not in seen:
                seen.add((verse_a, verse_b))
                events.append(
                    {
                        "type": "SEGMENT",
                        "a": span([verse_a]),
                        "o": None,
                        "b": span([verse_b]),
                        "n": 1,
                        "rel": "segments",
                        "flags": [],
                        "segA": list(parts_a),
                        "segB": list(parts_b),
                        "aChapters": [(verse_a[0], verse_a[1])],
                        "bChapters": [(verse_b[0], verse_b[1])],
                    }
                )


def _fold_book_one_sided(
    events: list[dict[str, Any]], side_a: Scheme, side_b: Scheme
) -> None:
    """Replace one-sided runs that cover most of a one-sided book."""
    for side, scheme, other, key in (
        ("A", side_a, side_b, "a"),
        ("B", side_b, side_a, "b"),
    ):
        for book, chapters in scheme.max.items():
            if book in other.max:
                continue
            total = sum(chapters)
            mine = [
                event
                for event in events
                if event["type"] == "ONE_SIDED" and event[key] and event[key][0] == book
            ]
            covered = sum(event["n"] for event in mine)
            if total and covered / total >= 0.5:
                for event in mine:
                    events.remove(event)
                events.append(
                    {
                        "type": "BOOK_ONE_SIDED",
                        "a": (
                            [book, 1, 1, len(chapters), chapters[-1]]
                            if side == "A"
                            else None
                        ),
                        "o": None,
                        "b": (
                            [book, 1, 1, len(chapters), chapters[-1]]
                            if side == "B"
                            else None
                        ),
                        "n": total,
                        "rel": f"{side}-only",
                        "flags": [],
                        "aChapters": (
                            [(book, chapter) for chapter in range(1, len(chapters) + 1)]
                            if side == "A"
                            else []
                        ),
                        "bChapters": (
                            [(book, chapter) for chapter in range(1, len(chapters) + 1)]
                            if side == "B"
                            else []
                        ),
                    }
                )


def build_events(
    relations: list[dict[str, Any]], side_a: Scheme, side_b: Scheme
) -> list[dict[str, Any]]:
    """Collapse relations into events. Bridge, segment, and book events are appended."""
    events: list[dict[str, Any]] = []

    def emit(
        event_type: str,
        group: list[dict[str, Any]],
        extra_flags: tuple[str, ...] = (),
    ) -> None:
        for relation in group:
            relation["etype"] = event_type
        verses_a = [verse for relation in group for verse in relation["Ap"]] or [
            verse for relation in group for verse in relation["A"]
        ]
        verses_b = [verse for relation in group for verse in relation["Bp"]] or [
            verse for relation in group for verse in relation["B"]
        ]
        verses_o = [verse for relation in group for verse in relation["O"]]
        verses_a.sort(key=verse_pos)
        verses_b.sort(key=verse_pos)
        verses_o.sort(key=verse_pos)
        flags = set(extra_flags)
        for relation in group:
            if "approx" in relation["flags"]:
                flags.add("approximate")
            if relation["warn"]:
                flags.add("dataWarning")
            if "vrs" in relation["flags"]:
                flags.add("vrsSupplement")
        if event_type == "EXCLUDED":
            omitted = side_a.text_omissions | side_b.text_omissions
            if any(verse in omitted for verse in verses_a + verses_b):
                flags.add("textOmission")
        codes: list[tuple[str, str]] = []
        for relation in group:
            if not relation.get("warn"):
                continue
            for side, names in relation.get("codes", {}).items():
                codes.extend((side, name) for name in names)
        events.append(
            {
                "type": event_type,
                "a": span(verses_a),
                "o": span(verses_o),
                "b": span(verses_b),
                "n": max(len(verses_a), len(verses_b)),
                "rel": group[0]["rel"],
                "flags": sorted(flags),
                "codes": sorted(set(codes)),
                "aChapters": _chapters(verses_a),
                "bChapters": _chapters(verses_b),
            }
        )

    typed = [relation for relation in relations if relation["type"]]
    families = {
        "RENUMBER": "shift",
        "VERSE0_TITLE": "shift",
        "CHAPTER_MOVE": "move",
        "CROSS_BOOK": "move",
        "ORDER_INVERSION": "inv",
    }
    both = [relation for relation in typed if relation["Ap"] and relation["Bp"]]
    both.sort(key=lambda relation: verse_pos(relation["Ap"][0]))
    group: list[dict[str, Any]] = []
    for relation in both:
        simple = (
            len(relation["Ap"]) == 1
            and len(relation["Bp"]) == 1
            and relation["type"] in families
        )
        if group:
            previous = group[-1]
            previous_simple = (
                len(previous["Ap"]) == 1
                and len(previous["Bp"]) == 1
                and previous["type"] in families
            )
            same_chapter = previous["Ap"][0][:2] == relation["Ap"][0][:2]
            if (
                simple
                and previous_simple
                and families[relation["type"]] == families[previous["type"]]
                and _delta(relation) == _delta(previous)
                and _adjacent(previous["Ap"][0], relation["Ap"][0])
                and (same_chapter or families[relation["type"]] != "shift")
            ):
                group.append(relation)
                continue
            if (
                not simple
                and not previous_simple
                and relation["type"] == previous["type"]
                and relation["rel"] == previous["rel"]
                and relation["flags"] == previous["flags"]
                and relation["warn"] == previous["warn"]
                and _adjacent(previous["Ap"][-1], relation["Ap"][0])
            ):
                group.append(relation)
                continue
            _flush_group(group, emit)
            group = []
        group = [relation]
    if group:
        _flush_group(group, emit)

    def anchor(relation: dict[str, Any]) -> tuple[str, list[Verse]]:
        return ("A", relation["A"]) if relation["A"] else ("B", relation["B"])

    def missing(relation: dict[str, Any]) -> str:
        return "A" if not relation["Ap"] else "B"

    lone = [
        relation for relation in typed if relation["type"] in ("EXCLUDED", "ONE_SIDED")
    ]
    lone.sort(
        key=lambda relation: (anchor(relation)[0], verse_pos(anchor(relation)[1][0]))
    )
    lone_group: list[dict[str, Any]] = []
    for relation in lone:
        side, verses = anchor(relation)
        if lone_group:
            previous_side, previous_verses = anchor(lone_group[-1])
            if (
                lone_group[-1]["type"] == relation["type"]
                and previous_side == side
                and missing(lone_group[-1]) == missing(relation)
                and _adjacent(previous_verses[-1], verses[0])
            ):
                lone_group.append(relation)
                continue
            emit(
                lone_group[0]["type"],
                lone_group,
                (f"missingIn{missing(lone_group[0])}",),
            )
        lone_group = [relation]
    if lone_group:
        emit(lone_group[0]["type"], lone_group, (f"missingIn{missing(lone_group[0])}",))
    _add_bridge_and_segment_events(relations, side_a, side_b, events)
    _fold_book_one_sided(events, side_a, side_b)
    return events
