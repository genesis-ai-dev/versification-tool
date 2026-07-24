"""Resolve paths and bytes for research sample assets used by ingest/resolve tests."""

from __future__ import annotations

from pathlib import Path

from frvt.api.logging_config import get_logger

logger = get_logger(__name__)

# Repo root is three levels above this file: frvt/testops/sample_assets.py → repo.
_REPO_ROOT = Path(__file__).resolve().parents[2]


def repo_root() -> Path:
    """Return the FrontierResearch repository root path."""
    logger.trace("Resolving repo root")  # type: ignore[attr-defined]
    return _REPO_ROOT


def primary_project_zip() -> Path:
    """Return the primary sample project zip path used by ingest happy-path cases."""
    path = (
        _REPO_ROOT
        / "research"
        / "SampleTranslations"
        / "6b7f504f1b6050c1-rev1-release.zip"
    )
    logger.debug("Primary project zip path=%s exists=%s", path, path.is_file())
    return path


def sample_project_zips() -> list[Path]:
    """Return all sample translation zip paths under ``research/SampleTranslations``."""
    folder = _REPO_ROOT / "research" / "SampleTranslations"
    zips = sorted(folder.glob("*.zip"))
    logger.debug("Found %s sample project zips", len(zips))
    return zips


def copenhagen_json(name: str) -> Path:
    """Return a Copenhagen ingredient JSON path (e.g. ``eng``, ``validated``)."""
    path = _REPO_ROOT / "research" / "CopenhagenFormat" / f"{name}.json"
    logger.debug("Copenhagen json name=%s path=%s", name, path)
    return path


def paratext_vrs(name: str) -> Path:
    """Return a Paratext ``.vrs`` path (e.g. ``eng``, ``org``, ``lxx``)."""
    path = _REPO_ROOT / "research" / "ParatextFormat" / f"{name}.vrs"
    logger.debug("Paratext vrs name=%s path=%s", name, path)
    return path


def read_bytes(path: Path) -> bytes:
    """Read a file as bytes for multipart upload tests."""
    logger.debug("Reading asset bytes from %s", path)
    return path.read_bytes()
