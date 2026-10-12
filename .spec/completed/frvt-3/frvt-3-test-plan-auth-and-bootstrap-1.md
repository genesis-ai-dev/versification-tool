# FRVT-3 Test Plan — Auth & Server Bootstrap

**Document:** `frvt-3-test-plan-auth-and-bootstrap-1`
**Parent index:** [frvt-3-test-plan-1.md](./frvt-3-test-plan-1.md)
**Areas:** Auth (`AUTH`), server bootstrap / health / static (`SERVER`)

Shared setup, fixtures, and the traceability matrix live in the [parent index](./frvt-3-test-plan-1.md). Each case below is self-contained: read the Preconditions, perform the Steps, and compare against the Expected result.

---

## Auth (`AUTH`)

### TC-AUTH-001 — Valid Basic credentials allow API access

- **Level:** integration · **Priority:** Required · **Category:** permissions-auth · **Traces:** REQ-001, REQ-002
- **Preconditions:**
  - The API server is running with the canonical seed applied and the built UI mounted.
  - You know valid credentials (env `BASIC_AUTH_USERNAME` / `BASIC_AUTH_PASSWORD`; defaults `admin` / `Admin123!`).
- **Steps:**
  1. Send `GET /api/health` with a valid `Authorization: Basic` header for those credentials.
- **Expected result:**
  - The response status is `200`.
  - The body is `{"status":"ok"}`.

### TC-AUTH-002 — UI loads after the browser Basic prompt

- **Level:** e2e · **Priority:** Required · **Category:** permissions-auth · **Traces:** REQ-003, REQ-006
- **Preconditions:**
  - A clean browser session with no cached credentials for the app origin.
  - The server is running and serving the built UI at `/`.
- **Steps:**
  1. Navigate the browser to `/`.
  2. When the native browser Basic prompt appears, enter valid credentials and submit.
- **Expected result:**
  - The application shell renders (top nav with Viewer / Manage links).
  - No in-app login form is shown at any point; only the browser's native prompt was used.

### TC-AUTH-010 — Unauthenticated requests are rejected on every route

- **Level:** integration · **Priority:** Required · **Category:** permissions-auth · **Traces:** REQ-001, REQ-003, REQ-004, REQ-008
- **Preconditions:**
  - The server is running.
  - An HTTP client that sends no `Authorization` header.
- **Steps:**
  1. Send `GET /api/translations` with no credentials.
  2. Repeat, still unauthenticated, for `GET /` (static UI), `GET /docs` (OpenAPI), and `GET /api/health`.
- **Expected result:**
  - Every response is `401`.
  - Every response includes header `WWW-Authenticate: Basic realm="FRVT"`.
  - API responses carry the error envelope with `code = "unauthorized"`.

### TC-AUTH-011 — Wrong password is rejected

- **Level:** integration · **Priority:** Required · **Category:** permissions-auth · **Traces:** REQ-001
- **Preconditions:**
  - The server is running with known credentials.
- **Steps:**
  1. Send `GET /api/translations` with the correct username but an incorrect password.
- **Expected result:**
  - The response is `401` with `code = "unauthorized"`.
  - No translations data is returned.

> Note: the spec's constant-time credential comparison (server §5.3) is a code-review checklist item, not a behavioral test; it is verified during review of the auth middleware rather than by an automated case.

### TC-AUTH-013 — Auth-failure banner after repeated post-challenge failures

- **Level:** e2e · **Priority:** Required · **Category:** permissions-auth · **Traces:** REQ-007
- **Preconditions:**
  - The UI has loaded once (credentials were accepted), then credentials become invalid (e.g., rotated server-side) so subsequent requests fail.
- **Steps:**
  1. Trigger UI actions that issue API requests after the credentials have been invalidated.
  2. Allow the requests to fail repeatedly after the browser challenge.
- **Expected result:**
  - The UI shows the banner "Authentication required — reload and sign in".
  - No custom login route/form is presented.

---

## Server bootstrap, health, static (`SERVER`)

### TC-SERVER-001 — Health reports OK when the database is reachable

- **Level:** integration · **Priority:** Required · **Category:** functional · **Traces:** REQ-010
- **Preconditions:**
  - The server is running and its PostgreSQL database is reachable.
  - Valid credentials are available.
- **Steps:**
  1. Send an authenticated `GET /api/health`.
- **Expected result:**
  - Status `200` with body `{"status":"ok"}`.

### TC-SERVER-002 — Canonical seed is created on first start

- **Level:** integration · **Priority:** Required · **Category:** data-integrity · **Traces:** REQ-012, REQ-013, REQ-014, REQ-015
- **Preconditions:**
  - An empty database (no prior seed).
- **Steps:**
  1. Start the application so bootstrap/seed runs.
  2. Inspect the `translation`, `versification_scheme`, and association tables directly.
- **Expected result:**
  - Anchor translations `org`, `eng`, `lxx`, `rso`, `rsc`, `vul` exist with `is_anchor = true`.
  - One canonical scheme per anchor exists with `canonical = true`; `org`'s scheme has a null `based_on` (root).
  - Each anchor translation has its matching scheme associated as preferred.

### TC-SERVER-003 — Anchors are hidden from the translations list

- **Level:** integration · **Priority:** Required · **Category:** functional · **Traces:** REQ-016
- **Preconditions:**
  - A freshly seeded database with no user-uploaded translations.
- **Steps:**
  1. Send an authenticated `GET /api/translations`.
- **Expected result:**
  - `total === 0` and `items` is empty (anchors are excluded server-side).

### TC-SERVER-004 — Static SPA deep links resolve

- **Level:** e2e · **Priority:** Required · **Category:** functional · **Traces:** REQ-011, REQ-017
- **Preconditions:**
  - The built UI is mounted at `/` with `html=True`.
  - Valid credentials are available.
- **Steps:**
  1. Open `/manage/translations` directly (deep link, not via in-app navigation), authenticating if prompted.
  2. Separately request an `/api/...` path.
- **Expected result:**
  - The manage page renders (HTML fallback served), not a `404`.
  - `/api/...` routes still resolve to the API, i.e. the static mount does not shadow the API.

### TC-SERVER-010 — Health reports database unavailable when the DB is down

- **Level:** integration · **Priority:** Required · **Category:** error-handling · **Traces:** REQ-018
- **Preconditions:**
  - The server is running but its database is stopped or unreachable.
- **Steps:**
  1. Send an authenticated `GET /api/health`.
- **Expected result:**
  - Status `503` with envelope `code = "database_unavailable"`.

### TC-SERVER-011 — Seed is idempotent

- **Level:** integration · **Priority:** Required · **Category:** data-integrity · **Traces:** REQ-019
- **Preconditions:**
  - A database that has already been seeded once.
- **Steps:**
  1. Restart the application (or re-run the seed routine).
  2. Re-inspect anchors and canonical schemes.
- **Expected result:**
  - No duplicate anchor translations or canonical schemes are created (seed keys on case-insensitive name).

### TC-SERVER-013 — Resolve pivot diagnostics stay out of the response body

- **Level:** integration · **Priority:** Required · **Category:** nfr · **Traces:** REQ-020, REQ-021
- **Preconditions:**
  - `RESOLVE_TRACE_PIVOTS=true` is set.
  - A fixture that produces a `complex` resolve result is available.
- **Steps:**
  1. Perform a resolve that returns a `complex` result.
  2. Inspect both the HTTP response body and the server logs (at TRACE).
- **Expected result:**
  - The response body contains no pivot/diagnostic dump.
  - Pivot diagnostics appear only in TRACE-level logs (confirming the custom `TRACE` level is active).
