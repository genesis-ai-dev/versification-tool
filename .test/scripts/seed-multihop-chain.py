#!/usr/bin/env python3
"""Seed the multi-hop chain test bed on a running FRVT server (app DB, not frvt_test).

Idempotent by default: reuses existing rows named engdemo, spanish-org,
american-standard-multihop, and the three custom scheme names. When you delete
translations or schemes in Manage, re-run this script to recreate them and
restore associations.

Use ``--replace`` to delete and recreate specific pieces without wiping the
whole test bed (for example after ``write-multihop-assets.py`` updates zips).

Environment: FRVT_BASE_URL (default http://localhost:8000),
FRVT_BASIC_AUTH (default admin:Admin123!).
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

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

BASE_URL = os.environ.get("FRVT_BASE_URL", "http://localhost:8000").rstrip("/")
AUTH = os.environ.get("FRVT_BASIC_AUTH", "admin:Admin123!")
AUTH_HEADER = "Basic " + base64.b64encode(AUTH.encode()).decode("ascii")

TRANSLATION_NAMES = {
    "engdemo": "engdemo",
    "spanish": "spanish-org",
    "american": "american-standard-multihop",
}
SCHEME_NAMES = {
    "engdemo": "engdemo",
    "spanish_org_ref": "spanish-org-ref",
    "spanish_eng": "spanish-eng",
}

REPLACE_ALIASES: dict[str, str] = {
    "engdemo-shell": "engdemo",
    "engdemo-scheme": "engdemo",
    "spanish-org": "spanish",
    "american-standard-multihop": "american",
    "spanish-org-ref": "spanish_org_ref",
    "spanish-eng": "spanish_eng",
    "all-translations": "all_translations",
    "all-schemes": "all_schemes",
    "all": "all",
}


def _request(
    method: str,
    path: str,
    *,
    json_body: dict[str, Any] | None = None,
    data: dict[str, str] | None = None,
    files: dict[str, tuple[str, bytes, str]] | None = None,
) -> tuple[int, Any]:
    """Send one HTTP request and return status code and parsed JSON body."""
    url = f"{BASE_URL}{path}"
    headers = {"Authorization": AUTH_HEADER}
    body: bytes | None = None

    if files is not None:
        buffer = io.BytesIO()
        for field_name, (filename, payload, mime) in files.items():
            buffer.write(b"--frvt\r\n")
            buffer.write(
                f"Content-Disposition: form-data; name=\"{field_name}\"; "
                f"filename=\"{filename}\"\r\n".encode()
            )
            buffer.write(f"Content-Type: {mime}\r\n\r\n".encode())
            buffer.write(payload)
            buffer.write(b"\r\n")
        for field_name, value in (data or {}).items():
            buffer.write(b"--frvt\r\n")
            buffer.write(
                f"Content-Disposition: form-data; name=\"{field_name}\"\r\n\r\n".encode()
            )
            buffer.write(value.encode())
            buffer.write(b"\r\n")
        buffer.write(b"--frvt--\r\n")
        body = buffer.getvalue()
        headers["Content-Type"] = "multipart/form-data; boundary=frvt"
    elif json_body is not None:
        body = json.dumps(json_body).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=120) as response:
            raw = response.read()
            parsed = json.loads(raw) if raw else None
            return response.status, parsed
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            parsed = json.loads(raw) if raw else None
        except json.JSONDecodeError:
            parsed = raw.decode("utf-8", errors="replace")
        return exc.code, parsed


def die(message: str) -> None:
    """Print a fatal error and exit."""
    print(f"seed-multihop-chain: {message}", file=sys.stderr)
    sys.exit(1)


def require_ok(status: int, body: Any, context: str) -> Any:
    """Return body when status is success; otherwise exit."""
    if status in (200, 201, 204):
        return body
    die(f"{context} failed HTTP {status}: {body}")


def list_translations() -> list[dict[str, Any]]:
    """Return non-anchor translation rows from the API."""
    status, body = _request("GET", "/api/translations?limit=500")
    require_ok(status, body, "list translations")
    return list(body.get("items", []))


def translation_id(name: str) -> str | None:
    """Return translation id for ``name`` or None when absent."""
    for item in list_translations():
        if item.get("name") == name:
            return item["id"]
    return None


def scheme_id(name: str) -> str | None:
    """Return versification scheme id for ``name`` or None when absent."""
    status, body = _request("GET", "/api/versifications?limit=500")
    require_ok(status, body, "list versifications")
    for item in body.get("items", []):
        if item.get("name") == name:
            return item["id"]
    return None


def canonical_org_scheme_id() -> str:
    """Return bootstrap org scheme id."""
    status, body = _request("GET", "/api/versifications?canonical=true")
    require_ok(status, body, "list canonical versifications")
    for item in body.get("items", []):
        if item.get("name", "").lower() == "org":
            return item["id"]
    die("bootstrap org scheme not found — start server on a migrated DB")


def list_associations(translation_id: str) -> list[dict[str, Any]]:
    """Return association rows for ``translation_id``."""
    status, body = _request(
        "GET",
        f"/api/translations/{translation_id}/versifications",
    )
    require_ok(status, body, "list associations")
    return list(body)


def association_exists(translation_id: str, scheme_id: str) -> bool:
    """True when ``scheme_id`` is already associated with ``translation_id``."""
    return any(
        row.get("scheme_id") == scheme_id for row in list_associations(translation_id)
    )


def ensure_association(translation_id: str, scheme_id: str) -> None:
    """Associate scheme with translation when not already linked."""
    if association_exists(translation_id, scheme_id):
        print(f"  already associated translation={translation_id} scheme={scheme_id}")
        return
    status, body = _request(
        "POST",
        f"/api/translations/{translation_id}/versifications",
        json_body={"scheme_id": scheme_id},
    )
    require_ok(status, body, "associate")
    print(f"  associated translation={translation_id} scheme={scheme_id}")


def set_preferred(translation_id: str, scheme_id: str) -> None:
    """Mark ``scheme_id`` as preferred on ``translation_id``."""
    status, body = _request(
        "PUT",
        f"/api/translations/{translation_id}/versifications/{scheme_id}/preferred",
    )
    require_ok(status, body, "set preferred")
    print(f"  preferred translation={translation_id} scheme={scheme_id}")


def delete_association(translation_id: str, scheme_id: str) -> None:
    """Remove a non-preferred association."""
    status, body = _request(
        "DELETE",
        f"/api/translations/{translation_id}/versifications/{scheme_id}",
    )
    require_ok(status, body, "delete association")
    print(f"  removed association translation={translation_id} scheme={scheme_id}")


def remove_scheme_associations(scheme_id: str, preferred_fallback: str | None = None) -> None:
    """Drop every association to ``scheme_id``, switching preferred when needed."""
    for item in list_translations():
        tid = item["id"]
        if not association_exists(tid, scheme_id):
            continue
        assocs = list_associations(tid)
        is_preferred = any(
            row.get("scheme_id") == scheme_id and row.get("preferred") for row in assocs
        )
        if is_preferred:
            fallback = preferred_fallback
            if fallback is None or fallback == scheme_id:
                for row in assocs:
                    candidate = row.get("scheme_id")
                    if candidate and candidate != scheme_id:
                        fallback = candidate
                        break
            if not fallback or fallback == scheme_id:
                die(
                    f"cannot remove preferred scheme {scheme_id} on translation {tid}; "
                    "delete the translation or pass a different --replace target"
                )
            set_preferred(tid, fallback)
        delete_association(tid, scheme_id)


def delete_translation_by_name(name: str) -> None:
    """Delete translation ``name`` when present."""
    tid = translation_id(name)
    if not tid:
        print(f"  translation {name} not present — skip delete")
        return
    status, body = _request("DELETE", f"/api/translations/{tid}")
    require_ok(status, body, f"delete translation {name}")
    print(f"  deleted translation {name} ({tid})")


def delete_scheme_by_name(name: str, preferred_fallback: str | None = None) -> None:
    """Delete custom scheme ``name`` after clearing associations."""
    sid = scheme_id(name)
    if not sid:
        print(f"  scheme {name} not present — skip delete")
        return
    remove_scheme_associations(sid, preferred_fallback=preferred_fallback)
    status, body = _request("DELETE", f"/api/versifications/{sid}")
    require_ok(status, body, f"delete scheme {name}")
    print(f"  deleted scheme {name} ({sid})")


def spanish_zip_bytes() -> bytes:
    """Return Spanish project zip from committed assets or in-memory builder."""
    path = ASSETS / "spanish-org.zip"
    if path.is_file():
        return path.read_bytes()
    return build_spanish_org_zip()


def american_zip_bytes() -> bytes:
    """Return American project zip from committed assets or in-memory builder."""
    path = ASSETS / "american-standard-multihop.zip"
    if path.is_file():
        return path.read_bytes()
    return build_demo_project_zip("en")


def ensure_translation_shell(name: str, language: str) -> str:
    """Create metadata-only translation ``name`` when missing."""
    existing = translation_id(name)
    if existing:
        print(f"  reusing translation {name} ({existing})")
        return existing
    status, body = _request(
        "POST",
        "/api/translations",
        json_body={"name": name, "language": language, "source_format": "usx"},
    )
    require_ok(status, body, f"create translation {name}")
    print(f"  created translation {name} ({body['id']})")
    return body["id"]


def ingest_project(name: str, language: str, zip_bytes: bytes) -> str:
    """Ingest project zip bytes; return translation id."""
    existing = translation_id(name)
    if existing:
        print(f"  reusing translation {name} ({existing})")
        return existing
    status, body = _request(
        "POST",
        "/api/ingest/project",
        data={"name": name, "language": language},
        files={"file": (f"{name}.zip", zip_bytes, "application/zip")},
    )
    require_ok(status, body, f"ingest {name}")
    tid = body["translation"]["id"]
    print(f"  ingested {name} ({tid})")
    return tid


def upload_scheme(name: str, ingredient: dict[str, Any]) -> str:
    """Upload Copenhagen ingredient JSON; return scheme id."""
    existing = scheme_id(name)
    if existing:
        print(f"  reusing scheme {name} ({existing})")
        return existing
    payload = json.dumps(ingredient, indent=2).encode("utf-8")
    status, body = _request(
        "POST",
        "/api/versifications/upload",
        data={"name": name},
        files={"file": (f"{name}.json", payload, "application/json")},
    )
    require_ok(status, body, f"upload scheme {name}")
    print(f"  uploaded scheme {name} ({body['id']})")
    return body["id"]


def normalize_replace_targets(raw: list[str]) -> set[str]:
    """Expand CLI ``--replace`` tokens into internal target keys."""
    targets: set[str] = set()
    for token in raw:
        key = REPLACE_ALIASES.get(token, token)
        targets.add(key)
    if "all" in targets:
        return {"all_translations", "all_schemes"}
    if "all_translations" in targets:
        targets.update({"engdemo", "spanish", "american"})
    if "all_schemes" in targets:
        targets.update({"engdemo", "spanish_org_ref", "spanish_eng"})
    return targets


def apply_replace_targets(targets: set[str]) -> None:
    """Delete selected translations/schemes so the seed pass recreates them."""
    if not targets:
        return
    print("Replace targets:", ", ".join(sorted(targets)))
    print()

    # Schemes first (dependency order): spanish-eng → spanish-org-ref → engdemo.
    if "spanish_eng" in targets:
        ref_id = scheme_id(SCHEME_NAMES["spanish_org_ref"])
        delete_scheme_by_name(SCHEME_NAMES["spanish_eng"], preferred_fallback=ref_id)
    if "spanish_org_ref" in targets:
        delete_scheme_by_name(SCHEME_NAMES["spanish_org_ref"])
    if "engdemo" in targets:
        delete_scheme_by_name(SCHEME_NAMES["engdemo"])

    if "spanish" in targets:
        delete_translation_by_name(TRANSLATION_NAMES["spanish"])
    if "american" in targets:
        delete_translation_by_name(TRANSLATION_NAMES["american"])
    if "engdemo" in targets:
        delete_translation_by_name(TRANSLATION_NAMES["engdemo"])

    print()


def parse_args() -> argparse.Namespace:
    """Parse CLI flags."""
    parser = argparse.ArgumentParser(
        description="Seed multi-hop chain fixtures on a running FRVT server.",
    )
    parser.add_argument(
        "--replace",
        nargs="+",
        metavar="TARGET",
        help=(
            "Delete and recreate targets before seeding. "
            "Translations: engdemo, spanish, spanish-org, american, "
            "american-standard-multihop, all-translations. "
            "Schemes: engdemo, spanish-org-ref, spanish-eng, all-schemes. "
            "Use all for every translation and custom scheme."
        ),
    )
    return parser.parse_args()


def main() -> None:
    """Seed multihop test bed on the live server."""
    args = parse_args()
    logger.debug("Seeding multihop chain at %s", BASE_URL)
    status, body = _request("GET", "/api/health")
    if status != 200:
        die(f"server not reachable at {BASE_URL} (HTTP {status})")

    print(f"Seeding multi-hop chain test bed at {BASE_URL}")
    print()

    replace_targets = normalize_replace_targets(args.replace or [])
    apply_replace_targets(replace_targets)

    org_ref = spanish_org_ref_ingredient()
    engdemo = engdemo_ingredient()
    spanish_eng = infer_spanish_eng_ingredient(org_ref, engdemo)

    print("Step 1 — engdemo translation shell (hop-2 basedOn target)")
    engdemo_tid = ensure_translation_shell(TRANSLATION_NAMES["engdemo"], "en")
    print()

    print("Step 2 — engdemo scheme (basedOn org), associate + preferred")
    engdemo_scheme_id = upload_scheme(SCHEME_NAMES["engdemo"], engdemo)
    ensure_association(engdemo_tid, engdemo_scheme_id)
    set_preferred(engdemo_tid, engdemo_scheme_id)
    print()

    print("Step 3 — spanish-org project ingest")
    spanish_tid = ingest_project(
        TRANSLATION_NAMES["spanish"],
        "es",
        spanish_zip_bytes(),
    )
    print()

    print("Step 4 — american-standard-multihop project ingest")
    american_tid = ingest_project(
        TRANSLATION_NAMES["american"],
        "en",
        american_zip_bytes(),
    )
    print()

    print("Step 5 — spanish-org-ref scheme, associate with Spanish")
    spanish_org_ref_id = upload_scheme(SCHEME_NAMES["spanish_org_ref"], org_ref)
    ensure_association(spanish_tid, spanish_org_ref_id)
    print()

    print("Step 6 — spanish-eng scheme (basedOn engdemo), associate + preferred")
    spanish_eng_id = upload_scheme(SCHEME_NAMES["spanish_eng"], spanish_eng)
    ensure_association(spanish_tid, spanish_eng_id)
    set_preferred(spanish_tid, spanish_eng_id)
    print()

    print("Step 7 — associate bootstrap org with American column")
    org_id = canonical_org_scheme_id()
    ensure_association(american_tid, org_id)
    print()

    print("Id map (for URL params and debugging):")
    print(f"  spanish_translation_id     {spanish_tid}")
    print(f"  american_translation_id    {american_tid}")
    print(f"  engdemo_translation_id     {engdemo_tid}")
    print(f"  engdemo_scheme_id          {engdemo_scheme_id}")
    print(f"  spanish_org_ref_scheme_id  {spanish_org_ref_id}")
    print(f"  spanish_eng_scheme_id      {spanish_eng_id}")
    print(f"  org_scheme_id              {org_id}")
    print()
    print("Viewer: left=spanish-org, right=american-standard-multihop,")
    print("  lvers=spanish-org-ref (config A) or spanish-eng (config B),")
    print("  rvers=org (bootstrap org scheme on American translation).")
    print()
    print("After zip or ingredient changes:")
    print("  frvt/.venv/bin/python .test/scripts/write-multihop-assets.py")
    print("  frvt/.venv/bin/python .test/scripts/seed-multihop-chain.py --replace spanish")
    print("  frvt/.venv/bin/python .test/scripts/seed-multihop-chain.py --replace spanish-org-ref spanish-eng")


if __name__ == "__main__":
    main()
