"""Application bootstrap: logging, auth, routers, seeding, and static UI mount."""

from __future__ import annotations

from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import UUID

from fastapi import FastAPI

from frvt.api.auth import BasicAuthMiddleware, warn_if_default_basic_credentials
from frvt.api.bootstrap import seed_canonical
from frvt.api.config import get_settings
from frvt.api.db import get_session_factory
from frvt.api.divergence.precompute import schedule_precompute
from frvt.api.divergence.runner import DivergenceRunner
from frvt.api.errors import register_exception_handlers
from frvt.api.indexing.worker import IndexWorker
from frvt.api.logging_config import configure_logging, get_logger
from frvt.api.routers import (
    associations,
    divergence,
    health,
    indexes,
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


def create_app(
    *,
    run_startup_seed: bool = True,
    run_index_worker: bool = True,
    clock: Callable[[], float] | None = None,
) -> FastAPI:
    """Build and return the configured FastAPI application instance.

    ``run_startup_seed`` can be disabled in tests that manage seeding explicitly.
    ``run_index_worker`` starts the in-process index builder after seeding; tests
    that roll back per-case transactions must disable it so the thread cannot
    observe uncommitted fixture rows.
    ``clock`` is a test-only monotonic time source forwarded to the failed-auth limiter.
    """
    settings = get_settings()
    configure_logging(settings.log_level)
    logger.debug("Creating FastAPI application")
    warn_if_default_basic_credentials(settings)

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        """Seed canonical anchors, then start the index worker if enabled."""
        if run_startup_seed:
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
        runner: DivergenceRunner = _app.state.divergence_runner
        runner.start()

        def _on_index_ready(index_id: UUID) -> None:
            """Schedule comparisons for a newly ready index. Never fails the build."""
            if not get_settings().divergence_precompute_enabled:
                return
            try:
                schedule_precompute(index_id, runner)
            except Exception:
                logger.error(
                    "Divergence precompute failed index=%s", index_id, exc_info=True
                )

        worker: IndexWorker | None = None
        if run_index_worker and settings.index_worker_enabled:
            worker = IndexWorker(on_index_ready=_on_index_ready)
            worker.start()
        yield
        runner.stop()
        if worker is not None:
            worker.stop()
        logger.debug("Application shutdown")

    use_lifespan = run_startup_seed or (
        run_index_worker and settings.index_worker_enabled
    )
    app = FastAPI(
        title="FRVT Versification Viewer",
        version="0.1.0",
        lifespan=lifespan if use_lifespan else None,
    )
    register_exception_handlers(app)
    app.add_middleware(BasicAuthMiddleware, settings=settings, clock=clock)
    app.include_router(health.router)
    app.include_router(translations.router)
    app.include_router(spans.router)
    app.include_router(versifications.router)
    app.include_router(associations.router)
    app.include_router(ingest.router)
    app.include_router(resolve.router)
    app.include_router(navigation.router)
    app.include_router(indexes.router)
    app.include_router(divergence.router)
    app.state.divergence_runner = DivergenceRunner(
        threads=settings.divergence_runner_threads
    )

    if _WEB_DIST.is_dir():
        # Mount after API routes so ``/api/...`` is never shadowed by static files.
        app.mount("/", SpaStaticFiles(directory=str(_WEB_DIST), html=True), name="ui")
    else:
        logger.debug("UI dist directory missing at %s; static mount skipped", _WEB_DIST)

    return app


# ASGI entry point used by Uvicorn (``frvt.api.main:app``).
app = create_app()
