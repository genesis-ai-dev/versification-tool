"""Contract tests for the coordinate-only resolver against seeded schemes."""

from __future__ import annotations

from uuid import uuid4

import pytest
from frvt.api.models import (
    MappingRecord,
    RelationType,
    Translation,
    TranslationVersification,
    VersificationScheme,
)
from frvt.resolver import parse_ref, resolve
from frvt.resolver.chains import (
    build_chain,
    hops_from_ancestor,
    hops_to_ancestor,
    nearest_shared_translation,
    preferred_scheme_ref,
)
from frvt.resolver.compose import dominant_relation
from frvt.resolver.cover import unequal_zip_cover
from frvt.resolver.normalize import normalize_same_bcv
from frvt.resolver.range_hull import (
    ParticipantWalk,
    RangeTrigger,
    _interior_requires_complex,
    build_range_hull,
    find_range_trigger,
)
from frvt.resolver.types import (
    MappingView,
    ResolutionDTO,
    ResolvedSpanDTO,
    SchemeRef,
    VerseId,
)
from sqlalchemy import select
from sqlalchemy.orm import Session


def _scheme(session: Session, name: str) -> SchemeRef:
    """Load the preferred scheme for a canonical anchor by name."""
    translation = session.scalar(select(Translation).where(Translation.name == name))
    assert translation is not None
    ref = preferred_scheme_ref(session, translation.id)
    assert ref is not None
    return ref


def _hop_lists(
    session: Session, source: SchemeRef, target: SchemeRef
) -> tuple[list, list]:
    """Build source/target hop lists toward the nearest shared ancestor."""
    src_chain = build_chain(session, source)
    tgt_chain = build_chain(session, target)
    ancestor = nearest_shared_translation(session, src_chain, tgt_chain)
    return (
        hops_to_ancestor(src_chain, ancestor),
        hops_from_ancestor(tgt_chain, ancestor),
    )


@pytest.mark.phase6
@pytest.mark.resolve
def test_resolve_never_loads_verse_text(seeded_session: Session) -> None:
    """TC-RESOLVE-012: Resolve never loads verse text."""
    eng = _scheme(seeded_session, "eng")
    org = _scheme(seeded_session, "org")
    # Coordinate resolver returns structure-only DTOs (no content field).
    result = resolve(seeded_session, "JHN 3:16", source_scheme=eng, target_scheme=org)
    assert result.relation == "one_to_one"
    for span in (*result.source_spans, *result.target_spans):
        assert not hasattr(span, "content")


@pytest.mark.phase6
@pytest.mark.resolve
def test_cycle_in_based_on_chain_detected(seeded_session: Session) -> None:
    """TC-RESOLVE-026: Cycle in based_on chain is detected."""
    a = Translation(
        name=f"cycle-a-{uuid4().hex[:8]}",
        language="en",
        source_format="usx",
        is_anchor=False,
    )
    b = Translation(
        name=f"cycle-b-{uuid4().hex[:8]}",
        language="en",
        source_format="usx",
        is_anchor=False,
    )
    seeded_session.add_all([a, b])
    seeded_session.flush()
    scheme_a = VersificationScheme(
        name=f"cycle-scheme-a-{uuid4().hex[:8]}",
        based_on_name="cycle-b",
        based_on_id=b.id,
        canonical=False,
        ingredient={"maxVerses": {"GEN": ["1"]}},
    )
    scheme_b = VersificationScheme(
        name=f"cycle-scheme-b-{uuid4().hex[:8]}",
        based_on_name="cycle-a",
        based_on_id=a.id,
        canonical=False,
        ingredient={"maxVerses": {"GEN": ["1"]}},
    )
    seeded_session.add_all([scheme_a, scheme_b])
    seeded_session.flush()
    seeded_session.add_all(
        [
            TranslationVersification(
                translation_id=a.id, scheme_id=scheme_a.id, preferred=True
            ),
            TranslationVersification(
                translation_id=b.id, scheme_id=scheme_b.id, preferred=True
            ),
        ]
    )
    seeded_session.flush()
    with pytest.raises(LookupError, match="Cycle"):
        build_chain(seeded_session, SchemeRef(scheme_a.id, b.id, "cycle-b"))


def test_identity_jhn(seeded_session: Session) -> None:
    """Unmapped verse resolves as one_to_one with identical refs."""
    eng = _scheme(seeded_session, "eng")
    org = _scheme(seeded_session, "org")
    result = resolve(seeded_session, "JHN 3:16", source_scheme=eng, target_scheme=org)
    assert result.relation == "one_to_one"
    assert len(result.source_spans) == 1
    assert len(result.target_spans) == 1
    assert result.source_spans[0].ref == "JHN 3:16"
    assert result.target_spans[0].ref == "JHN 3:16"
    assert "-" not in result.source_spans[0].ref


def test_combined_milestone_split_under_vrs_renumber(seeded_session: Session) -> None:
    """Combined ROM 14:24-25 splits to org 16:25-26 under a VRS renumber row."""
    org = seeded_session.scalar(select(Translation).where(Translation.name == "org"))
    assert org is not None
    mari = Translation(
        name=f"mari-rom-{uuid4().hex[:8]}",
        language="chm",
        source_format="usx",
        is_anchor=False,
    )
    seeded_session.add(mari)
    seeded_session.flush()
    ingredient = {
        "basedOn": "org",
        "maxVerses": {"ROM": ["26"] * 14 + ["24"]},
        "mappedVerses": {
            "ROM 14:24": "ROM 16:25-26",
            "ROM 14:24-26": "ROM 16:25-27",
        },
        "splitVerses": ["ROM 14:24"],
        "mergedVerses": [],
        "excludedVerses": [],
        "partialVerses": {},
    }
    scheme = VersificationScheme(
        name=f"mari-scheme-{uuid4().hex[:8]}",
        based_on_name="org",
        based_on_id=org.id,
        canonical=False,
        ingredient=ingredient,
    )
    seeded_session.add(scheme)
    seeded_session.flush()
    seeded_session.add(
        MappingRecord(
            scheme_id=scheme.id,
            source_ref="ROM 14:24",
            base_ref="ROM 16:25-26",
            part=None,
            relation=RelationType.split,
            ordinal=0,
        ),
        MappingRecord(
            scheme_id=scheme.id,
            source_ref="ROM 14:24-26",
            base_ref="ROM 16:25-27",
            part=None,
            relation=RelationType.renumber,
            ordinal=1,
        ),
    )
    seeded_session.add(
        TranslationVersification(
            translation_id=mari.id,
            scheme_id=scheme.id,
            preferred=True,
        )
    )
    seeded_session.flush()
    mari_scheme = SchemeRef(scheme.id, org.id, "org")
    org_scheme = _scheme(seeded_session, "org")
    result = resolve(
        seeded_session,
        "ROM 14:24",
        source_scheme=mari_scheme,
        target_scheme=org_scheme,
    )
    assert result.relation == "split"
    assert [span.ref for span in result.source_spans] == ["ROM 14:24"]
    assert [span.ref for span in result.target_spans] == ["ROM 16:25", "ROM 16:26"]


def test_shift_psa(seeded_session: Session) -> None:
    """Psalm title shift maps PSA 3:1 in eng to PSA 3:2 in org."""
    eng = _scheme(seeded_session, "eng")
    org = _scheme(seeded_session, "org")
    result = resolve(seeded_session, "PSA 3:1", source_scheme=eng, target_scheme=org)
    assert result.relation == "shift"
    assert result.source_spans[0].ref == "PSA 3:1"
    assert result.target_spans[0].ref == "PSA 3:2"


def test_gen_chapter_boundary(seeded_session: Session) -> None:
    """GEN 31:55 maps across the chapter boundary to GEN 32:1."""
    eng = _scheme(seeded_session, "eng")
    org = _scheme(seeded_session, "org")
    result = resolve(seeded_session, "GEN 31:55", source_scheme=eng, target_scheme=org)
    assert result.target_spans[0].ref == "GEN 32:1"
    assert result.relation in {"shift", "renumber"}


def test_range_does_not_raise(seeded_session: Session) -> None:
    """A well-formed bcvRange expands to single-verse spans without raising."""
    eng = _scheme(seeded_session, "eng")
    org = _scheme(seeded_session, "org")
    result = resolve(seeded_session, "PSA 3:0-2", source_scheme=eng, target_scheme=org)
    assert all("-" not in span.ref for span in result.source_spans)
    assert all("-" not in span.ref for span in result.target_spans)
    assert len(result.source_spans) >= 1
    assert result.relation == "shift"
    assert result.edges == ()


def test_identity_range_stays_atomic(seeded_session: Session) -> None:
    """A contiguous identity range is one grouped atomic result, not a hull."""
    eng = _scheme(seeded_session, "eng")
    org = _scheme(seeded_session, "org")
    result = resolve(
        seeded_session, "JHN 3:16-18", source_scheme=eng, target_scheme=org
    )
    assert result.relation == "one_to_one"
    assert [span.ref for span in result.target_spans] == [
        "JHN 3:16",
        "JHN 3:17",
        "JHN 3:18",
    ]
    assert result.edges == ()


def test_exclude_empty_targets(seeded_session: Session) -> None:
    """An exclude mapping yields empty target_spans."""
    eng = _scheme(seeded_session, "eng")
    org = _scheme(seeded_session, "org")
    scheme = seeded_session.get(VersificationScheme, eng.scheme_id)
    assert scheme is not None
    seeded_session.add(
        MappingRecord(
            scheme_id=scheme.id,
            source_ref="MAT 17:21",
            base_ref=None,
            part=None,
            relation=RelationType.exclude,
            ordinal=50_000,
        )
    )
    seeded_session.flush()
    result = resolve(seeded_session, "MAT 17:21", source_scheme=eng, target_scheme=org)
    assert result.relation == "exclude"
    assert len(result.source_spans) == 1
    assert result.target_spans == ()


def test_merge_siblings(seeded_session: Session) -> None:
    """A merge mapping returns sibling source spans and one target."""
    eng = _scheme(seeded_session, "eng")
    org = _scheme(seeded_session, "org")
    scheme = seeded_session.get(VersificationScheme, eng.scheme_id)
    assert scheme is not None
    seeded_session.add(
        MappingRecord(
            scheme_id=scheme.id,
            source_ref="1PE 4:1-2",
            base_ref="1PE 4:1",
            part=None,
            relation=RelationType.merge,
            ordinal=50_001,
        )
    )
    seeded_session.flush()
    result = resolve(seeded_session, "1PE 4:1", source_scheme=eng, target_scheme=org)
    assert result.relation == "merge"
    assert len(result.source_spans) > 1
    assert len(result.target_spans) == 1


def test_base_less_merge_collapses_to_first_source(seeded_session: Session) -> None:
    """A stored base-less merge remains a merge rather than becoming an exclusion."""
    eng = _scheme(seeded_session, "eng")
    org = _scheme(seeded_session, "org")
    scheme = seeded_session.get(VersificationScheme, eng.scheme_id)
    assert scheme is not None
    seeded_session.add(
        MappingRecord(
            scheme_id=scheme.id,
            source_ref="1PE 4:1-2",
            base_ref=None,
            part=None,
            relation=RelationType.merge,
            ordinal=50_003,
        )
    )
    seeded_session.flush()
    result = resolve(seeded_session, "1PE 4:2", source_scheme=eng, target_scheme=org)
    assert result.relation == "merge"
    assert len(result.source_spans) == 2
    assert result.target_spans[0].ref == "1PE 4:1"


def test_partial_via_part_param(seeded_session: Session) -> None:
    """Partial resolve uses the separate part param; suffixed refs raise."""
    with pytest.raises(ReferenceError):
        parse_ref("SIR 36:13a")

    eng = _scheme(seeded_session, "eng")
    org = _scheme(seeded_session, "org")
    scheme = seeded_session.get(VersificationScheme, eng.scheme_id)
    assert scheme is not None
    seeded_session.add(
        MappingRecord(
            scheme_id=scheme.id,
            source_ref="SIR 36:13",
            base_ref="SIR 36:13",
            part="a",
            relation=RelationType.partial,
            ordinal=50_002,
        )
    )
    seeded_session.flush()
    result = resolve(
        seeded_session,
        "SIR 36:13",
        source_scheme=eng,
        target_scheme=org,
        part="a",
    )
    assert result.source_spans[0].part == "a"
    assert result.relation in {"partial", "one_to_one"}


def test_missing_ancestor_raises(seeded_session: Session) -> None:
    """Schemes with disjoint bases raise LookupError."""
    orphan_a = Translation(
        name=f"orphan-a-{uuid4().hex[:8]}",
        language="en",
        source_format="usx",
        is_anchor=False,
    )
    orphan_b = Translation(
        name=f"orphan-b-{uuid4().hex[:8]}",
        language="en",
        source_format="usx",
        is_anchor=False,
    )
    seeded_session.add_all([orphan_a, orphan_b])
    seeded_session.flush()
    scheme_a = VersificationScheme(
        name=f"scheme-a-{uuid4().hex[:8]}",
        based_on_name=None,
        based_on_id=None,
        canonical=False,
        ingredient={"maxVerses": {"GEN": ["1"]}},
    )
    scheme_b = VersificationScheme(
        name=f"scheme-b-{uuid4().hex[:8]}",
        based_on_name=None,
        based_on_id=None,
        canonical=False,
        ingredient={"maxVerses": {"GEN": ["1"]}},
    )
    seeded_session.add_all([scheme_a, scheme_b])
    seeded_session.flush()
    seeded_session.add_all(
        [
            TranslationVersification(
                translation_id=orphan_a.id, scheme_id=scheme_a.id, preferred=True
            ),
            TranslationVersification(
                translation_id=orphan_b.id, scheme_id=scheme_b.id, preferred=True
            ),
        ]
    )
    seeded_session.flush()
    with pytest.raises(LookupError):
        resolve(
            seeded_session,
            "GEN 1:1",
            source_scheme=SchemeRef(scheme_a.id, None),
            target_scheme=SchemeRef(scheme_b.id, None),
        )


def test_complex_hull(seeded_session: Session) -> None:
    """Two merges through a shared pivot yield a complex hull with edges."""
    org = seeded_session.scalar(select(Translation).where(Translation.name == "org"))
    assert org is not None
    left = VersificationScheme(
        name=f"hull-left-{uuid4().hex[:8]}",
        based_on_name="org",
        based_on_id=org.id,
        canonical=False,
        ingredient={"maxVerses": {"GEN": ["31"]}, "basedOn": "org"},
    )
    right = VersificationScheme(
        name=f"hull-right-{uuid4().hex[:8]}",
        based_on_name="org",
        based_on_id=org.id,
        canonical=False,
        ingredient={"maxVerses": {"GEN": ["31"]}, "basedOn": "org"},
    )
    seeded_session.add_all([left, right])
    seeded_session.flush()
    # Left: GEN 1:1-2 merges to org GEN 1:1 (siblings pulled into the hull).
    seeded_session.add(
        MappingRecord(
            scheme_id=left.id,
            source_ref="GEN 1:1-2",
            base_ref="GEN 1:1",
            part=None,
            relation=RelationType.merge,
            ordinal=0,
        )
    )
    # Right: GEN 1:10-11 also merges to the same org pivot.
    seeded_session.add(
        MappingRecord(
            scheme_id=right.id,
            source_ref="GEN 1:10-11",
            base_ref="GEN 1:1",
            part=None,
            relation=RelationType.merge,
            ordinal=0,
        )
    )
    seeded_session.flush()
    result = resolve(
        seeded_session,
        "GEN 1:1",
        source_scheme=SchemeRef(left.id, org.id, "org"),
        target_scheme=SchemeRef(right.id, org.id, "org"),
    )
    assert result.relation == "complex"
    assert len(result.source_spans) > 1
    assert len(result.target_spans) > 1
    assert len(result.edges) >= 1
    assert all(edge.relation for edge in result.edges)


def _mapping_view(
    *,
    source_ref: str,
    base_ref: str | None,
    relation: str,
    ordinal: int = 0,
    part: str | None = None,
) -> MappingView:
    """Build one in-memory mapping row for cover/range unit tests."""
    return MappingView(
        source_ref=source_ref,
        base_ref=base_ref,
        part=part,
        relation=relation,
        ordinal=ordinal,
    )


def test_normalize_same_bcv_collapses_one_to_one_shift() -> None:
    """Same-coordinate 1↔1 shift rewrites to one_to_one."""
    dto = ResolutionDTO(
        source_spans=(ResolvedSpanDTO("GEN 1:1", None),),
        target_spans=(ResolvedSpanDTO("GEN 1:1", None),),
        relation="shift",
    )
    assert normalize_same_bcv(dto).relation == "one_to_one"


def test_normalize_same_bcv_leaves_different_bcv_shift() -> None:
    """Different BCV coordinates are not rewritten."""
    dto = ResolutionDTO(
        source_spans=(ResolvedSpanDTO("GEN 1:1", None),),
        target_spans=(ResolvedSpanDTO("GEN 1:2", None),),
        relation="shift",
    )
    assert normalize_same_bcv(dto).relation == "shift"


def test_normalize_same_bcv_leaves_partial() -> None:
    """Partial relation is never rewritten by same-BCV normalization."""
    dto = ResolutionDTO(
        source_spans=(ResolvedSpanDTO("SIR 36:13", "a"),),
        target_spans=(ResolvedSpanDTO("SIR 36:13", "a"),),
        relation="partial",
    )
    assert normalize_same_bcv(dto).relation == "partial"


def test_normalize_same_bcv_leaves_multi_span_merge() -> None:
    """Multi-span hulls are never rewritten."""
    dto = ResolutionDTO(
        source_spans=(
            ResolvedSpanDTO("GEN 1:1", None),
            ResolvedSpanDTO("GEN 1:2", None),
        ),
        target_spans=(ResolvedSpanDTO("GEN 1:1", None),),
        relation="merge",
    )
    assert normalize_same_bcv(dto).relation == "merge"


def test_dominant_relation_ignores_one_to_one() -> None:
    """Dominance skips identity legs on composed axes."""
    assert dominant_relation(["one_to_one", "shift"]) == "shift"


def test_dominant_relation_none_for_all_identity() -> None:
    """All-identity axes yield no dominant relation."""
    assert dominant_relation(["one_to_one"]) is None


def test_dominant_relation_prefers_merge_over_shift() -> None:
    """Merge outranks shift on axis dominance."""
    assert dominant_relation(["shift", "merge"]) == "merge"


def test_unequal_zip_cover_detects_renumber_range() -> None:
    """Unequal-length renumber rows qualify for range hull triggers."""
    record = _mapping_view(
        source_ref="GEN 1:1-3",
        base_ref="GEN 1:1-2",
        relation="renumber",
    )
    pair = unequal_zip_cover(record, upward=True)
    assert pair is not None
    cover, output = pair
    assert cover.verse_start == 1 and cover.verse_end == 3
    assert output.verse_start == 1 and output.verse_end == 2


def test_unequal_zip_cover_none_for_equal_length_shift() -> None:
    """Equal-length zip rows do not trigger range hull assembly."""
    record = _mapping_view(
        source_ref="PSA 3:1-8",
        base_ref="PSA 3:2-9",
        relation="shift",
    )
    assert unequal_zip_cover(record, upward=True) is None


def test_unequal_zip_cover_none_for_partial() -> None:
    """Partial rows never trigger unequal zip covers."""
    record = _mapping_view(
        source_ref="SIR 36:13",
        base_ref="SIR 36:13",
        relation="partial",
        part="a",
    )
    assert unequal_zip_cover(record, upward=True) is None


def test_find_range_trigger_prefers_narrowest_cover(
    seeded_session: Session,
) -> None:
    """Narrowest unequal zip cover wins; equal width breaks on lower ordinal."""
    org_translation = seeded_session.scalar(
        select(Translation).where(Translation.name == "org")
    )
    assert org_translation is not None
    org_ref = _scheme(seeded_session, "org")
    scheme = VersificationScheme(
        name=f"range-pick-{uuid4().hex[:8]}",
        based_on_name="org",
        based_on_id=org_translation.id,
        canonical=False,
        ingredient={"maxVerses": {"GEN": ["5"]}, "basedOn": "org"},
    )
    seeded_session.add(scheme)
    seeded_session.flush()
    seeded_session.add_all(
        [
            MappingRecord(
                scheme_id=scheme.id,
                source_ref="GEN 1:1-5",
                base_ref="GEN 1:1-3",
                part=None,
                relation=RelationType.renumber,
                ordinal=1,
            ),
            MappingRecord(
                scheme_id=scheme.id,
                source_ref="GEN 1:3-5",
                base_ref="GEN 1:1-2",
                part=None,
                relation=RelationType.renumber,
                ordinal=0,
            ),
        ]
    )
    seeded_session.flush()
    source_ref = SchemeRef(scheme.id, org_translation.id, "org")
    src_hops, tgt_hops = _hop_lists(seeded_session, source_ref, org_ref)
    members = [VerseId(book="GEN", chapter=1, verse=3, part=None)]
    trigger = find_range_trigger(members, src_hops, tgt_hops)
    assert trigger is not None
    assert trigger.cover.verse_start == 3 and trigger.cover.verse_end == 5
    assert trigger.ordinal == 0


def test_build_range_hull_declines_equal_cardinality(
    seeded_session: Session,
) -> None:
    """Range hull declines when walked participants produce equal span counts."""
    org_translation = seeded_session.scalar(
        select(Translation).where(Translation.name == "org")
    )
    assert org_translation is not None
    org_ref = _scheme(seeded_session, "org")
    scheme = VersificationScheme(
        name=f"range-decline-{uuid4().hex[:8]}",
        based_on_name="org",
        based_on_id=org_translation.id,
        canonical=False,
        ingredient={"maxVerses": {"GEN": ["3"]}, "basedOn": "org"},
    )
    seeded_session.add(scheme)
    seeded_session.flush()
    seeded_session.add(
        MappingRecord(
            scheme_id=scheme.id,
            source_ref="GEN 1:1-2",
            base_ref="GEN 1:1-3",
            part=None,
            relation=RelationType.renumber,
            ordinal=0,
        )
    )
    seeded_session.flush()
    source_ref = SchemeRef(scheme.id, org_translation.id, "org")
    src_hops, tgt_hops = _hop_lists(seeded_session, source_ref, org_ref)
    members = [
        VerseId(book="GEN", chapter=1, verse=1, part=None),
        VerseId(book="GEN", chapter=1, verse=2, part=None),
    ]
    trigger = find_range_trigger(members, src_hops, tgt_hops)
    assert trigger is not None
    assert build_range_hull(trigger, members, src_hops, tgt_hops) is None


def test_build_range_hull_endpoint_edges(seeded_session: Session) -> None:
    """Pure unequal zip emits only first/last corner connector edges."""
    org_translation = seeded_session.scalar(
        select(Translation).where(Translation.name == "org")
    )
    assert org_translation is not None
    org_ref = _scheme(seeded_session, "org")
    scheme = VersificationScheme(
        name=f"range-end-{uuid4().hex[:8]}",
        based_on_name="org",
        based_on_id=org_translation.id,
        canonical=False,
        ingredient={"maxVerses": {"GEN": ["3"]}, "basedOn": "org"},
    )
    seeded_session.add(scheme)
    seeded_session.flush()
    seeded_session.add(
        MappingRecord(
            scheme_id=scheme.id,
            source_ref="GEN 1:1-3",
            base_ref="GEN 1:1-2",
            part=None,
            relation=RelationType.renumber,
            ordinal=0,
        )
    )
    seeded_session.flush()
    source_ref = SchemeRef(scheme.id, org_translation.id, "org")
    src_hops, tgt_hops = _hop_lists(seeded_session, source_ref, org_ref)
    members = [VerseId(book="GEN", chapter=1, verse=3, part=None)]
    trigger = find_range_trigger(members, src_hops, tgt_hops)
    assert trigger is not None
    result = build_range_hull(trigger, members, src_hops, tgt_hops)
    assert result is not None
    assert result.relation == "range"
    assert len(result.source_spans) == 3
    assert len(result.target_spans) == 2
    assert len(result.edges) == 2
    assert result.edges[0].source_index == 0 and result.edges[0].target_index == 0
    assert result.edges[1].source_index == 2 and result.edges[1].target_index == 1
    assert result.source_rel is None
    assert result.target_rel is None


def test_build_range_hull_corner_split_composition(seeded_session: Session) -> None:
    """Corner split fans out on the last hull edge; interior sources stay unconnected."""
    org_translation = seeded_session.scalar(
        select(Translation).where(Translation.name == "org")
    )
    assert org_translation is not None
    left = VersificationScheme(
        name=f"range-cx-l-{uuid4().hex[:8]}",
        based_on_name="org",
        based_on_id=org_translation.id,
        canonical=False,
        ingredient={"maxVerses": {"GEN": ["3"]}, "basedOn": "org"},
    )
    right = VersificationScheme(
        name=f"range-cx-r-{uuid4().hex[:8]}",
        based_on_name="org",
        based_on_id=org_translation.id,
        canonical=False,
        ingredient={"maxVerses": {"GEN": ["3"]}, "basedOn": "org"},
    )
    seeded_session.add_all([left, right])
    seeded_session.flush()
    seeded_session.add_all(
        [
            MappingRecord(
                scheme_id=left.id,
                source_ref="GEN 1:1-3",
                base_ref="GEN 1:1-2",
                part=None,
                relation=RelationType.renumber,
                ordinal=0,
            ),
            MappingRecord(
                scheme_id=right.id,
                source_ref="GEN 1:2-3",
                base_ref="GEN 1:2",
                part=None,
                relation=RelationType.merge,
                ordinal=0,
            ),
        ]
    )
    seeded_session.flush()
    left_ref = SchemeRef(left.id, org_translation.id, "org")
    right_ref = SchemeRef(right.id, org_translation.id, "org")
    src_hops, tgt_hops = _hop_lists(seeded_session, left_ref, right_ref)
    members = [VerseId(book="GEN", chapter=1, verse=3, part=None)]
    trigger = find_range_trigger(members, src_hops, tgt_hops)
    assert trigger is not None
    result = build_range_hull(trigger, members, src_hops, tgt_hops)
    assert result is not None
    assert result.relation == "complex"
    assert result.source_rel == "range"
    assert result.target_rel == "split"
    assert len(result.source_spans) == 3
    assert len(result.target_spans) == 3
    assert len(result.edges) == 3
    assert all(edge.source_index in {0, 2} for edge in result.edges)
    assert sum(1 for edge in result.edges if edge.source_index == 2) == 2


def test_interior_requires_complex_source_axis_may_stay_range() -> None:
    """Interior source-axis fan-out with a source-side trigger may remain pure range."""
    trigger = RangeTrigger(
        side="source",
        hop_index=0,
        cover=parse_ref("GEN 1:1-3"),
        output=parse_ref("GEN 1:1-2"),
        width=2,
        ordinal=0,
    )
    interior = ParticipantWalk(
        pivots=(VerseId("GEN", 1, 1, None),),
        targets=(VerseId("GEN", 1, 1, None),),
        up_rel="merge",
        down_rel="one_to_one",
        composed="merge",
    )
    assert not _interior_requires_complex(trigger, [interior])


def test_interior_requires_complex_target_axis_split() -> None:
    """Interior target-axis split must surface as complex."""
    trigger = RangeTrigger(
        side="source",
        hop_index=0,
        cover=parse_ref("GEN 1:1-3"),
        output=parse_ref("GEN 1:1-2"),
        width=2,
        ordinal=0,
    )
    interior = ParticipantWalk(
        pivots=(VerseId("GEN", 1, 2, None),),
        targets=(
            VerseId("GEN", 1, 2, None),
            VerseId("GEN", 1, 3, None),
        ),
        up_rel="one_to_one",
        down_rel="split",
        composed="split",
    )
    assert _interior_requires_complex(trigger, [interior])


def test_build_range_hull_interior_target_split_escalates(
    seeded_session: Session,
) -> None:
    """Interior target split without corner fan-out still yields complex axis labels."""
    org_translation = seeded_session.scalar(
        select(Translation).where(Translation.name == "org")
    )
    assert org_translation is not None
    left = VersificationScheme(
        name=f"range-int-l-{uuid4().hex[:8]}",
        based_on_name="org",
        based_on_id=org_translation.id,
        canonical=False,
        ingredient={"maxVerses": {"GEN": ["4"]}, "basedOn": "org"},
    )
    right = VersificationScheme(
        name=f"range-int-r-{uuid4().hex[:8]}",
        based_on_name="org",
        based_on_id=org_translation.id,
        canonical=False,
        ingredient={"maxVerses": {"GEN": ["4"]}, "basedOn": "org"},
    )
    seeded_session.add_all([left, right])
    seeded_session.flush()
    seeded_session.add_all(
        [
            MappingRecord(
                scheme_id=left.id,
                source_ref="GEN 1:1-4",
                base_ref="GEN 1:1-3",
                part=None,
                relation=RelationType.renumber,
                ordinal=0,
            ),
            MappingRecord(
                scheme_id=right.id,
                source_ref="GEN 1:2-3",
                base_ref="GEN 1:2",
                part=None,
                relation=RelationType.merge,
                ordinal=0,
            ),
        ]
    )
    seeded_session.flush()
    left_ref = SchemeRef(left.id, org_translation.id, "org")
    right_ref = SchemeRef(right.id, org_translation.id, "org")
    src_hops, tgt_hops = _hop_lists(seeded_session, left_ref, right_ref)
    members = [VerseId(book="GEN", chapter=1, verse=2, part=None)]
    trigger = find_range_trigger(members, src_hops, tgt_hops)
    assert trigger is not None
    result = build_range_hull(trigger, members, src_hops, tgt_hops)
    assert result is not None
    assert result.relation == "complex"
    assert result.source_rel == "range"
    assert result.target_rel == "split"
    assert len(result.edges) == 2
    assert all(edge.source_index in {0, 3} for edge in result.edges)
