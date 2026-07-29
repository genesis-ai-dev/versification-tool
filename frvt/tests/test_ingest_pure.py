"""Pure ingest tests: derive, VRS, USX, zip location, and validation."""

from __future__ import annotations

import io
import json
import zipfile

import pytest
from frvt.ingest.derive_mappings import derive_mapping_records
from frvt.ingest.ingest_api import ingest_project, ingest_versification
from frvt.ingest.types import ParsedScheme, ParsedSpan
from frvt.ingest.usx_parse import collapse_duplicate_spans, parse_usx
from frvt.ingest.vrs_convert import convert_vrs
from frvt.testops.sample_assets import repo_root

_REPO = repo_root()
_ENG_JSON = _REPO / "research" / "CopenhagenFormat" / "eng.json"
_VALIDATED_JSON = _REPO / "research" / "CopenhagenFormat" / "validated.json"
_ENG_VRS = _REPO / "research" / "ParatextFormat" / "eng.vrs"
_LXX_VRS = _REPO / "research" / "ParatextFormat" / "lxx.vrs"
# Pin the English sample used elsewhere (visual demo, e2e); glob order is not stable.
_SAMPLE_ZIP = _REPO / "research" / "SampleTranslations" / "american-standard-1.zip"


@pytest.mark.phase6
@pytest.mark.ingest
def test_derive_eng_mapped_psalm_shift() -> None:
    """TC-INGEST-006: Derive mapping records (PSA 3:0–8 shift)."""
    from frvt.ingest.normalize import normalize_ingredient

    ingredient = normalize_ingredient(json.loads(_ENG_JSON.read_text(encoding="utf-8")))
    scheme = ParsedScheme(
        name="eng", based_on="org", canonical=False, ingredient=ingredient
    )
    rows = derive_mapping_records(scheme)
    mapped_count = len(ingredient.get("mappedVerses", {}))
    assert (
        sum(1 for row in rows if row.relation in {"shift", "renumber", "one_to_one"})
        == mapped_count
    )
    psa = next(row for row in rows if row.source_ref == "PSA 3:0-8")
    assert psa.relation == "shift"
    assert psa.base_ref == "PSA 3:1-9"
    assert psa.part is None


@pytest.mark.phase6
@pytest.mark.ingest
def test_derive_partial_part_column() -> None:
    """TC-INGEST-006: Derive mapping records (partial part column)."""
    from frvt.ingest.normalize import normalize_ingredient

    ingredient = normalize_ingredient(
        json.loads(_VALIDATED_JSON.read_text(encoding="utf-8"))
    )
    scheme = ParsedScheme(
        name="validated", based_on="org", canonical=False, ingredient=ingredient
    )
    rows = derive_mapping_records(scheme)
    partial = next(
        row
        for row in rows
        if row.source_ref == "SIR 36:13" and row.relation == "partial"
    )
    assert partial.part == "a"
    assert "a" not in partial.source_ref
    excludes = [row for row in rows if row.relation == "exclude"]
    merges = [row for row in rows if row.relation == "merge"]
    assert len(excludes) == len(ingredient["excludedVerses"])
    assert len(merges) == len(ingredient["mergedVerses"])


@pytest.mark.phase6
@pytest.mark.ingest
def test_vrs_convert_eng_sample() -> None:
    """TC-INGEST-004: VRS conversion contract (resolver T8)."""
    ingredient, issues = convert_vrs(_ENG_VRS.read_text(encoding="utf-8"))
    assert not issues
    assert ingredient["maxVerses"]["GEN"][0] == "31"
    assert ingredient["mappedVerses"]["GEN 31:55"] == "GEN 32:1"
    assert ingredient["basedOn"] == "org"


@pytest.mark.phase6
@pytest.mark.ingest
def test_vrs_convert_excluded_verses() -> None:
    """Minus-prefixed VRS omission lines become excluded ingredient verses."""
    ingredient, issues = convert_vrs(_LXX_VRS.read_text(encoding="utf-8"))
    assert not issues
    assert "GEN 31:51" in ingredient["excludedVerses"]
    assert "SIR 26:27" in ingredient["excludedVerses"]


@pytest.mark.phase6
@pytest.mark.ingest
def test_usx_parse_phm_from_sample_zip() -> None:
    """TC-INGEST-005: USX parse contract (resolver T9)."""
    with zipfile.ZipFile(_SAMPLE_ZIP) as archive:
        usx = archive.read("release/USX_1/PHM.usx").decode("utf-8-sig")
    spans = parse_usx(usx)
    assert spans
    assert [span.seq for span in spans] == list(range(len(spans)))
    first = next(span for span in spans if span.verse == 1)
    assert first.book == "PHM"
    assert first.content
    assert "Paul" in first.content


@pytest.mark.phase6
@pytest.mark.ingest
def test_etl_functions_are_pure_no_db() -> None:
    """TC-INGEST-007: ETL ingest/derive functions are pure (no DB writes)."""
    # Call without a session — these return DTOs / issues only.
    ingredient, issues = convert_vrs(_ENG_VRS.read_text(encoding="utf-8"))
    assert not issues
    scheme = ParsedScheme(
        name="eng", based_on="org", canonical=False, ingredient=ingredient
    )
    rows = derive_mapping_records(scheme)
    assert rows
    scheme2, issues2 = ingest_versification(_ENG_JSON.read_bytes(), "eng.json")
    assert not issues2
    assert scheme2 is not None


@pytest.mark.phase6
@pytest.mark.ingest
def test_usx_comma_separated_verses() -> None:
    """TC-INGEST-014: USX comma-separated verses (Interim binding)."""
    usx = (
        '<?xml version="1.0"?><usx version="3.0"><book code="GEN"/>'
        '<chapter number="1" style="c"/>'
        '<verse number="6,7" style="v" sid="GEN 1:6"/>Shared text'
        '<verse eid="GEN 1:6"/></usx>'
    )
    spans = parse_usx(usx)
    assert len(spans) == 2
    assert spans[0].verse == 6
    assert spans[0].content == "Shared text"
    assert spans[1].verse == 7
    assert spans[1].content == ""


@pytest.mark.phase6
@pytest.mark.ingest
def test_usx_notes_are_dropped() -> None:
    """TC-INGEST-015: USX notes are dropped."""
    usx = (
        '<?xml version="1.0"?><usx version="3.0"><book code="GEN"/>'
        '<chapter number="1" style="c"/>'
        '<verse number="1" style="v" sid="GEN 1:1"/>Visible'
        '<note caller="+"><char style="fr">1:1 </char>'
        '<char style="ft">SECRET</char></note> after'
        '<verse eid="GEN 1:1"/></usx>'
    )
    spans = parse_usx(usx)
    assert len(spans) == 1
    assert "SECRET" not in spans[0].content
    assert "Visible" in spans[0].content
    assert "after" in spans[0].content


@pytest.mark.phase6
@pytest.mark.ingest
def test_unsupported_vrs_fails_closed() -> None:
    """TC-INGEST-016: Unsupported VRS construct fails closed."""
    bad = "GEN 1:31\n!!! not-a-valid-vrs-line !!!\n"
    ingredient, issues = convert_vrs(bad)
    assert issues
    assert any(issue.kind == "invalid" for issue in issues)
    # Fail closed: do not silently accept a partial ingredient without issues.
    assert ingredient["maxVerses"].get("GEN") == ["31"] or issues


@pytest.mark.phase6
@pytest.mark.ingest
def test_merged_verses_override_mapped_classification() -> None:
    """MergedVerses refs emit a single merge row using mappedVerses for base_ref."""
    from frvt.ingest.derive_mappings import derive_mapping_records
    from frvt.ingest.types import ParsedScheme

    ingredient = {
        "basedOn": "org",
        "maxVerses": {"GEN": ["2"]},
        "excludedVerses": [],
        "mappedVerses": {"GEN 1:1-2": "GEN 1:1"},
        "partialVerses": {},
        "mergedVerses": ["GEN 1:1-2"],
    }
    rows = derive_mapping_records(
        ParsedScheme(
            name="merge-test", based_on="org", canonical=False, ingredient=ingredient
        )
    )
    matches = [row for row in rows if row.source_ref == "GEN 1:1-2"]
    assert len(matches) == 1
    assert matches[0].relation == "merge"
    assert matches[0].base_ref == "GEN 1:1"


def test_collapse_duplicate_verse_coords() -> None:
    """Repeated coordinates keep first-seen order and prefer non-empty content."""
    spans = [
        ParsedSpan(0, "1CH", 26, 31, None, ""),
        ParsedSpan(1, "1CH", 26, 31, None, "Hebron"),
        ParsedSpan(2, "1CH", 26, 32, None, "Next"),
    ]
    collapsed = collapse_duplicate_spans(spans)
    assert len(collapsed) == 2
    assert collapsed[0].content == "Hebron"
    assert [span.seq for span in collapsed] == [0, 1]


def test_project_missing_vrs() -> None:
    """A zip without a .vrs reports a missing versification issue."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr(
            "release/USX_1/PHM.usx", "<usx version='3.0'><book code='PHM'/></usx>"
        )
    result = ingest_project(buffer.getvalue())
    assert result.issues
    assert any(
        issue.kind == "missing" and issue.field == "versification"
        for issue in result.issues
    )


def test_project_missing_usx() -> None:
    """A zip without a USX tree reports a missing archive issue."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("release/versification.vrs", "GEN 1:31\n")
    result = ingest_project(buffer.getvalue())
    assert result.issues
    assert any(
        issue.kind == "missing" and issue.field == "archive" for issue in result.issues
    )


def test_project_without_verse_spans_is_invalid() -> None:
    """A structurally present USX tree must still contain at least one verse."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr(
            "release/USX_1/GEN.usx",
            "<usx version='3.0'><book code='GEN'/><chapter number='1'/></usx>",
        )
        archive.writestr("release/versification.vrs", "GEN 1:31\n")
    result = ingest_project(buffer.getvalue())
    assert any(
        issue.kind == "invalid" and issue.field == "archive" for issue in result.issues
    )


def test_project_with_malformed_usx_is_invalid() -> None:
    """Malformed XML is reported as invalid content instead of escaping as a 500."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("release/USX_1/GEN.usx", "<usx><book code='GEN'>")
        archive.writestr("release/versification.vrs", "GEN 1:31\n")
    result = ingest_project(buffer.getvalue())
    assert any(
        issue.kind == "invalid" and issue.field == "archive" for issue in result.issues
    )


def test_invalid_ingredient_json() -> None:
    """Unparseable ingredient JSON yields an invalid issue."""
    scheme, issues = ingest_versification(b"{not-json", "bad.json")
    assert scheme is None
    assert issues
    assert all(issue.kind == "invalid" for issue in issues)


def test_reversed_mapping_range_is_invalid() -> None:
    """A mapped range whose end precedes its start fails closed at ingest."""
    raw = json.dumps(
        {
            "maxVerses": {"GEN": ["31"]},
            "mappedVerses": {"GEN 1:31-2": "GEN 1:1-30"},
        }
    ).encode()
    scheme, issues = ingest_versification(raw, "reversed.json")
    assert scheme is None
    assert any(issue.field == "mappedVerses" for issue in issues)


def test_ingest_versification_json_happy() -> None:
    """A valid Copenhagen JSON file produces a non-canonical ParsedScheme."""
    raw = _ENG_JSON.read_bytes()
    scheme, issues = ingest_versification(raw, "eng.json")
    assert not issues
    assert scheme is not None
    assert scheme.canonical is False
    assert scheme.based_on == "org" or scheme.ingredient.get("basedOn") == "org"
