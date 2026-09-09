# Auth hardening test plan

**Document:** `frvt-11-test-plan-auth-hardening-1`
**Product spec:** [frvt-11-api-auth-hardening-spec-1.md](./frvt-11-api-auth-hardening-spec-1.md) (wins if a case is ambiguous)
**Implementation:** [`frvt/tests/test_health_auth.py`](../frvt/tests/test_health_auth.py), [`frvt/tests/test_auth_hardening.py`](../frvt/tests/test_auth_hardening.py), [`frvt/web/src/api/errors.test.ts`](../frvt/web/src/api/errors.test.ts)

Shared helpers: `basic_auth_header` and `assert_error_envelope` from `frvt.testops.http_client`. Python tests use `create_app(run_startup_seed=False)` and `get_settings.cache_clear()`. Marker: `auth` only.

---

### TC-AUTH-010 — Unauthenticated requests are rejected on core routes

- **Level:** integration · **Priority:** Required
- **Preconditions:** Fresh app; no `Authorization` header.
- **Steps:** `GET` `/api/health`, `/api/translations`, `/docs`, and `/` without credentials.
- **Expected result:** Each response is `401` with `WWW-Authenticate: Basic realm="FRVT"`. API bodies use `code: unauthorized`.
- **Covered by:** `test_unauthenticated_rejected_on_every_route` in `test_health_auth.py`.

### TC-AUTH-011 — Wrong password is rejected

- **Level:** integration · **Priority:** Required
- **Preconditions:** Known valid username.
- **Steps:** `GET /api/translations` with the correct username and an incorrect password.
- **Expected result:** `401` with `code: unauthorized`; no translations payload.
- **Covered by:** `test_wrong_password_is_rejected` in `test_health_auth.py`.

### TC-AUTH-GATE-001 — Unauthenticated inventory of registered HTTP routes

- **Level:** integration · **Priority:** Required
- **Preconditions:** `TRUST_PROXY_HEADERS=true`. One unauthenticated request per distinct HTTP path on `app.routes` (skip WebSocket). Unique **rightmost** `X-Forwarded-For` hop per path.
- **Steps:** `GET` each path with no credentials.
- **Expected result:** Every non-opted-out path returns `401`. The limiter must not turn the inventory into `429`.

### TC-AUTH-LIMIT-001 — Eleventh failure from one IP is 429

- **Level:** integration · **Priority:** Required
- **Steps:** Eleven unauthenticated `GET /api/health` requests from the same client IP within the window.
- **Expected result:** First ten are `401` / `unauthorized`. Eleventh is `429` / `too_many_requests` with detail `Too many failed authentication attempts.`, `WWW-Authenticate: Basic realm="FRVT"`, and `Retry-After` a whole number of seconds `>= 1`.

### TC-AUTH-LIMIT-002 — Valid credentials are not limited

- **Level:** integration · **Priority:** Required
- **Steps:** Ten unauthenticated failures from one IP, then `GET /api/health` with valid Basic credentials from that same IP.
- **Expected result:** The authenticated request is `200`, not `429`.

### TC-AUTH-LIMIT-003 — Other IPs are not blocked

- **Level:** integration · **Priority:** Required
- **Preconditions:** `TRUST_PROXY_HEADERS=true`.
- **Steps:** Drive one IP to `429`. Send one unauthenticated request from a different rightmost `X-Forwarded-For` hop.
- **Expected result:** The second IP receives `401`, not `429`.

### TC-AUTH-LIMIT-004 — Window expiry restores 401

- **Level:** integration · **Priority:** Required
- **Preconditions:** Fake `clock` passed to `create_app`.
- **Steps:** Eleven failures at time T (eleventh is `429`). Advance the clock by the window. Send another unauthenticated request from the same IP.
- **Expected result:** That request is `401`, not `429`.

### TC-AUTH-LIMIT-005 — Untrusted X-Forwarded-For is ignored

- **Level:** integration · **Priority:** Required
- **Preconditions:** `TRUST_PROXY_HEADERS` unset/false.
- **Steps:** Eleven unauthenticated requests, each with a different `X-Forwarded-For` value.
- **Expected result:** Eleventh response is `429` (all share `request.client.host`).

### TC-AUTH-LIMIT-006 — Limiter keys on the rightmost XFF hop

- **Level:** integration · **Priority:** Required
- **Preconditions:** `TRUST_PROXY_HEADERS=true`.
- **Steps:** Eleven unauthenticated requests that vary the leftmost hop and keep the same rightmost hop.
- **Expected result:** Eleventh response is `429`.

### TC-AUTH-LIMIT-007 — Non-positive limit disables 429

- **Level:** integration · **Priority:** Required
- **Preconditions:** `BASIC_AUTH_FAILURE_LIMIT=0`.
- **Steps:** Eleven unauthenticated `GET /api/health` requests from one IP.
- **Expected result:** All eleven are `401`; none are `429`.

### TC-AUTH-WARN-001 — Default credentials warn and still serve

- **Level:** integration · **Priority:** Required
- **Preconditions:** Baked-in `admin` / `Admin123!`. Attach `caplog.handler` to logger `frvt` (`propagate=False`).
- **Steps:** Create the app; `GET /api/health` with those credentials.
- **Expected result:** A WARNING mentions built-in local defaults (no password in the message). Health is `200`.

### TC-AUTH-CHARSET-001 — Non-ASCII credentials fail closed

- **Level:** integration · **Priority:** Required
- **Steps:** `GET /api/health` with Basic credentials containing non-ASCII characters.
- **Expected result:** `401` with `code: unauthorized`; no server error.

### TC-AUTH-CHARSET-002 — Configured non-ASCII password authenticates

- **Level:** integration · **Priority:** Required
- **Preconditions:** `BASIC_AUTH_PASSWORD` set to a value containing non-ASCII characters.
- **Steps:** `GET /api/health` with those credentials.
- **Expected result:** `200`.

### TC-AUTH-OPT-001 — Public prefix skips Basic

- **Level:** integration · **Priority:** Required
- **Preconditions:** `BASIC_AUTH_PUBLIC_PATHS=/openapi.json`.
- **Steps:** Unauthenticated `GET /openapi.json` and `GET /api/health`.
- **Expected result:** OpenAPI document is `200`. Health is `401`.

### TC-AUTH-OPT-002 — Prefix `/doc` does not match `/docs`

- **Level:** integration · **Priority:** Required
- **Preconditions:** `BASIC_AUTH_PUBLIC_PATHS=/doc`.
- **Steps:** Unauthenticated `GET /docs`.
- **Expected result:** `401`.

### TC-AUTH-OPT-003 — Prefix `/` opts out every path

- **Level:** integration · **Priority:** Required
- **Preconditions:** `BASIC_AUTH_PUBLIC_PATHS=/`.
- **Steps:** Unauthenticated `GET /api/health` and `GET /docs`.
- **Expected result:** Both succeed without Basic (`200`).

### TC-AUTH-CLIENT-001 — Web client parses too_many_requests

- **Level:** unit · **Priority:** Required
- **Steps:** `ApiError.fromResponse` on HTTP 429 with `code: too_many_requests`.
- **Expected result:** `error.code === "too_many_requests"` (not `bad_request`).
