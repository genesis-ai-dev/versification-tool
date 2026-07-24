"""Locate USX trees and versification files inside a project zip archive."""

from __future__ import annotations

import io
import re
import zipfile
from dataclasses import dataclass

from frvt.api.logging_config import get_logger
from frvt.ingest.types import IngestIssue

logger = get_logger(__name__)

_USX_DIR = re.compile(r"(^|/)release/USX_[^/]+/$")
_USX_FILE = re.compile(r"(^|/)release/USX_[^/]+/[^/]+\.usx$", re.IGNORECASE)
_VRS_FILE = re.compile(r"(^|/)release/.+\.vrs$", re.IGNORECASE)


@dataclass(frozen=True)
class ProjectArchiveContents:
    """Located project members needed by ``ingest_project``."""

    # Sorted ``(archive_path, utf-8 text)`` pairs for every USX book file found.
    usx_files: tuple[tuple[str, str], ...]
    # Archive path of the chosen ``.vrs`` file.
    vrs_path: str | None
    # UTF-8 text of the chosen ``.vrs`` file when present.
    vrs_text: str | None
    # Blocking location issues (missing USX tree and/or missing ``.vrs``).
    issues: tuple[IngestIssue, ...]


def locate_project_members(archive_bytes: bytes) -> ProjectArchiveContents:
    """Unzip ``archive_bytes`` and locate required USX / VRS members."""
    logger.debug("Locating project members in archive (%s bytes)", len(archive_bytes))
    issues: list[IngestIssue] = []
    try:
        with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
            names = archive.namelist()
            usx_paths = sorted(
                name for name in names if _USX_FILE.search(name.replace("\\", "/"))
            )
            vrs_paths = [
                name for name in names if _VRS_FILE.search(name.replace("\\", "/"))
            ]
            if not usx_paths and not any(
                _USX_DIR.search(name.replace("\\", "/")) for name in names
            ):
                issues.append(
                    IngestIssue(
                        kind="missing",
                        field="archive",
                        message="No USX_* tree",
                    )
                )

            vrs_path: str | None = None
            vrs_text: str | None = None
            if not vrs_paths:
                issues.append(
                    IngestIssue(
                        kind="missing",
                        field="versification",
                        message="No .vrs in project",
                    )
                )
            else:
                # Prefer the conventional release/versification.vrs when present.
                preferred = [
                    path
                    for path in vrs_paths
                    if path.replace("\\", "/").lower().endswith("versification.vrs")
                ]
                vrs_path = preferred[0] if preferred else sorted(vrs_paths)[0]
                vrs_text = archive.read(vrs_path).decode("utf-8-sig")

            usx_files: list[tuple[str, str]] = []
            for path in usx_paths:
                usx_files.append((path, archive.read(path).decode("utf-8-sig")))

            return ProjectArchiveContents(
                usx_files=tuple(usx_files),
                vrs_path=vrs_path,
                vrs_text=vrs_text,
                issues=tuple(issues),
            )
    except (UnicodeDecodeError, RuntimeError, zipfile.BadZipFile):
        logger.error(
            "Archive cannot be decoded as a supported project zip", exc_info=True
        )
        return ProjectArchiveContents(
            usx_files=(),
            vrs_path=None,
            vrs_text=None,
            issues=(
                IngestIssue(
                    kind="invalid",
                    field="archive",
                    message="File is not a readable UTF-8 project zip archive",
                ),
            ),
        )
