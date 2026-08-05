"""Builders for a minimal project zip that includes a Psalm verse-0 title span.

Use this when UI/e2e cases need a guaranteed ``Title (0)`` gutter label without
depending on sample translation text that often omits verse 0.
"""

from __future__ import annotations

import io
import zipfile
from pathlib import Path

from frvt.api.logging_config import get_logger

logger = get_logger(__name__)

_ASSETS_DIR = Path(__file__).resolve().parent / "assets"
_ZIP_NAME = "psa-verse0-project.zip"

# Minimal USX with an explicit Psalm title (verse 0) plus a few body verses.
# Chapter 1 keeps default book-select navigation on the verse-0 chapter.
_PSA_USX = """<?xml version="1.0" encoding="utf-8"?>
<usx version="3.0">
  <book code="PSA" style="id"/>
  <para style="h">Psalms</para>
  <chapter number="1" style="c" sid="PSA 1"/>
  <para style="d">
    <verse number="0" style="v" sid="PSA 1:0"/>A Psalm of David, when he fled from Absalom his son.<verse eid="PSA 1:0"/>
  </para>
  <para style="q1">
    <verse number="1" style="v" sid="PSA 1:1"/>O Lord, how many are my foes!<verse eid="PSA 1:1"/>
  </para>
  <para style="q1">
    <verse number="2" style="v" sid="PSA 1:2"/>Many are saying of my soul, there is no salvation for him in God.<verse eid="PSA 1:2"/>
  </para>
  <para style="q1">
    <verse number="3" style="v" sid="PSA 1:3"/>But you, O Lord, are a shield about me.<verse eid="PSA 1:3"/>
  </para>
  <chapter eid="PSA 1"/>
</usx>
"""

_VRS = "PSA 1:6\n"

_METADATA = (
    "<DBLMetadata><identification><name>PSAVerse0Fixture</name>"
    "<language>en</language></identification></DBLMetadata>"
)


def zip_with_psalm_verse0() -> bytes:
    """Return a project zip whose PSA chapter 3 includes a verse-0 title span."""
    logger.debug("Building PSA verse-0 project zip")
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("metadata.xml", _METADATA)
        archive.writestr("release/versification.vrs", _VRS)
        archive.writestr("release/USX_1/PSA.usx", _PSA_USX)
    return buffer.getvalue()


def verse0_project_zip_path() -> Path:
    """Return the on-disk path for the committed verse-0 fixture zip.

    Creates the file when missing so pytest and Playwright share one asset.
    """
    logger.debug("Resolving verse-0 project zip path under %s", _ASSETS_DIR)
    _ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    path = _ASSETS_DIR / _ZIP_NAME
    if not path.is_file():
        path.write_bytes(zip_with_psalm_verse0())
        logger.debug("Wrote verse-0 fixture zip to %s", path)
    return path


def ensure_verse0_project_zip() -> Path:
    """Ensure the fixture zip exists and return its path (always rewrite bytes)."""
    logger.debug("Ensuring verse-0 project zip is current")
    _ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    path = _ASSETS_DIR / _ZIP_NAME
    path.write_bytes(zip_with_psalm_verse0())
    return path
