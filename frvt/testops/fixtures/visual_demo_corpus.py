"""Build in-memory visual-demo project zips and validate their structure.

Extracts whole-book USX from sample translation zips, patches PSA verse-0,
adds a synthetic SIR stub, and emits identity-only VRS (no ``=`` mapping lines).
"""

from __future__ import annotations

import io
import json
import re
import zipfile
from pathlib import Path
from typing import Literal

from frvt.api.logging_config import get_logger
from frvt.testops.sample_assets import repo_root

logger = get_logger(__name__)

DEMO_BOOKS = frozenset({"JHN", "PSA", "GEN", "ACT", "SIR"})
_VRS_MAPPING_LINE = re.compile(r"^\s*[A-Z1-6]{3}\s+\d+:\d+\s*=")
_ASSETS_DIR = Path(__file__).resolve().parent / "assets"
_METADATA = (
    "<DBLMetadata><identification><name>VisualDemo</name>"
    "<language>{language}</language></identification></DBLMetadata>"
)
_SAMPLE_ZIPS: dict[str, Path] = {
    "en": repo_root()
    / "research"
    / "SampleTranslations"
    / "american-standard-1.zip",
    "es": repo_root()
    / "research"
    / "SampleTranslations"
    / "biblica-spanish-1.zip",
}


def _org_max_verses_path() -> Path:
    """Return the packaged org ingredient used for per-chapter maxima."""
    return Path(__file__).resolve().parents[2] / "resources" / "org.json"


def demo_max_verses() -> dict[str, list[str]]:
    """Return per-chapter verse maxima for demo books from org.json (+ SIR stub)."""
    logger.trace("Loading demo maxVerses from org.json")  # type: ignore[attr-defined]
    org = json.loads(_org_max_verses_path().read_text(encoding="utf-8"))
    max_verses: dict[str, list[str]] = {
        book: list(org["maxVerses"][book])
        for book in ("JHN", "PSA", "GEN", "ACT")
        if book in org["maxVerses"]
    }
    # Synthetic SIR stub: 51 chapters, chapter 36 needs verse 13+.
    max_verses["SIR"] = ["30"] * 35 + ["20"] * 16
    return max_verses


def extract_usx_books(sample_zip: Path, books: set[str]) -> dict[str, str]:
    """Extract whole ``release/USX_1/{BOOK}.usx`` files from a sample project zip."""
    logger.debug("Extracting USX books=%s from %s", sorted(books), sample_zip)
    found: dict[str, str] = {}
    with zipfile.ZipFile(sample_zip) as archive:
        for book in books:
            if book == "SIR":
                continue
            name = f"release/USX_1/{book}.usx"
            try:
                found[book] = archive.read(name).decode("utf-8")
            except KeyError as exc:
                raise ValueError(f"Missing {name} in {sample_zip}") from exc
    return found


def ensure_psa_verse0(psa_usx: str, *, chapter: int = 3) -> str:
    """Ensure PSA ``chapter`` includes a verse-0 title milestone when absent."""
    if f'PSA {chapter}:0' in psa_usx or f'sid="PSA {chapter}:0"' in psa_usx:
        return psa_usx

    chapter_open = re.compile(
        rf'(<chapter number="{chapter}" style="c" sid="PSA {chapter}"\s*/>)'
        rf'(?!\s*<para[^>]*>\s*<verse number="0")',
        re.DOTALL,
    )

    def _inject(match: re.Match[str]) -> str:
        return (
            f'{match.group(1)}\n  <para style="d">\n'
            f'    <verse number="0" style="v" sid="PSA {chapter}:0"/>'
            f'Title ({chapter}).<verse eid="PSA {chapter}:0"/>\n  </para>'
        )

    patched, count = chapter_open.subn(_inject, psa_usx, count=1)
    if count:
        logger.debug("Patching PSA chapter %s with verse 0", chapter)
    return patched


def minimal_sir_usx() -> str:
    """Return minimal SIR USX covering chapter 36 verse 13 for partial-span tests."""
    return """<?xml version="1.0" encoding="utf-8"?>
<usx version="3.0">
  <book code="SIR" style="id"/>
  <para style="h">Sirach</para>
  <chapter number="36" style="c" sid="SIR 36"/>
  <para style="p">
    <verse number="13" style="v" sid="SIR 36:13"/>Fixture verse thirteen.<verse eid="SIR 36:13"/>
  </para>
  <chapter eid="SIR 36"/>
</usx>
"""


def identity_vrs(max_verses: dict[str, list[str]]) -> str:
    """Build Paratext-style maxVerses-only VRS (no mapping ``=`` lines)."""
    lines: list[str] = []
    for book in sorted(max_verses):
        chapters = " ".join(f"{idx + 1}:{count}" for idx, count in enumerate(max_verses[book]))
        lines.append(f"{book} {chapters}")
    text = "\n".join(lines) + "\n"
    logger.debug("Built identity VRS books=%s", sorted(max_verses))
    return text


def usx_book_codes(usx_files: dict[str, str]) -> set[str]:
    """Return book codes present in extracted USX files."""
    return set(usx_files)


def validate_usx_mapping_alignment(
    usx_books: set[str],
    ingredient: dict,
) -> list[str]:
    """Return error strings when mapping books are absent from the demo USX set."""
    errors: list[str] = []
    books_in_ingredient: set[str] = set()
    for key in ingredient.get("mappedVerses", {}):
        books_in_ingredient.add(key.split()[0])
    for key in ingredient.get("excludedVerses", []):
        books_in_ingredient.add(key.split()[0])
    for key in ingredient.get("partialVerses", {}):
        books_in_ingredient.add(key.split()[0])
    for book in sorted(books_in_ingredient - usx_books):
        errors.append(f"orphan mapping book {book} not in demo USX")
    return errors


def validate_demo_zip_bytes(data: bytes) -> list[str]:
    """Structural checks for a built visual-demo project zip."""
    errors: list[str] = []
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            names = set(archive.namelist())
            if "metadata.xml" not in names:
                errors.append("missing metadata.xml")
            vrs_path = "release/versification.vrs"
            if vrs_path not in names:
                errors.append(f"missing {vrs_path}")
            else:
                vrs_text = archive.read(vrs_path).decode("utf-8")
                for line in vrs_text.splitlines():
                    if _VRS_MAPPING_LINE.match(line):
                        errors.append("VRS contains mapping '=' line")
            for book in sorted(DEMO_BOOKS):
                usx_path = f"release/USX_1/{book}.usx"
                if usx_path not in names:
                    errors.append(f"missing {usx_path}")
    except zipfile.BadZipFile:
        errors.append("invalid zip")
    return errors


def build_demo_project_zip(language: Literal["en", "es"]) -> bytes:
    """Build EN or ES visual-demo project zip bytes in memory."""
    logger.debug("Building visual-demo zip language=%s", language)
    sample = _SAMPLE_ZIPS[language]
    usx = extract_usx_books(sample, DEMO_BOOKS - {"SIR"})
    usx["PSA"] = ensure_psa_verse0(usx["PSA"], chapter=3)
    usx["SIR"] = minimal_sir_usx()
    max_verses = demo_max_verses()
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("metadata.xml", _METADATA.format(language=language))
        archive.writestr("release/versification.vrs", identity_vrs(max_verses))
        for book, content in sorted(usx.items()):
            archive.writestr(f"release/USX_1/{book}.usx", content)
    data = buffer.getvalue()
    issues = validate_demo_zip_bytes(data)
    if issues:
        raise ValueError(f"Built zip failed validation: {issues}")
    return data


def demo_project_zip_path(language: Literal["en", "es"]) -> Path:
    """Return cached on-disk path for a built demo zip (writes when missing)."""
    _ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    path = _ASSETS_DIR / f"visual-demo-{language}.zip"
    if not path.is_file():
        path.write_bytes(build_demo_project_zip(language))
        logger.debug("Wrote demo zip to %s", path)
    return path
