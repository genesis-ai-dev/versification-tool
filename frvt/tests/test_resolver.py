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
from frvt.resolver.chains import build_chain, preferred_scheme_ref
from frvt.resolver.types import SchemeRef
from sqlalchemy import select
from sqlalchemy.orm import Session


def _scheme(session: Session, name: str) -> SchemeRef:
    """Load the preferred scheme for a canonical anchor by name."""
    translation = session.scalar(select(Translation).where(Translation.name == name))
    assert translation is not None
    ref = preferred_scheme_ref(session, translation.id)
    assert ref is not None
    return ref


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
