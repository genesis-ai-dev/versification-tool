"""HTTP Basic authentication middleware for the POC access gate."""

from __future__ import annotations

import base64
import secrets
from functools import lru_cache

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from frvt.api.config import Settings, get_settings
from frvt.api.logging_config import get_logger

logger = get_logger(__name__)


@lru_cache
def _cached_credentials(username: str, password: str) -> tuple[str, str]:
    """Cache the configured Basic-auth pair for constant-time comparison."""
    return username, password


class BasicAuthMiddleware(BaseHTTPMiddleware):
    """Reject requests that lack valid HTTP Basic credentials."""

    def __init__(self, app: object, settings: Settings | None = None) -> None:
        """Wire the middleware to ``settings`` (or the process-wide defaults)."""
        super().__init__(app)  # type: ignore[arg-type]
        self._settings = settings or get_settings()

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        """Validate the Authorization header before forwarding the request."""
        logger.debug("Authenticating %s %s", request.method, request.url.path)
        expected_user, expected_pass = _cached_credentials(
            self._settings.basic_auth_username,
            self._settings.basic_auth_password,
        )
        header = request.headers.get("Authorization")
        if not header or not header.startswith("Basic "):
            return self._unauthorized()
        try:
            decoded = base64.b64decode(header[6:].encode("ascii")).decode("utf-8")
            username, _, password = decoded.partition(":")
        except (ValueError, UnicodeDecodeError):
            logger.error("Failed to decode Basic auth header", exc_info=True)
            return self._unauthorized()
        user_ok = secrets.compare_digest(username, expected_user)
        pass_ok = secrets.compare_digest(password, expected_pass)
        if not (user_ok and pass_ok):
            return self._unauthorized()
        return await call_next(request)

    def _unauthorized(self) -> JSONResponse:
        """Build the shared 401 challenge response used for every auth failure."""
        return JSONResponse(
            status_code=401,
            content={
                "detail": "Missing or invalid credentials.",
                "code": "unauthorized",
            },
            headers={"WWW-Authenticate": 'Basic realm="FRVT"'},
        )
