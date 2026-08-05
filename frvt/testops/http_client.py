"""HTTP Basic helpers and error-envelope assertions for API tests."""

from __future__ import annotations

import base64
from typing import Any

from frvt.api.config import get_settings
from frvt.api.logging_config import get_logger

logger = get_logger(__name__)


def basic_auth_header(
    username: str | None = None, password: str | None = None
) -> dict[str, str]:
    """Build an ``Authorization: Basic …`` header from settings or overrides."""
    settings = get_settings()
    user = username if username is not None else settings.basic_auth_username
    secret = password if password is not None else settings.basic_auth_password
    token = base64.b64encode(f"{user}:{secret}".encode()).decode()
    logger.trace("Built Basic auth header for user=%s", user)  # type: ignore[attr-defined]
    return {"Authorization": f"Basic {token}"}


def assert_error_envelope(payload: dict[str, Any], *, code: str | None = None) -> None:
    """Assert a response JSON body matches the server ``{detail, code}`` envelope.

    Raises ``AssertionError`` when required keys are missing or ``code`` mismatches.
    """
    logger.debug("Asserting error envelope keys detail/code")
    assert "detail" in payload, f"missing detail in {payload!r}"
    assert "code" in payload, f"missing code in {payload!r}"
    if code is not None:
        assert (
            payload["code"] == code
        ), f"expected code={code!r}, got {payload['code']!r}"
