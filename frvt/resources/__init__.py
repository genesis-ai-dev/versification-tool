"""Packaged canonical Copenhagen ingredients and the versification schema."""

from __future__ import annotations

import json
from functools import lru_cache
from importlib import resources
from typing import Any

from frvt.api.logging_config import get_logger

logger = get_logger(__name__)

# Canonical numbering-space names seeded at startup (org is the null-base root).
CANONICAL_NAMES: tuple[str, ...] = ("org", "eng", "lxx", "rso", "rsc", "vul")


@lru_cache
def load_canonical_ingredient(name: str) -> dict[str, Any]:
    """Load a packaged canonical ingredient JSON by short name (for example ``eng``)."""
    logger.trace("Loading packaged canonical ingredient name=%s", name)  # type: ignore[attr-defined]
    package = resources.files("frvt.resources")
    path = package.joinpath(f"{name}.json")
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise ValueError(f"Canonical ingredient {name!r} must be a JSON object")
    return data


def load_canonical_text(name: str) -> str:
    """Return the packaged canonical JSON exactly as shipped, BOM stripped."""
    logger.trace("Loading packaged canonical text name=%s", name)  # type: ignore[attr-defined]
    package = resources.files("frvt.resources")
    return package.joinpath(f"{name}.json").read_text(encoding="utf-8-sig")


def load_companion_vrs(name: str) -> str | None:
    """Return the bundled .vrs for a canonical name, or None when it has none.

    vul has no companion. The text is the Paratext file copied into the package,
    not a conversion of the JSON.
    """
    logger.trace("Loading companion vrs name=%s", name)  # type: ignore[attr-defined]
    package = resources.files("frvt.resources")
    path = package.joinpath("vrs").joinpath(f"{name}.vrs")
    if not path.is_file():
        return None
    return path.read_text(encoding="utf-8-sig")
