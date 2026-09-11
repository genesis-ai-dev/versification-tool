#!/usr/bin/env python3
"""Write docs/openapi.json from the FastAPI application.

Adds HTTP Basic (middleware is invisible to FastAPI's generator), a local
server URL, ErrorBody schemas, and rewrites 422/401/429 (plus health 503 and
ingest 413) to that envelope so the file matches live responses. GET
/openapi.json on a running server is still FastAPI's unpatched output.
Run from the repository root:

    PYTHONPATH=. frvt/.venv/bin/python docs/export-openapi.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from frvt.api.main import create_app

# Repository root: docs/export-openapi.py → parents[1].
_REPO_ROOT = Path(__file__).resolve().parents[1]
_OUTPUT = _REPO_ROOT / "docs" / "openapi.json"
# Methods that carry a responses object in an OpenAPI Path Item.
_HTTP_METHODS = frozenset({"get", "put", "post", "delete", "options", "head", "patch", "trace"})
_HTTP_VALIDATION_REF = "#/components/schemas/HTTPValidationError"
_ERROR_BODY_REF = "#/components/schemas/ErrorBody"


def _json_error_response(description: str) -> dict:
    """Build an application/json response that uses the live ErrorBody envelope."""
    return {
        "description": description,
        "content": {
            "application/json": {
                "schema": {"$ref": _ERROR_BODY_REF},
            }
        },
    }


def _replace_http_validation_refs(node: object) -> None:
    """Rewrite FastAPI's HTTPValidationError $ref to ErrorBody, in place."""
    if isinstance(node, dict):
        if node.get("$ref") == _HTTP_VALIDATION_REF:
            node["$ref"] = _ERROR_BODY_REF
        for value in node.values():
            _replace_http_validation_refs(value)
    elif isinstance(node, list):
        for item in node:
            _replace_http_validation_refs(item)


def _patch_live_error_envelope(spec: dict) -> None:
    """Make checked-in operations describe the envelope the server actually returns.

    FastAPI still advertises HTTPValidationError on GET /openapi.json. The process
    rewrites those bodies to ErrorBody. This patch is only for docs/openapi.json.
    """
    _replace_http_validation_refs(spec)
    for path, item in spec.get("paths", {}).items():
        if not isinstance(item, dict):
            continue
        for method, operation in item.items():
            if method not in _HTTP_METHODS or not isinstance(operation, dict):
                continue
            responses = operation.setdefault("responses", {})
            if "422" in responses:
                responses["422"]["description"] = (
                    "Request validation failed. Body is ErrorBody "
                    "(code validation_failed), not HTTPValidationError."
                )
            responses.setdefault(
                "401",
                _json_error_response(
                    "Missing or invalid Basic credentials. "
                    "code: unauthorized. WWW-Authenticate: Basic realm=\"FRVT\"."
                ),
            )
            responses.setdefault(
                "429",
                _json_error_response(
                    "Too many failed authentications from this client IP. "
                    "code: too_many_requests."
                ),
            )
            if path == "/api/health":
                responses.setdefault(
                    "503",
                    _json_error_response(
                        "Database ping failed. code: database_unavailable."
                    ),
                )
            if path in {"/api/ingest/project", "/api/versifications/upload"}:
                responses.setdefault(
                    "413",
                    _json_error_response(
                        "Upload exceeds MAX_UPLOAD_BYTES. code: payload_too_large."
                    ),
                )
    schemas = spec.get("components", {}).get("schemas", {})
    schemas.pop("HTTPValidationError", None)
    schemas.pop("ValidationError", None)


def _spec_with_integrator_metadata() -> dict:
    """Return the generated OpenAPI document plus integrator-facing additions."""
    app = create_app(run_startup_seed=False)
    spec = app.openapi()
    spec["info"]["description"] = (
        "HTTP API for the FRVT versification viewer. Every path requires HTTP Basic. "
        "This checked-in document adds a Basic security scheme and rewrites error "
        "responses to ErrorBody ({detail, code, errors?}), which is what the running "
        "server returns. GET /openapi.json on a live process is FastAPI's unpatched "
        "generator output (HTTPValidationError on many 422s, no Basic scheme). "
        "Human guide: docs/api.md."
    )
    spec["servers"] = [
        {
            "url": "http://localhost:8000",
            "description": "Local uvicorn from the repository root (see README.md)",
        }
    ]
    spec["tags"] = [
        {"name": "health", "description": "Liveness plus a database ping."},
        {
            "name": "translations",
            "description": "Translation CRUD. Listings omit numbering-space anchors.",
        },
        {
            "name": "spans",
            "description": "Stored scripture spans for a translation, ordered by seq.",
        },
        {
            "name": "versifications",
            "description": "Numbering schemes (canonical and uploaded).",
        },
        {
            "name": "associations",
            "description": "Link a translation to schemes; one preferred scheme per translation.",
        },
        {
            "name": "ingest",
            "description": "Project zip ingest and standalone versification upload.",
        },
        {
            "name": "resolve",
            "description": "Map verses between two translations' selected schemes.",
        },
        {
            "name": "navigation",
            "description": "Book/chapter trees and jump-menu deltas/misalignments.",
        },
    ]
    components = spec.setdefault("components", {})
    components["securitySchemes"] = {
        "basicAuth": {
            "type": "http",
            "scheme": "basic",
            "description": (
                "HTTP Basic using BASIC_AUTH_USERNAME / BASIC_AUTH_PASSWORD. "
                "Local defaults admin / Admin123! must not be used on a shared host."
            ),
        }
    }
    schemas = components.setdefault("schemas", {})
    schemas["FieldError"] = {
        "type": "object",
        "required": ["field", "message"],
        "properties": {
            "field": {
                "type": "string",
                "description": "Field or file name, for example query.limit or custom.vrs.",
            },
            "message": {"type": "string"},
        },
    }
    schemas["ErrorBody"] = {
        "type": "object",
        "required": ["detail", "code"],
        "description": (
            "Envelope returned by the running server for application and framework "
            "errors. errors is omitted when there is no per-field detail."
        ),
        "properties": {
            "detail": {"type": "string"},
            "code": {
                "type": "string",
                "enum": [
                    "bad_request",
                    "unauthorized",
                    "not_found",
                    "conflict",
                    "payload_too_large",
                    "validation_failed",
                    "too_many_requests",
                    "internal_error",
                    "database_unavailable",
                ],
            },
            "errors": {
                "type": "array",
                "items": {"$ref": "#/components/schemas/FieldError"},
                "description": "Present only when there is per-field or per-file detail.",
            },
        },
    }
    spec["security"] = [{"basicAuth": []}]
    _patch_live_error_envelope(spec)
    return spec


def main() -> int:
    """Write OpenAPI JSON next to this script's sibling openapi.json path."""
    spec = _spec_with_integrator_metadata()
    _OUTPUT.write_text(
        json.dumps(spec, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"wrote {_OUTPUT} ({len(spec.get('paths', {}))} paths)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
