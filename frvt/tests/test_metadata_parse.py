"""Unit tests for DBL metadata.xml parsing."""

from __future__ import annotations

from frvt.ingest.metadata_parse import (
    parse_dbl_metadata,
    resolve_text_direction,
)

_EN_LTR = """<?xml version="1.0"?>
<DBLMetadata>
  <identification>
    <name>English Sample</name>
  </identification>
  <language>
    <iso>eng</iso>
    <ldml>en</ldml>
    <scriptDirection>LTR</scriptDirection>
  </language>
</DBLMetadata>"""

_ARB_RTL = """<?xml version="1.0"?>
<DBLMetadata>
  <language>
    <iso>arb</iso>
    <name>Arabic</name>
    <scriptDirection>RTL</scriptDirection>
    <ldml>arb</ldml>
  </language>
</DBLMetadata>"""


def test_parse_prefers_ldml_over_iso() -> None:
    """Language code uses ldml when both ldml and iso are present."""
    meta = parse_dbl_metadata(_EN_LTR)
    assert meta.translation_name == "English Sample"
    assert meta.language_code == "en"
    assert meta.script_direction == "ltr"


def test_parse_rtl_script_direction() -> None:
    """RTL scriptDirection normalizes to lowercase rtl."""
    meta = parse_dbl_metadata(_ARB_RTL)
    assert meta.language_code == "arb"
    assert meta.script_direction == "rtl"


def test_parse_missing_language_elements() -> None:
    """Absent language block yields null language fields without raising."""
    meta = parse_dbl_metadata("<DBLMetadata><identification/></DBLMetadata>")
    assert meta.translation_name is None
    assert meta.language_code is None
    assert meta.script_direction is None


def test_parse_malformed_xml() -> None:
    """Malformed XML yields empty metadata."""
    meta = parse_dbl_metadata("<not closed")
    assert meta.translation_name is None
    assert meta.language_code is None
    assert meta.script_direction is None


def test_resolve_text_direction_defaults_ltr() -> None:
    """Missing or non-RTL metadata defaults to ltr."""
    assert resolve_text_direction(None) == "ltr"
    assert resolve_text_direction(parse_dbl_metadata(_EN_LTR)) == "ltr"


def test_resolve_text_direction_rtl() -> None:
    """Explicit RTL metadata resolves to rtl."""
    assert resolve_text_direction(parse_dbl_metadata(_ARB_RTL)) == "rtl"
