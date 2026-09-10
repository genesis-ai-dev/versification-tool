import type { ErrorCode, FieldError } from "./types";

/**
 * Typed failure from a non-2xx API response.
 * Use ``fromResponse`` to parse the server error envelope into this shape.
 */
export class ApiError extends Error {
  /** HTTP status code from the response. */
  readonly status: number;
  /** Human-readable detail from the server envelope. */
  readonly detail: string;
  /** Machine-readable code from the envelope (or a status-derived fallback). */
  readonly code: ErrorCode;
  /** Optional per-field validation details for modal display. */
  readonly errors: FieldError[] | undefined;

  constructor(status: number, detail: string, code: ErrorCode, errors?: FieldError[]) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
    this.code = code;
    this.errors = errors;
  }

  /**
   * Parse a failed ``Response`` into ``ApiError``.
   * Falls back to status-derived codes when the body is missing or malformed.
   */
  static async fromResponse(response: Response): Promise<ApiError> {
    const fallback = statusToCode(response.status);
    let detail = response.statusText || "Request failed";
    let code: ErrorCode = fallback;
    let errors: FieldError[] | undefined;

    try {
      const body = (await response.json()) as {
        detail?: unknown;
        code?: unknown;
        errors?: FieldError[];
      };
      if (typeof body.detail === "string" && body.detail.length > 0) {
        detail = body.detail;
      }
      if (typeof body.code === "string" && isErrorCode(body.code)) {
        code = body.code;
      }
      if (Array.isArray(body.errors)) {
        errors = body.errors;
      }
    } catch {
      // Non-JSON bodies still become a usable ApiError via status fallbacks.
    }

    return new ApiError(response.status, detail, code, errors);
  }
}

/** Map common HTTP statuses onto the fixed error-code vocabulary. */
function statusToCode(status: number): ErrorCode {
  switch (status) {
    case 400:
      return "bad_request";
    case 401:
      return "unauthorized";
    case 404:
      return "not_found";
    case 409:
      return "conflict";
    case 413:
      return "payload_too_large";
    case 422:
      return "validation_failed";
    case 429:
      return "too_many_requests";
    case 503:
      return "database_unavailable";
    default:
      return status >= 500 ? "internal_error" : "bad_request";
  }
}

/** Type guard for known envelope error codes. */
function isErrorCode(value: string): value is ErrorCode {
  return (
    value === "bad_request" ||
    value === "unauthorized" ||
    value === "not_found" ||
    value === "conflict" ||
    value === "payload_too_large" ||
    value === "validation_failed" ||
    value === "too_many_requests" ||
    value === "internal_error" ||
    value === "database_unavailable"
  );
}

/**
 * Produce a short user-facing message for an ``ApiError``.
 * Prefer this over raw ``detail`` when showing banners/toasts.
 */
export function describeApiError(error: ApiError): string {
  switch (error.status) {
    case 400:
      return error.detail || "Invalid request";
    case 401:
      return "Authentication required — reload and sign in";
    case 404:
      return error.detail || "Not found";
    case 409:
      return error.detail || "Conflict";
    case 413:
      return error.detail || "Payload too large";
    case 422:
      return error.detail || "Validation failed";
    case 503:
      return "Database unavailable";
    default:
      return error.detail || "Unexpected error";
  }
}
