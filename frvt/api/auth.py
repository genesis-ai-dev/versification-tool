"""HTTP Basic authentication middleware for the POC access gate."""

from __future__ import annotations

import base64
import secrets
from collections.abc import Callable, Sequence
from functools import lru_cache

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from frvt.api.config import (
    DEFAULT_BASIC_AUTH_PASSWORD,
    DEFAULT_BASIC_AUTH_USERNAME,
    Settings,
    get_settings,
)
from frvt.api.failed_auth_limiter import FailedAuthLimiter, client_ip_for_request
from frvt.api.logging_config import get_logger

logger = get_logger(__name__)

# Shared WWW-Authenticate challenge for 401 and 429 responses.
_WWW_AUTHENTICATE = 'Basic realm="FRVT"'


@lru_cache
def _cached_credentials(username: str, password: str) -> tuple[bytes, bytes]:
    """Cache the configured Basic-auth pair as UTF-8 bytes for constant-time compare.

    ``secrets.compare_digest`` rejects ``str`` holding non-ASCII characters, so
    credentials are compared as bytes and any password charset stays usable.
    """
    return username.encode("utf-8"), password.encode("utf-8")


def path_matches_public_prefix(path: str, prefixes: Sequence[str]) -> bool:
    """Return whether ``path`` is opted out of Basic auth and the limiter.

    A prefix of ``/`` matches every path. Otherwise the path must equal the
    prefix or start with ``prefix + "/"`` so ``/doc`` does not match ``/docs``.
    """
    logger.trace("Matching path %s against %s public prefixes", path, len(prefixes))  # type: ignore[attr-defined]
    return any(
        prefix == "/" or path == prefix or path.startswith(prefix + "/")
        for prefix in prefixes
    )


def warn_if_default_basic_credentials(settings: Settings) -> None:
    """Log WARNING when username and password still match baked-in local defaults.

    Does not log the password, does not raise, and does not prevent the process
    from serving requests. Call from ``create_app`` after logging is configured.
    """
    logger.debug(
        "Checking Basic credentials against local defaults user=%s",
        settings.basic_auth_username,
    )
    if (
        settings.basic_auth_username == DEFAULT_BASIC_AUTH_USERNAME
        and settings.basic_auth_password == DEFAULT_BASIC_AUTH_PASSWORD
    ):
        logger.warning(
            "HTTP Basic credentials match the built-in local defaults; "
            "set BASIC_AUTH_USERNAME and BASIC_AUTH_PASSWORD before exposing this "
            "process"
        )


class BasicAuthMiddleware(BaseHTTPMiddleware):
    """Reject requests that lack valid HTTP Basic credentials."""

    def __init__(
        self,
        app: object,
        settings: Settings | None = None,
        clock: Callable[[], float] | None = None,
    ) -> None:
        """Wire the middleware to ``settings`` (or process defaults) and a limiter."""
        super().__init__(app)  # type: ignore[arg-type]
        # Process settings used for credentials and limiter knobs.
        self._settings = settings or get_settings()
        # Opt-out prefixes resolved once; they cannot change without a new app.
        self._public_prefixes = self._settings.basic_auth_public_paths
        logger.debug(
            "Installing Basic auth middleware public_prefixes=%s failure_limit=%s",
            self._public_prefixes,
            self._settings.basic_auth_failure_limit,
        )
        # Per-instance sliding-window store; do not share across app instances.
        self._limiter = FailedAuthLimiter(
            limit=self._settings.basic_auth_failure_limit,
            window_seconds=self._settings.basic_auth_failure_window_seconds,
            clock=clock,
        )

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        """Validate the Authorization header before forwarding the request."""
        logger.debug("Authenticating %s %s", request.method, request.url.path)
        if path_matches_public_prefix(request.url.path, self._public_prefixes):
            logger.debug("Skipping Basic gate for opted-out path %s", request.url.path)
            return await call_next(request)
        if self._credentials_match(request):
            return await call_next(request)
        retry_after = self._limiter.register_failure(
            client_ip_for_request(
                request, trust_proxy_headers=self._settings.trust_proxy_headers
            )
        )
        if retry_after is not None:
            return self._too_many_requests(retry_after)
        return self._unauthorized()

    def _credentials_match(self, request: Request) -> bool:
        """Return whether the request carries valid Basic credentials.

        Missing or non-Basic headers return False. Undecodable values log at ERROR
        and return False. Comparison is byte-wise, so non-ASCII credentials fail
        closed with 401 instead of raising.
        """
        expected_user, expected_pass = _cached_credentials(
            self._settings.basic_auth_username,
            self._settings.basic_auth_password,
        )
        header = request.headers.get("Authorization")
        if not header or not header.startswith("Basic "):
            return False
        try:
            decoded = base64.b64decode(header[6:].encode("ascii")).decode("utf-8")
            username, _, password = decoded.partition(":")
        except (ValueError, UnicodeDecodeError):
            logger.error("Failed to decode Basic auth header", exc_info=True)
            return False
        user_ok = secrets.compare_digest(username.encode("utf-8"), expected_user)
        pass_ok = secrets.compare_digest(password.encode("utf-8"), expected_pass)
        return user_ok and pass_ok

    def _unauthorized(self) -> JSONResponse:
        """Build the shared 401 challenge response used for every auth failure."""
        return JSONResponse(
            status_code=401,
            content={
                "detail": "Missing or invalid credentials.",
                "code": "unauthorized",
            },
            headers={"WWW-Authenticate": _WWW_AUTHENTICATE},
        )

    def _too_many_requests(self, retry_after: int) -> JSONResponse:
        """Build the 429 envelope returned after the failure cap is exceeded.

        ``retry_after`` is delay-seconds for the ``Retry-After`` header (minimum 1).
        """
        return JSONResponse(
            status_code=429,
            content={
                "detail": "Too many failed authentication attempts.",
                "code": "too_many_requests",
            },
            headers={
                "WWW-Authenticate": _WWW_AUTHENTICATE,
                "Retry-After": str(retry_after),
            },
        )
