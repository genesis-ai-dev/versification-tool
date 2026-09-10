"""In-process sliding-window store for failed HTTP Basic attempts."""

from __future__ import annotations

import math
import threading
import time
from collections.abc import Callable

from starlette.requests import Request

from frvt.api.logging_config import get_logger

logger = get_logger(__name__)

# Limiter key when ASGI does not provide ``request.client``.
UNKNOWN_CLIENT_IP = "unknown"
# Maximum distinct client-IP keys retained in one process.
MAX_TRACKED_CLIENT_IPS = 10_000


def client_ip_for_request(request: Request, *, trust_proxy_headers: bool) -> str:
    """Return the limiter key for ``request`` (rightmost XFF hop when trusted).

    When ``trust_proxy_headers`` is false, ``X-Forwarded-For`` is ignored. Missing
    client metadata falls back to ``unknown`` so the limiter always has a key.
    """
    logger.trace(  # type: ignore[attr-defined]
        "Resolving client IP trust_proxy_headers=%s", trust_proxy_headers
    )
    resolved = UNKNOWN_CLIENT_IP
    if trust_proxy_headers:
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            hops = [hop.strip() for hop in forwarded.split(",") if hop.strip()]
            if hops:
                resolved = hops[-1]
                logger.trace("Client IP from X-Forwarded-For hop=%s", resolved)  # type: ignore[attr-defined]
                return resolved
    host = request.client.host if request.client is not None else None
    if host:
        resolved = host
    logger.trace("Client IP from request.client=%s", resolved)  # type: ignore[attr-defined]
    return resolved


class FailedAuthLimiter:
    """Count recent auth failures per client IP and report when to return 429."""

    def __init__(
        self,
        *,
        limit: int,
        window_seconds: int,
        clock: Callable[[], float] | None = None,
        max_keys: int = MAX_TRACKED_CLIENT_IPS,
    ) -> None:
        """Bind limit, window, clock, and an empty per-instance timestamp store."""
        logger.debug(
            "Creating failed-auth limiter limit=%s window_seconds=%s",
            limit,
            window_seconds,
        )
        # How many in-window failures still return 401; 429 starts after this count.
        self._limit = limit
        # Sliding-window length in seconds; ``<= 0`` disables storage and 429s.
        self._window_seconds = window_seconds
        # Monotonic clock used for timestamps (injectable in tests).
        self._clock = clock or time.monotonic
        # Maximum distinct IP keys retained before eviction.
        self._max_keys = max_keys
        # Serializes read/increment/prune/evict across worker threads.
        self._lock = threading.Lock()
        # Client IP → monotonic failure timestamps still considered in-window.
        self._failures: dict[str, list[float]] = {}

    def enabled(self) -> bool:
        """Return whether 429 tracking is active (positive limit and window).

        Callers should skip ``register_failure`` storage when this is false; failed
        requests still return 401 from the middleware.
        """
        logger.trace(  # type: ignore[attr-defined]
            "Limiter enabled check limit=%s window=%s",
            self._limit,
            self._window_seconds,
        )
        return self._limit > 0 and self._window_seconds > 0

    def register_failure(self, client_ip: str) -> int | None:
        """Record a failure for ``client_ip`` and return Retry-After seconds if 429.

        Returns ``None`` when the limiter is disabled or the in-window count is still
        at or below the configured limit. Never stores timestamps when disabled.
        """
        logger.debug("Registering auth failure for ip=%s", client_ip)
        if not self.enabled():
            return None
        now = self._clock()
        with self._lock:
            timestamps = self._in_window(self._failures.get(client_ip, ()), now)
            timestamps.append(now)
            self._failures[client_ip] = timestamps
            self._evict_if_needed(now)
            count = len(timestamps)
            if count <= self._limit:
                return None
            oldest = timestamps[0]
            remaining = oldest + self._window_seconds - now
            retry_after = max(1, math.ceil(remaining))
            logger.debug(
                "Failed-auth limiter tripped for ip=%s count=%s", client_ip, count
            )
            return retry_after

    def _in_window(
        self, timestamps: list[float] | tuple[float, ...], now: float
    ) -> list[float]:
        """Return a new list of ``timestamps`` still inside the sliding window.

        A sample stays if ``now - stamp < window``. Does not mutate ``timestamps``.
        """
        window = self._window_seconds
        return [stamp for stamp in timestamps if now - stamp < window]

    def _evict_if_needed(self, now: float) -> None:
        """Drop expired keys, then IPs with the oldest last failure until at the cap.

        Must run while holding ``_lock``. No-op when the store is at or under
        ``_max_keys``.
        """
        if len(self._failures) <= self._max_keys:
            return
        expired = [
            ip
            for ip, stamps in self._failures.items()
            if not self._in_window(stamps, now)
        ]
        for ip in expired:
            del self._failures[ip]
        while len(self._failures) > self._max_keys:
            victim = min(self._failures, key=lambda ip: self._failures[ip][-1])
            del self._failures[victim]
