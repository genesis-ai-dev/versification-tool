"""Uniform API error envelope and FastAPI exception handlers."""

from __future__ import annotations

from typing import Any, Literal

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from starlette.exceptions import HTTPException as StarletteHTTPException

from frvt.api.logging_config import get_logger

logger = get_logger(__name__)

# Fixed vocabulary of machine-readable error codes returned to clients.
ErrorCode = Literal[
    "bad_request",
    "unauthorized",
    "not_found",
    "conflict",
    "payload_too_large",
    "validation_failed",
    "too_many_requests",
    "internal_error",
    "database_unavailable",
]


class FieldError(BaseModel):
    """Per-item validation detail attached to ingest/schema failures."""

    # Field or file name the issue refers to (for example ``custom.vrs``).
    field: str
    # Human-readable explanation of the problem with that field.
    message: str


class ErrorBody(BaseModel):
    """JSON envelope shared by all error responses."""

    # Human-readable summary suitable for display or logging.
    detail: str
    # Machine-readable code drawn from the fixed vocabulary.
    code: ErrorCode
    # Optional per-item details; omitted when there is nothing to list.
    errors: list[FieldError] | None = Field(default=None)


# Map HTTP status codes onto the fixed error-code vocabulary.
STATUS_TO_CODE: dict[int, ErrorCode] = {
    400: "bad_request",
    401: "unauthorized",
    404: "not_found",
    409: "conflict",
    413: "payload_too_large",
    422: "validation_failed",
    429: "too_many_requests",
    500: "internal_error",
    503: "database_unavailable",
}


def code_for_status(status_code: int) -> ErrorCode:
    """Map any HTTP status to the closest code in the fixed API vocabulary."""
    known = STATUS_TO_CODE.get(status_code)
    if known is not None:
        return known
    return "bad_request" if 400 <= status_code < 500 else "internal_error"


class AppError(Exception):
    """Application-raised error that maps directly onto the JSON envelope."""

    def __init__(
        self,
        status_code: int,
        detail: str,
        code: ErrorCode | None = None,
        errors: list[FieldError] | None = None,
    ) -> None:
        """Capture status, detail, code, and optional field errors for handlers."""
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail
        self.code: ErrorCode = code or code_for_status(status_code)
        self.errors = errors


def error_response(
    status_code: int,
    detail: str,
    code: ErrorCode | None = None,
    errors: list[dict[str, str]] | None = None,
) -> JSONResponse:
    """Build a JSONResponse that matches the shared error envelope."""
    body: dict[str, Any] = {
        "detail": detail,
        "code": code or code_for_status(status_code),
    }
    if errors:
        body["errors"] = errors
    return JSONResponse(status_code=status_code, content=body)


def register_exception_handlers(app: FastAPI) -> None:
    """Attach handlers that convert exceptions into the shared error envelope."""

    @app.exception_handler(AppError)
    async def handle_app_error(_request: Request, exc: AppError) -> JSONResponse:
        """Serialize an ``AppError`` into the uniform JSON envelope."""
        logger.debug("AppError status=%s code=%s", exc.status_code, exc.code)
        errors = (
            [{"field": e.field, "message": e.message} for e in exc.errors]
            if exc.errors
            else None
        )
        return error_response(exc.status_code, exc.detail, exc.code, errors)

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_exception(
        _request: Request, exc: StarletteHTTPException
    ) -> JSONResponse:
        """Normalize Starlette/FastAPI HTTPException into the envelope."""
        detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
        return error_response(exc.status_code, detail)

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        _request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        """Map Pydantic request-model failures to ``validation_failed``."""
        errors = [
            {
                "field": ".".join(str(part) for part in err.get("loc", ())),
                "message": err.get("msg", "Invalid value"),
            }
            for err in exc.errors()
        ]
        return error_response(
            422,
            "Request validation failed.",
            "validation_failed",
            errors,
        )

    @app.exception_handler(Exception)
    async def handle_unexpected(_request: Request, exc: Exception) -> JSONResponse:
        """Log unexpected failures and return a generic 500 envelope."""
        logger.error("Unhandled exception", exc_info=exc)
        return error_response(500, "Unexpected server error.", "internal_error")
