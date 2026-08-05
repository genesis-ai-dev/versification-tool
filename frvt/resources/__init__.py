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
