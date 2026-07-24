"""Application bootstrap: logging, auth, routers, seeding, and static UI mount."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI

from frvt.api.auth import BasicAuthMiddleware
from frvt.api.bootstrap import seed_canonical
from frvt.api.config import get_settings
from frvt.api.db import get_session_factory
from frvt.api.errors import register_exception_handlers
from frvt.api.logging_config import configure_logging, get_logger
from frvt.api.routers import (
    associations,
    health,
    ingest,
    navigation,
    resolve,
    spans,
    translations,
    versifications,
)
from frvt.api.static import SpaStaticFiles

logger = get_logger(__name__)

# Directory that will hold the built React UI once the frontend is present.
_WEB_DIST = Path(__file__).resolve().parents[1] / "web" / "dist"


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Run idempotent canonical seeding once at process startup."""
    logger.debug("Application startup: seeding canonical anchors")
    factory = get_session_factory()
    session = factory()
    try:
        seed_canonical(session)
        session.commit()
    except Exception:
        logger.error("Canonical seed failed", exc_info=True)
        session.rollback()
        raise
    finally:
        session.close()
    yield
    logger.debug("Application shutdown")


def create_app(*, run_startup_seed: bool = True) -> FastAPI:
    """Build and return the configured FastAPI application instance.

    ``run_startup_seed`` can be disabled in tests that manage seeding explicitly.
    """
    settings = get_settings()
    configure_logging(settings.log_level)
    logger.debug("Creating FastAPI application")

    app = FastAPI(
        title="FRVT Versification Viewer",
        version="0.1.0",
        lifespan=lifespan if run_startup_seed else None,
    )
    register_exception_handlers(app)
    app.add_middleware(BasicAuthMiddleware, settings=settings)
    app.include_router(health.router)
    app.include_router(translations.router)
    app.include_router(spans.router)
    app.include_router(versifications.router)
    app.include_router(associations.router)
    app.include_router(ingest.router)
    app.include_router(resolve.router)
    app.include_router(navigation.router)

    if _WEB_DIST.is_dir():
        # Mount after API routes so ``/api/...`` is never shadowed by static files.
        app.mount("/", SpaStaticFiles(directory=str(_WEB_DIST), html=True), name="ui")
    else:
        logger.debug("UI dist directory missing at %s; static mount skipped", _WEB_DIST)

    return app


# ASGI entry point used by Uvicorn (``frvt.api.main:app``).
app = create_app()
