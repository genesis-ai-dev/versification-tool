"""Parse DBL ``metadata.xml`` for project language and script direction."""

from __future__ import annotations

import xml.etree.ElementTree as ET
from dataclasses import dataclass
from typing import Literal

from frvt.api.logging_config import get_logger

logger = get_logger(__name__)

TextDirection = Literal["ltr", "rtl"]


@dataclass(frozen=True)
class ProjectMetadata:
    """Language, naming, and script metadata extracted from a project bundle."""

    # Translation display name from ``<identification><name>`` when present.
    translation_name: str | None
    # Resolved language tag from ``<ldml>`` or ``<iso>`` when present.
    language_code: str | None
    # Normalized text direction from ``<scriptDirection>`` when present.
    script_direction: TextDirection | None


def _local(tag: str) -> str:
    """Strip an XML namespace URI so tag comparisons stay namespace-agnostic."""
    if "}" in tag:
        return tag.rsplit("}", 1)[-1]
    return tag


def _text_content(parent: ET.Element, local_name: str) -> str | None:
    """Return trimmed text of the first direct child with ``local_name``."""
    for child in parent:
        if _local(child.tag) == local_name:
            value = (child.text or "").strip()
            return value or None
    return None


def parse_dbl_metadata(xml_text: str) -> ProjectMetadata:
    """Parse ``metadata.xml`` text into optional naming and language fields.

    Malformed XML or absent elements yield ``None`` fields without raising.
    """
    logger.debug("Parsing DBL metadata (%s chars)", len(xml_text))
    cleaned = xml_text.lstrip("\ufeff")
    try:
        root = ET.fromstring(cleaned)
    except ET.ParseError:
        logger.debug("DBL metadata is not well-formed XML")
        return ProjectMetadata(
            translation_name=None,
            language_code=None,
            script_direction=None,
        )

    identification_el: ET.Element | None = None
    language_el: ET.Element | None = None
    for node in root.iter():
        tag = _local(node.tag)
        if tag == "identification" and identification_el is None:
            identification_el = node
        elif tag == "language" and language_el is None:
            language_el = node

    translation_name = (
        _text_content(identification_el, "name") if identification_el is not None else None
    )

    language_code: str | None = None
    script_direction: TextDirection | None = None
    if language_el is not None:
        language_code = _text_content(language_el, "ldml") or _text_content(
            language_el, "iso"
        )
        raw_direction = _text_content(language_el, "scriptDirection")
        if raw_direction is not None:
            upper = raw_direction.upper()
            if upper == "RTL":
                script_direction = "rtl"
            elif upper == "LTR":
                script_direction = "ltr"

    return ProjectMetadata(
        translation_name=translation_name,
        language_code=language_code,
        script_direction=script_direction,
    )


def resolve_text_direction(metadata: ProjectMetadata | None) -> TextDirection:
    """Return ``rtl`` only when metadata explicitly reports RTL; otherwise ``ltr``."""
    if metadata is not None and metadata.script_direction == "rtl":
        return "rtl"
    return "ltr"
