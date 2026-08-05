#!/usr/bin/env python3
"""Write multihop chain project zips and scheme JSON to fixtures/assets/multihop.

Run from repo root after changing builders in multihop_chain_fixtures.py or
visual_demo_corpus.py (american zip reuses build_demo_project_zip).
"""

from __future__ import annotations

import json
from pathlib import Path

from frvt.api.logging_config import get_logger
from frvt.testops.fixtures.multihop_chain_fixtures import (
    build_spanish_org_zip,
    engdemo_ingredient,
    infer_spanish_eng_ingredient,
    spanish_org_ref_ingredient,
)
from frvt.testops.fixtures.visual_demo_corpus import build_demo_project_zip

logger = get_logger(__name__)

REPO_ROOT = Path(__file__).resolve().parents[2]
ASSETS = REPO_ROOT / "frvt" / "testops" / "fixtures" / "assets" / "multihop"
SCHEMES_DIR = ASSETS / "schemes"


def write_multihop_assets() -> Path:
    """Build and write multihop zips and scheme JSON; return the assets root."""
    logger.debug("Writing multihop fixture assets to %s", ASSETS)
    ASSETS.mkdir(parents=True, exist_ok=True)
    SCHEMES_DIR.mkdir(parents=True, exist_ok=True)

    (ASSETS / "spanish-org.zip").write_bytes(build_spanish_org_zip())
    (ASSETS / "american-standard-multihop.zip").write_bytes(build_demo_project_zip("en"))

    org_ref = spanish_org_ref_ingredient()
    engdemo = engdemo_ingredient()
    spanish_eng = infer_spanish_eng_ingredient(org_ref, engdemo)

    for name, ingredient in (
        ("engdemo", engdemo),
        ("spanish-org-ref", org_ref),
        ("spanish-eng", spanish_eng),
    ):
        path = SCHEMES_DIR / f"{name}.json"
        path.write_text(json.dumps(ingredient, indent=2) + "\n", encoding="utf-8")

    return ASSETS


def main() -> None:
    """CLI entry: write assets and print paths."""
    root = write_multihop_assets()
    print(f"Wrote multihop assets under {root}")
    for path in sorted(root.rglob("*")):
        if path.is_file():
            print(f"  {path.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
