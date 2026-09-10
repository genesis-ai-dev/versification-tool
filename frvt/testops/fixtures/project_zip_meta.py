"""Rewrite a project zip's DBL identification name for isolated test ingest."""

from __future__ import annotations

import io
import xml.etree.ElementTree as ET
import zipfile

from frvt.api.logging_config import get_logger

logger = get_logger(__name__)

_FALLBACK_METADATA = (
    "<DBLMetadata><identification><name>{name}</name></identification></DBLMetadata>"
)


def _local(tag: str) -> str:
    """Strip an XML namespace URI so tag comparisons stay namespace-agnostic."""
    if "}" in tag:
        return tag.rsplit("}", 1)[-1]
    return tag


def _set_identification_name(xml_text: str, name: str) -> str:
    """Return metadata XML with ``<identification><name>`` set to ``name``.

    Malformed XML is replaced with a minimal DBL stub so ingest still has a
    unique translation name. Existing language and script elements are kept
    when the document parses.
    """
    cleaned = xml_text.lstrip("\ufeff")
    try:
        root = ET.fromstring(cleaned)
    except ET.ParseError:
        logger.debug("Replacing unparseable metadata.xml while setting name=%s", name)
        return _FALLBACK_METADATA.format(name=name)

    identification_el: ET.Element | None = None
    for node in root.iter():
        if _local(node.tag) == "identification":
            identification_el = node
            break
    if identification_el is None:
        identification_el = ET.SubElement(root, "identification")
    name_el: ET.Element | None = None
    for child in identification_el:
        if _local(child.tag) == "name":
            name_el = child
            break
    if name_el is None:
        name_el = ET.SubElement(identification_el, "name")
    name_el.text = name
    return ET.tostring(root, encoding="unicode")


def with_identification_name(archive_bytes: bytes, name: str) -> bytes:
    """Return a copy of ``archive_bytes`` whose DBL identification name is ``name``.

    Sample zips share one metadata name, and ingest treats that name as
    authoritative over the upload form. Tests that ingest the same zip more
    than once (or two zips built from the same stub) must rewrite the name
    first or the second call is ``409 conflict``.
    """
    logger.debug("Rewriting project zip identification name=%s", name)
    source = zipfile.ZipFile(io.BytesIO(archive_bytes))
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as dest:
        found_metadata = False
        for info in source.infolist():
            data = source.read(info.filename)
            if info.filename.split("/")[-1].lower() == "metadata.xml":
                data = _set_identification_name(data.decode("utf-8-sig"), name).encode(
                    "utf-8"
                )
                found_metadata = True
            dest.writestr(info, data)
        if not found_metadata:
            dest.writestr(
                "metadata.xml", _FALLBACK_METADATA.format(name=name).encode("utf-8")
            )
    source.close()
    return output.getvalue()
