import { ApiError } from "./errors";

/** Optional fetch controls shared by all client helpers. */
export interface RequestOptions {
  /** Abort in-flight work when the driving ref or route changes. */
  signal?: AbortSignal;
}

/**
 * Perform a same-origin GET and return parsed JSON.
 * Throws ``ApiError`` for non-2xx responses.
 */
export async function apiGet<T>(
  path: string,
  query?: Record<string, string | number | boolean | null | undefined>,
  options?: RequestOptions,
): Promise<T> {
  const url = buildUrl(path, query);
  const response = await fetch(url, {
    method: "GET",
    credentials: "same-origin",
    signal: options?.signal,
  });
  return parseJson<T>(response);
}

/**
 * Perform a same-origin JSON write (POST/PATCH/PUT/DELETE).
 * Returns ``undefined`` for empty 204 bodies; otherwise parsed JSON.
 */
export async function apiSend<T>(
  path: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  body?: unknown,
  options?: RequestOptions,
): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: options?.signal,
  });
  if (response.status === 204) {
    return undefined as T;
  }
  return parseJson<T>(response);
}

/**
 * Upload multipart form data (project zip or versification file).
 * Use for ingest endpoints that expect ``FormData``.
 */
export async function apiUpload<T>(
  path: string,
  formData: FormData,
  options?: RequestOptions,
): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    body: formData,
    signal: options?.signal,
  });
  return parseJson<T>(response);
}

/** Build a path with optional query params, omitting null/undefined/empty. */
function buildUrl(
  path: string,
  query?: Record<string, string | number | boolean | null | undefined>,
): string {
  if (!query) {
    return path;
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined || value === "") {
      continue;
    }
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

/** Parse JSON on success or raise ``ApiError`` from the envelope. */
async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw await ApiError.fromResponse(response);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}
