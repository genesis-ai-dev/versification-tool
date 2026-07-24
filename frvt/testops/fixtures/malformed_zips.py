"""Builders for malformed project zips used by ingest negative cases."""

from __future__ import annotations

import io
import zipfile

from frvt.api.logging_config import get_logger

logger = get_logger(__name__)


def zip_missing_usx() -> bytes:
    """Return a zip that has a ``.vrs`` under ``release/`` but no ``USX_*`` tree."""
    logger.debug("Building zip missing USX tree")
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("release/versification.vrs", "GEN 1\n")
        archive.writestr(
            "metadata.xml",
            "<DBLMetadata><identification><name>MissingUSX</name>"
            "<language>en</language></identification></DBLMetadata>",
        )
    return buffer.getvalue()


def zip_missing_vrs() -> bytes:
    """Return a zip that has a USX tree but no ``.vrs`` file."""
    logger.debug("Building zip missing VRS")
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr(
            "release/USX_1/PHM.usx",
            '<?xml version="1.0"?><usx version="3.0"><book code="PHM"/>'
            '<chapter number="1" style="c"/>'
            '<verse number="1" style="v" sid="PHM 1:1"/>Hi'
            '<verse eid="PHM 1:1"/></usx>',
        )
        archive.writestr(
            "metadata.xml",
            "<DBLMetadata><identification><name>MissingVRS</name>"
            "<language>en</language></identification></DBLMetadata>",
        )
    return buffer.getvalue()


def oversize_bytes(size: int) -> bytes:
    """Return a byte blob of ``size`` for upload size-limit negatives."""
    logger.debug("Building oversize blob size=%s", size)
    return b"0" * size


def zip_usfm_only() -> bytes:
    """Return a zip with a ``.vrs`` and USFM content but no ``USX_*`` tree.

    Used to confirm USFM-only projects convert or fail closed without a silent
    partial persist.
    """
    logger.debug("Building USFM-only project zip")
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("release/versification.vrs", "GEN 1:31\n")
        archive.writestr(
            "release/USFM/GEN.sfm",
            r"\id GEN\c 1\v 1 In the beginning",
        )
        archive.writestr(
            "metadata.xml",
            "<DBLMetadata><identification><name>UsfmOnly</name>"
            "<language>en</language></identification></DBLMetadata>",
        )
    return buffer.getvalue()
