"""Static-file serving with an HTML fallback for client-side routes."""

from __future__ import annotations

from starlette.exceptions import HTTPException
from starlette.responses import Response
from starlette.staticfiles import StaticFiles
from starlette.types import Receive, Scope, Send


class SpaStaticFiles(StaticFiles):
    """Serve ``index.html`` for extensionless paths handled by the React router."""

    async def get_response(self, path: str, scope: Scope) -> Response:
        """Return a static asset, falling back only for extensionless 404 paths."""
        try:
            response = await super().get_response(path, scope)
        except HTTPException as exc:
            if exc.status_code != 404 or "." in path.rsplit("/", 1)[-1]:
                raise
            return self._with_spa_cache_policy(
                await super().get_response("index.html", scope)
            )
        if response.status_code == 404 and "." not in path.rsplit("/", 1)[-1]:
            return self._with_spa_cache_policy(
                await super().get_response("index.html", scope)
            )
        if response.media_type == "text/html":
            return self._with_spa_cache_policy(response)
        return response

    @staticmethod
    def _with_spa_cache_policy(response: Response) -> Response:
        """Prevent browsers from pinning an old ``index.html`` after ``npm run build``."""
        response.headers["Cache-Control"] = "no-cache"
        return response

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        """Delegate ASGI requests through Starlette's static-file implementation."""
        await super().__call__(scope, receive, send)
