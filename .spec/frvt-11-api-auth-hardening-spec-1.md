# FRVT API Authentication Hardening

**Document:** `frvt-11-api-auth-hardening-spec-1`
**Status:** Authoritative for the HTTP Basic gate, failed-auth limiter, path opt-out, default-credential warning, and `too_many_requests` error code
**Audience:** Implementers and reviewers of the FastAPI process and the existing web client's error-code union
**Scope:** In-process HTTP Basic middleware already registered on the app. This document supersedes [frvt-3-http-api-spec-1.md](./frvt-3-http-api-spec-1.md) §3 and [frvt-3-server-and-api-spec-1.md](./frvt-3-server-and-api-spec-1.md) §5.3 / §5.4 **only where they conflict**. Do not edit those FRVT-3 files. AWS controls, Redis, cookies, OAuth, CORS, anonymous health, Playwright, and new UI chrome are out of scope.

---

## 1. Gate

HTTP Basic remains the only application identity check. `BasicAuthMiddleware` stays registered on the FastAPI app in `create_app` via `app.add_middleware(...)`. Starlette wraps the whole application, so every request (API routers, `/docs`, `/redoc`, `/openapi.json`, `/docs/oauth2-redirect`, and the static UI mount) hits the gate unless a path prefix is opted out. New routers inherit the gate without extra code. Do not add a second `Depends` Basic dependency on routers.

- Credentials come from `BASIC_AUTH_USERNAME` / `BASIC_AUTH_PASSWORD`.
- Comparison stays constant-time (`secrets.compare_digest`) and operates on **UTF-8 bytes**, because that function rejects `str` containing non-ASCII characters. Non-ASCII credentials must fail closed with `401` (and count as a limiter failure), and a configured non-ASCII password must still authenticate.
- The Basic realm stays `FRVT`.
- `401` envelope is unchanged:

```json
{
  "detail": "Missing or invalid credentials.",
  "code": "unauthorized"
}
```

with header `WWW-Authenticate: Basic realm="FRVT"`. Build this `JSONResponse` in the middleware (same pattern as today). Do not raise `HTTPException` for auth failures.

A request fails the gate when any of the following is true: missing `Authorization`, scheme other than `Basic `, undecodable Base64/UTF-8 value, or well-formed Basic with a username/password that does not match. All of those count as limiter failures.

There is no anonymous health check, no cookie/session auth, and no CORS middleware.

---

## 2. Check order

1. If the request path matches an opt-out prefix, skip Basic **and** the limiter and forward the request.
2. Validate credentials.
3. If credentials are valid, forward the request. Do **not** increment the limiter. Do **not** clear the failure window. Valid credentials always proceed even when that client IP is already over the failure cap.
4. If credentials are invalid and the limiter is enabled, increment that IP's failure window, then return `401` for counts 1 through the configured limit and `429` once the count exceeds the limit.
5. If credentials are invalid and the limiter is disabled, return `401` and do not store timestamps.

---

## 3. Path opt-out

Setting `BASIC_AUTH_PUBLIC_PATHS` is a comma-separated list of path prefixes. Default is empty (nothing is public).

Parse rules:

- Split on commas.
- Strip surrounding whitespace from each token.
- Ignore empty tokens.
- Strip trailing `/` from each prefix **except** when the prefix is exactly `/`.

A request path matches a prefix when any of the following is true:

- the prefix is `/` (intentional full opt-out of **every** path, including the limiter), or
- the path equals the prefix, or
- the path starts with `prefix + "/"`.

`/doc` does not match prefix `/docs`. Matching is case-sensitive and uses `request.url.path` (no query string).

Matched paths skip Basic and the limiter. Keep the production default empty. Prefix `/` is allowed; it is not a parse error.

---

## 4. Failed-auth limiter

| Setting | Default | Meaning |
| --- | --- | --- |
| `BASIC_AUTH_FAILURE_LIMIT` | `10` | How many in-window failures return `401` before the next failure is `429` |
| `BASIC_AUTH_FAILURE_WINDOW_SECONDS` | `60` | Sliding window length in seconds |

If **either** value is `<= 0`, the limiter is **disabled**: never return `429`, and do not store failure timestamps. Failed requests still return `401`.

When enabled:

- Key by client IP (Section 5).
- Store monotonic failure timestamps **on the middleware instance** (one store per `create_app()` call). Do not use a module-level dict.
- Drop timestamps older than the window (`now - timestamp < window` keeps a sample). This is a sliding window.
- Cap stored IP keys at **10_000**. When over the cap, evict the IP whose **most recent** failure is oldest. Prune expired timestamps for a key before using it.
- Guard read / increment / prune / evict with `threading.Lock`. Do not use `asyncio.Lock` (`BaseHTTPMiddleware.dispatch` may run in a thread pool).
- After increment, if the in-window count is `<= BASIC_AUTH_FAILURE_LIMIT`, return `401` as today. If the count is greater, return `429`.
- Successful auth does not increment and does not reset the window.

`429` body:

```json
{
  "detail": "Too many failed authentication attempts.",
  "code": "too_many_requests"
}
```

Headers:

- `WWW-Authenticate: Basic realm="FRVT"`
- `Retry-After`: remaining whole **delay-seconds** until the oldest timestamp in that IP's window expires, minimum `1`. Not an HTTP-date.

Build `429` as a middleware `JSONResponse`. Also add `too_many_requests` to the shared `ErrorCode` vocabulary and `STATUS_TO_CODE[429]` so any future handler that uses `code_for_status(429)` does not fall through to `bad_request`.

Limiter trips log at `DEBUG` with the client IP only. Never log passwords or `Authorization` values.

### 4.1 Test clock

`create_app` accepts an optional `clock: Callable[[], float]` (default `time.monotonic`) and forwards it to the limiter. It is a test seam, not a settings or environment field. Production `app = create_app()` uses monotonic time.

---

## 5. Client IP

`TRUST_PROXY_HEADERS` defaults to `false`.

- When **false**, ignore `X-Forwarded-For` even if present. Use `request.client.host`.
- When **true**, split `X-Forwarded-For` on commas, strip whitespace, skip empty tokens, and take the **rightmost** remaining hop (an ALB appends the connecting client on the right). If the header is missing or has no hops, use `request.client.host`.
- If `request.client` is `None`, use the key `unknown`.

Enable `TRUST_PROXY_HEADERS` only behind a trusted proxy. Direct instance access with the setting on lets clients spoof `X-Forwarded-For`. Extra proxies in front of the ALB make the rightmost hop that proxy, not the browser.

---

## 6. Default-credential warning

Baked-in local defaults are the constants `admin` and `Admin123!`. `Settings` field defaults and the warning check **must share those constants** so they cannot drift.

In `create_app`, after `configure_logging`, if both the configured username and password equal those defaults, log a `WARNING` that credentials still match the built-in local defaults and that `BASIC_AUTH_USERNAME` / `BASIC_AUTH_PASSWORD` must be set before exposing the process. Do not log the password. Do not exit. Do not refuse to serve.

Do **not** emit this warning only from the lifespan/seed path. Tests call `create_app(run_startup_seed=False)` and would miss a lifespan-only log.

---

## 7. Error vocabulary

Add `too_many_requests` to the public error-code list:

| HTTP status | `code` |
| --- | --- |
| `401` | `unauthorized` (unchanged) |
| `429` | `too_many_requests` |

The web client's `ErrorCode` union, `isErrorCode`, and `statusToCode(429)` must accept `too_many_requests` so a 429 envelope does not parse as `bad_request`. `describeApiError` may keep using `error.detail` for 429. The existing auth-required UI banner stays **401-only**.

This section supersedes server §5.4 and HTTP API §3 / §4 for the new code and for limiter, opt-out, warning, and XFF behavior.

---

## 8. Configuration

| Variable | Default | Effect |
| --- | --- | --- |
| `BASIC_AUTH_USERNAME` | `admin` | Gate username |
| `BASIC_AUTH_PASSWORD` | `Admin123!` | Gate password |
| `BASIC_AUTH_PUBLIC_PATHS` | empty | Comma-separated prefixes that skip Basic and the limiter; `/` opens every path |
| `BASIC_AUTH_FAILURE_LIMIT` | `10` | `<= 0` disables the limiter |
| `BASIC_AUTH_FAILURE_WINDOW_SECONDS` | `60` | `<= 0` disables the limiter |
| `TRUST_PROXY_HEADERS` | `false` | When true, key the limiter on the rightmost `X-Forwarded-For` hop |

---

## 9. Out of scope

- Implementing AWS WAF, Shield, GuardDuty, CloudTrail, RDS, or ALB logs
- Redis or any shared limiter store
- Per-router authentication
- Changing the Basic realm
- Making `/api/health` public by default
- Playwright, new UI banners, or ViewerSession auth-banner changes
- Editing FRVT-3 specification files
