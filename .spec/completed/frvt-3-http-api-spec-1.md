# FRVT HTTP API Specification

**Status:** As-implemented catalog of the HTTP surface
**Audience:** Client authors, integrators, and reviewers of the running server
**Scope of this document:** Every HTTP endpoint the FastAPI process currently serves: application routers under `/api`, FastAPI/Starlette framework routes (`/docs`, `/redoc`, `/openapi.json`, and automatic `HEAD`), and the static UI mount at `/`. It does not specify resolver algorithms, ETL parsing, ORM schema, or UI behavior. Those remain in the companion design specifications.

**Companion documents:**

- Product/design source of truth (frozen body + addenda): [frvt-3-server-and-api-spec-1.md](./frvt-3-server-and-api-spec-1.md)
- Resolver and ingest internals: [frvt-3-resolver-and-etl-spec-1.md](./frvt-3-resolver-and-etl-spec-1.md)
- UI consumption: [frvt-3-ui-spec-1.md](./frvt-3-ui-spec-1.md)

This catalog describes the **implemented** HTTP contract (paths, methods, parameters, bodies, status codes, and shared envelopes). Where the frozen design spec plus its addenda and this catalog describe the same endpoint, they are intended to agree; this document is the place to look up the live route table, including framework-provided routes that the design spec does not enumerate.

FastAPI OpenAPI metadata: title `FRVT Versification Viewer`, version `0.1.0`.

---

## 1. Overview

The server is a single FastAPI (Starlette) ASGI process. All requests, including documentation pages and static UI assets, pass through HTTP Basic authentication before routing.

Route registration order in `frvt.api.main.create_app`:

1. FastAPI framework documentation routes (`/openapi.json`, `/docs`, `/docs/oauth2-redirect`, `/redoc`)
2. Application routers (`health`, `translations`, `spans`, `versifications`, `associations`, `ingest`, `resolve`, `navigation`)
3. Optional static UI mount at `/` (`frvt/web/dist`), added only when that directory exists, so `/api/...` is never shadowed

OpenAPI tags match the router tags: `health`, `translations`, `spans`, `versifications`, `associations`, `ingest`, `resolve`, `navigation`.

---

## 2. Conventions

| Topic | Rule |
| --- | --- |
| Base path | Application JSON APIs live under `/api`. Framework docs and the UI do not. |
| Path ids | `{translation_id}` and `{scheme_id}` are UUIDs. A malformed UUID is a request-validation failure (`422 validation_failed`). |
| Timestamps | ISO-8601 UTC (`datetime` serialized by Pydantic). |
| JSON | Request and response bodies are JSON unless an endpoint is `multipart/form-data` or HTML/static. |
| Auth | Every request requires HTTP Basic. See [§3](#3-authentication). |
| Errors | JSON envelope `{detail, code, errors?}`. See [§4](#4-error-contract). |
| Pagination | `{items, total}` with `limit` (default `100`, max `500`) and `offset` (default `0`). See [§5](#5-pagination). |
| Nested lists | Association and navigation trees return a bare JSON array, not `{items, total}`. |
| BCV refs | `BOOK C:V` or same-chapter `BOOK C:V-V`. `BOOK` matches `^[A-Z1-6]{3}$`. Verse `0` is a Psalm-title span. A sub-verse **part** is never embedded in the string; it travels as a separate field or query parameter. |
| Content-Type | JSON endpoints accept/return `application/json`. Ingest endpoints accept `multipart/form-data`. |

### 2.1 Automatic `HEAD`

FastAPI registers `HEAD` for every application and framework `GET` route. `HEAD` uses the same path, query parameters, authentication, and status codes as the corresponding `GET`, with an empty body. This catalog lists the `GET` contract; `HEAD` is implied for each `GET` unless noted.

### 2.2 Method not allowed

A registered path invoked with an unsupported method (for example `POST /api/health`) returns `405` with the uniform error envelope and `code: "bad_request"` (4xx statuses that are not in the fixed map fall through to `bad_request`).

---

## 3. Authentication

HTTP Basic via `Authorization: Basic <base64(username:password)>`.

- Credentials come from `BASIC_AUTH_USERNAME` / `BASIC_AUTH_PASSWORD` (defaults `admin` / `Admin123!`).
- Comparison is constant-time (`secrets.compare_digest`).
- Failure (missing header, non-Basic scheme, undecodable value, or mismatch) returns `401` with:

```json
{
  "detail": "Missing or invalid credentials.",
  "code": "unauthorized"
}
```

and `WWW-Authenticate: Basic realm="FRVT"`.

The gate applies to `/api/*`, `/docs`, `/redoc`, `/openapi.json`, and static UI paths. There is no anonymous health check, no cookie/session auth, and no CORS middleware.

---

## 4. Error contract

All application and framework HTTP errors that pass through the registered exception handlers share one envelope:

```json
{
  "detail": "Human-readable summary.",
  "code": "machine_readable_code",
  "errors": [
    { "field": "custom.vrs", "message": "Unmapped verse at REV 13:1." }
  ]
}
```

- `detail` and `code` are always present.
- `errors` is present only when there is per-field or per-file detail (ingest issues, Pydantic validation). It is omitted otherwise.

| HTTP status | `code` | Typical cause |
| --- | --- | --- |
| `400` | `bad_request` | Malformed BCV, missing required project files, unresolvable project name/language, other 4xx that are not in this table (including `405`) |
| `401` | `unauthorized` | Missing or invalid Basic credentials |
| `404` | `not_found` | Unknown translation, scheme, or association; missing static asset with a file extension |
| `409` | `conflict` | Duplicate name, association invariant, unassociated versification override, no preferred scheme, delete blocked by FK |
| `413` | `payload_too_large` | Upload exceeds `MAX_UPLOAD_BYTES` (default 50 MiB) |
| `422` | `validation_failed` | Pydantic request validation, invalid ingredient/USX, resolver `LookupError`, `limit` out of range |
| `500` | `internal_error` | Unhandled exception |
| `503` | `database_unavailable` | Health check cannot ping Postgres |

FastAPI's generated OpenAPI schema still advertises a stock `HTTPValidationError` / `ValidationError` shape for `422`. The running process **does not** emit that shape: `RequestValidationError` is rewritten to this envelope, with `errors[].field` joined from Pydantic `loc` (for example `query.limit` or `body.name`).

---

## 5. Pagination

Paginated collection endpoints accept:

| Query | Type | Default | Constraints |
| --- | --- | --- | --- |
| `limit` | int | `100` | `1`–`500`. Values above `500` or below `1` → `422 validation_failed`. Not silently clamped. |
| `offset` | int | `0` | Negative values are treated as `0`. |

Success body:

```json
{ "items": [ /* resource */ ], "total": 0 }
```

`total` is the filtered match count **before** the page slice (or, for jump-menu endpoints, the count after cancel/unreachable/reciprocal filtering).

Paginated endpoints: `GET /api/translations`, `GET /api/translations/{id}/spans`, `GET /api/versifications`, `GET /api/resolve/deltas`, `GET /api/resolve/misalignments`, `GET /api/resolve/jump-menu` (each of `deltas` and `misalignments` inside the combined body). `GET /api/resolve/chapter` uses `{items, total}` but does **not** accept `limit`/`offset`; `total === len(items)` after emit-once dedupe.

---

## 6. Shared types

JSON field types below follow the Pydantic models in `frvt.api.schemas`. Null means JSON `null`. Optional response keys that are omitted (not null) are called out.

### 6.1 Enumerations

**`RelationType`** (string): `one_to_one`, `shift`, `renumber`, `split`, `merge`, `exclude`, `partial`, `complex`, `range`.

- The first seven values may appear on stored mapping rows and on jump-menu entries.
- `complex` and `range` are resolve-time only (many-to-many hulls with `edges`). They are never stored on `mapping_record`.

**`text_direction`**: `ltr` \| `rtl`.

**Misalignment `category`**: `psalm_title`, `chapter_boundary`, `chapter_count`, `lxx_psalm`, `synodal`, `nt_omission`, `other`. Assigned from composed pair resolve (not from scheme-diff pivot labels alone).

### 6.2 Resource models

**`TranslationOut`**

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | |
| `name` | string | Display name; unique case-insensitively |
| `language` | string | Language tag (BCP 47 / ISO 639-3) |
| `text_direction` | `ltr` \| `rtl` | Default `ltr` for metadata-only creates and bootstrap anchors |
| `source_format` | string | `usx` or `usfm` |
| `created_at` | datetime | |
| `updated_at` | datetime | |

Canonical numbering-space **anchors** (`is_anchor = true`) are omitted from `GET /api/translations` but are readable by id.

**`VerseSpanOut`**

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | |
| `seq` | int | Document order; columns render by `seq` |
| `book` | string | USFM book id |
| `chapter` | int | |
| `verse` | int | `0` = Psalm title; combined-milestone **anchor** is the first USX integer |
| `part` | string \| null | Sub-verse part |
| `verse_label` | string \| null | USX display text for combined milestones (e.g. `1,2`) |
| `verse_range` | string \| null | Normalized local verse correspondence for combined milestones |
| `content` | string | Verse text |

**`VersificationOut`**

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | |
| `name` | string | |
| `based_on_name` | string \| null | Ingredient `basedOn` display name |
| `based_on_id` | uuid \| null | Base translation FK |
| `canonical` | bool | Shipped canonical schemes vs uploads |
| `created_at` | datetime | |
| `updated_at` | datetime | |
| `associated_translation_names` | string[] | Non-anchor translation names linked via associations. Populated on **list**. Detail, patch, and upload responses default to `[]`. |

**`VersificationDetailOut`** — `VersificationOut` plus `ingredient` (object; full Copenhagen/Burrito document).

**`AssociationOut`**

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | |
| `translation_id` | uuid | |
| `scheme_id` | uuid | |
| `preferred` | bool | At most one preferred association per translation |

**`ResolvedSpan`**

| Field | Type | Notes |
| --- | --- | --- |
| `ref` | string | Single-verse BCV; never a range; never a part suffix |
| `book` | string | |
| `chapter` | int | |
| `verse` | int | Canonicalized onto a stored combined-milestone anchor when applicable |
| `seq` | int \| null | Stored `verse_span.seq` when a matching span exists |
| `part` | string \| null | |
| `verse_label` | string \| null | Present when the enriched stored span carries it |
| `verse_range` | string \| null | Present when the enriched stored span carries it |

**`ResolveEdge`**: `source_index` (int), `target_index` (int), `relation` (`RelationType`). Indices into `source_spans` / `target_spans`.

**`ResolveResult`**

| Field | Type | Notes |
| --- | --- | --- |
| `source_spans` | `ResolvedSpan`[] | Query verse plus merge/hull siblings |
| `target_spans` | `ResolvedSpan`[] | Empty for `exclude` |
| `relation` | `RelationType` | Top-level classification after enrichment/dedupe |
| `edges` | `ResolveEdge`[] | Populated for `complex` / `range`; otherwise `[]` |
| `source_rel` | `RelationType` | **Key omitted** (not null) when unset |
| `target_rel` | `RelationType` | **Key omitted** when unset |

Cardinality is carried by list length: 1:1 / shift / renumber → one source and one target; split → 1:N; merge → N:1; exclude → 1:0; partial → spans carry `part`; complex/range → M:N with `edges`.

**`NavBook`**: `book` (string), `chapters` (int[] — stored `verse_span` chapters for that book, sorted).

**`NavRef`**: `book`, `chapter`, `verse`, `part` (string \| null). Structured single-verse jump target; clients must not parse range strings.

**`DeltaEntry`**: `source_ref` (display-only, may be a range), `base_ref` (display-only; pair-resolved target when available), `relation`, `navigation_ref` (single-verse BCV legal as `GET /api/resolve` `ref`), `navigation` (`NavRef`).

**`MisalignmentEntry`**: `category`, `source_ref` (display-only), `relation`, `navigation_ref`, `navigation`.

**`JumpMenuEntries`**: `deltas` (`Page<DeltaEntry>`), `misalignments` (`Page<MisalignmentEntry>`). Both pages share the same filtered row set and pagination.

**`JumpBooksOut`**: `books` (string[] — distinct from-side USFM codes, USX/Paratext order).

**`ChapterResolveOut`**: `items` (`ResolveResult`[]), `total` (int, equal to `len(items)`).

**`ProjectIngestOut`**: `translation` (`TranslationOut`), `versification` (`VersificationOut`).

---

## 7. Endpoint index

### 7.1 Application (`/api`)

| Method | Path | Tag | Success |
| --- | --- | --- | --- |
| `GET` | `/api/health` | health | `200` `{"status":"ok"}` |
| `GET` | `/api/translations` | translations | `200` `Page<TranslationOut>` |
| `POST` | `/api/translations` | translations | `201` `TranslationOut` |
| `GET` | `/api/translations/{translation_id}` | translations | `200` `TranslationOut` |
| `PATCH` | `/api/translations/{translation_id}` | translations | `200` `TranslationOut` |
| `DELETE` | `/api/translations/{translation_id}` | translations | `204` |
| `GET` | `/api/translations/{translation_id}/spans` | spans | `200` `Page<VerseSpanOut>` |
| `GET` | `/api/translations/{translation_id}/versifications` | associations | `200` `AssociationOut[]` |
| `POST` | `/api/translations/{translation_id}/versifications` | associations | `201` `AssociationOut` |
| `PUT` | `/api/translations/{translation_id}/versifications/{scheme_id}/preferred` | associations | `200` `AssociationOut` |
| `DELETE` | `/api/translations/{translation_id}/versifications/{scheme_id}` | associations | `204` |
| `GET` | `/api/translations/{translation_id}/navigation` | navigation | `200` `NavBook[]` |
| `GET` | `/api/versifications` | versifications | `200` `Page<VersificationOut>` |
| `GET` | `/api/versifications/{scheme_id}` | versifications | `200` `VersificationDetailOut` |
| `PATCH` | `/api/versifications/{scheme_id}` | versifications | `200` `VersificationOut` |
| `DELETE` | `/api/versifications/{scheme_id}` | versifications | `204` |
| `POST` | `/api/versifications/upload` | ingest | `201` `VersificationOut` |
| `POST` | `/api/ingest/project` | ingest | `201` `ProjectIngestOut` |
| `GET` | `/api/resolve` | resolve | `200` `ResolveResult` |
| `GET` | `/api/resolve/chapter` | resolve | `200` `ChapterResolveOut` |
| `GET` | `/api/resolve/deltas` | navigation | `200` `Page<DeltaEntry>` |
| `GET` | `/api/resolve/misalignments` | navigation | `200` `Page<MisalignmentEntry>` |
| `GET` | `/api/resolve/jump-menu` | navigation | `200` `JumpMenuEntries` |
| `GET` | `/api/resolve/jump-books` | navigation | `200` `JumpBooksOut` |

There is no `POST /api/versifications`. Schemes are created only by upload or project ingest.

### 7.2 Framework and static

| Method | Path | Provider | Success |
| --- | --- | --- | --- |
| `GET` | `/openapi.json` | FastAPI | `200` OpenAPI 3 document |
| `GET` | `/docs` | FastAPI Swagger UI | `200` HTML |
| `GET` | `/docs/oauth2-redirect` | FastAPI Swagger UI | `200` HTML (OAuth2 redirect helper; unused by this POC) |
| `GET` | `/redoc` | FastAPI ReDoc | `200` HTML |
| `GET` | `/` and extensionless client paths | Starlette `StaticFiles` (`SpaStaticFiles`) | `200` `index.html` (when `frvt/web/dist` exists) |
| `GET` | `/<asset>` | Starlette `StaticFiles` | `200` file, or `404` for missing files that have an extension |

---

## 8. Application endpoints

### 8.1 Health

#### `GET /api/health`

Liveness plus a `SELECT 1` database ping.

**Success:** `200`

```json
{ "status": "ok" }
```

**Errors:** `503 database_unavailable` when the ping fails. Auth failures are `401` like every other route.

---

### 8.2 Translations

#### `GET /api/translations`

List non-anchor translations, ordered by `name`.

**Query:** `limit`, `offset` ([§5](#5-pagination)).

**Success:** `200` `Page<TranslationOut>`.

#### `POST /api/translations`

Create a metadata-only translation (no verse spans). `text_direction` is stored as `ltr`. Content arrives later via ingest or is left empty for numbering-space nodes.

**Body (`TranslationCreate`):**

| Field | Type | Required |
| --- | --- | --- |
| `name` | non-blank string | yes |
| `language` | non-blank string | yes |
| `source_format` | `usx` \| `usfm` | yes |

**Success:** `201` `TranslationOut`.

**Errors:** `409 conflict` on case-insensitive duplicate `name`. `422` on blank/missing fields.

#### `GET /api/translations/{translation_id}`

**Success:** `200` `TranslationOut`. Anchors are readable by id.

**Errors:** `404 not_found`.

#### `PATCH /api/translations/{translation_id}`

**Body (`TranslationUpdate`):** optional `name`, optional `language` (each non-blank when present). Omitted fields are unchanged.

**Success:** `200` `TranslationOut`.

**Errors:** `404`; `409 conflict` on duplicate name.

#### `DELETE /api/translations/{translation_id}`

Deletes the translation, its verse spans, and its association rows.

Additionally, when the translation's **preferred** scheme has the same name (case-insensitive) and no other translation is associated with that scheme, that scheme and its mapping rows are deleted. Non-preferred schemes, shared schemes, and differently named preferred schemes are left unchanged.

**Success:** `204` (empty body).

**Errors:** `404`; `409 conflict` when the translation is still referenced as `versification_scheme.based_on_id`.

---

### 8.3 Scripture spans

#### `GET /api/translations/{translation_id}/spans`

**Query:**

| Name | Required | Notes |
| --- | --- | --- |
| `book` | yes | USFM book id |
| `chapter` | no | When set, narrows to one chapter |
| `limit`, `offset` | no | [§5](#5-pagination) |

**Success:** `200` `Page<VerseSpanOut>`, ordered by `seq`. Unknown `book` yields `{items: [], total: 0}`, not an error.

**Errors:** `404` if the translation does not exist.

---

### 8.4 Versifications

#### `GET /api/versifications`

**Query:** `canonical` (optional bool filter), `limit`, `offset`.

**Success:** `200` `Page<VersificationOut>` ordered by `name`. Each item includes `associated_translation_names` for non-anchor translations. The heavy `ingredient` payload is omitted.

#### `GET /api/versifications/{scheme_id}`

**Success:** `200` `VersificationDetailOut` (includes `ingredient`).

**Errors:** `404`.

#### `PATCH /api/versifications/{scheme_id}`

**Body (`VersificationUpdate`):** optional `name`.

**Success:** `200` `VersificationOut`.

**Errors:** `404`; `422` on blank name.

#### `DELETE /api/versifications/{scheme_id}`

**Success:** `204` when no association references the scheme (mapping rows cascade).

**Errors:** `404`; `409 conflict` if any `translation_versification` row still references it (including canonical schemes in use).

---

### 8.5 Associations

A translation may have several associated schemes and exactly one preferred scheme once any association exists. The first association created for a translation is marked preferred. Per-request `*_versification` query params on coordinate endpoints never mutate `preferred`.

#### `GET /api/translations/{translation_id}/versifications`

**Success:** `200` JSON array of `AssociationOut` (not paginated).

**Errors:** `404` if the translation is missing.

#### `POST /api/translations/{translation_id}/versifications`

**Body (`AssociationCreate`):** `{ "scheme_id": "<uuid>" }`.

**Success:** `201` `AssociationOut`. Preferred is `true` only when this is the translation's first association.

**Errors:** `404` if translation or scheme is missing; `409 conflict` if already associated.

#### `PUT /api/translations/{translation_id}/versifications/{scheme_id}/preferred`

Makes this association the preferred default and clears `preferred` on any previous preferred row in the same transaction.

**Success:** `200` `AssociationOut`.

**Errors:** `404` if the translation is missing; `409 conflict` if the scheme is not associated with the translation.

#### `DELETE /api/translations/{translation_id}/versifications/{scheme_id}`

Removes a **non-preferred** association.

**Success:** `204`.

**Errors:** `404` if the translation or association is missing; `409 conflict` if the association is preferred (make another scheme preferred first).

---

### 8.6 File ingest and upload

Both endpoints accept `multipart/form-data`, read at most `MAX_UPLOAD_BYTES + 1` bytes, and return `413 payload_too_large` when the cap is exceeded. Parsing is all-or-nothing: issues roll back the transaction.

#### `POST /api/ingest/project`

Ingest a zipped Paratext-style project (USX tree plus a required `.vrs`).

**Form fields:**

| Field | Required | Notes |
| --- | --- | --- |
| `file` | yes | Zip archive |
| `name` | no | Fallback translation name when `metadata.xml` omits `<identification><name>` |
| `language` | no | Fallback language when metadata omits `<language><ldml>` and `<language><iso>` |

Name and language resolution: `metadata.xml` is authoritative over the form. If either value cannot be resolved, `400 bad_request` with `errors` on `name` and/or `language`. `text_direction` comes from `<scriptDirection>` (`RTL` → `rtl`; missing or unrecognized → `ltr`). `source_format` is inferred from zip members (USX present → `usx`; otherwise `usfm`). The created scheme is named after the resolved translation name and marked preferred.

**Success:** `201` `ProjectIngestOut`.

**Errors:**

| Status | When |
| --- | --- |
| `400 bad_request` | Required files missing (`IngestIssue.kind == "missing"`); unresolvable name/language |
| `409 conflict` | Translation name already exists |
| `413 payload_too_large` | Over size cap |
| `422 validation_failed` | Invalid USX/ingredient (`kind == "invalid"`); unknown `basedOn` translation |

#### `POST /api/versifications/upload`

Create an unassociated scheme from a standalone `.vrs` or Copenhagen/Burrito `.json` file. A missing ingredient `basedOn` defaults to `org`.

**Form fields:** `file` (required), `name` (optional override; non-blank if supplied).

**Success:** `201` `VersificationOut`. Associate separately via [§8.5](#85-associations).

**Errors:** `413`; `422` on validation failure or blank `name`.

---

### 8.7 Reference resolution

Coordinate endpoints share **scheme selection** ([§11.1](#111-scheme-selection)): optional `from_versification` / `to_versification` (and `versification` on navigation) must be associated with that side's translation.

#### `GET /api/resolve`

Resolve a BCV or same-chapter bcvRange from the source translation's selected scheme to the target's selected scheme.

**Query:**

| Name | Required | Notes |
| --- | --- | --- |
| `from_translation` | yes | uuid |
| `to_translation` | yes | uuid |
| `ref` | yes | `BOOK C:V` or `BOOK C:V-V`; part must not be embedded |
| `part` | no | Sub-verse part id |
| `from_versification` | no | uuid override |
| `to_versification` | no | uuid override |

Pre-checks (per side, source then target): missing translation → `404`; override scheme id missing → `404`; override exists but not associated → `409`; no override and no preferred scheme → `409`. Then `ref` is parsed (`400` on invalid grammar or embedded part). Combined-milestone queries that fall inside a stored `verse_range` are rewritten to the stored **anchor** verse before resolve. Resolver `LookupError` (no shared ancestor / missing intermediate preferred scheme) → `422`. Spans are enriched with `seq` / labels and deduped by stored identity.

**Success:** `200` `ResolveResult`.

#### `GET /api/resolve/chapter`

Batch resolve for overlay chapter mode. Same scheme-selection pre-checks as single resolve.

**Query:** `from_translation`, `to_translation`, `book` (required), `chapter` (required, `>= 1`), optional `from_versification`, `to_versification`.

Verse enumeration: distinct whole-verse numbers (`part IS NULL`) from **stored `verse_span` rows only** for `from_translation` in `(book, chapter)`, ordered by `verse`. Not from `maxVerses` or navigation. Each verse is resolved with no `part` param. After each success, an alignment fingerprint (`relation` + sorted source/target `(ref, part)` + sorted edges + axis relations) is computed; the result is appended only if unseen. Per-verse failure is logged and skipped. Empty chapter → `{items: [], total: 0}`.

**Success:** `200` `ChapterResolveOut`.

---

### 8.8 Navigation and jump menu

Jump endpoints (`deltas`, `misalignments`, `jump-menu`, `jump-books`) share one filtered mapping set: scheme-difference rows (non-`one_to_one`), **cancel filtering** (identity loci omitted), **unreachable-target filtering** (resolved target book has no stored spans on the to-translation; excludes are kept), then **reciprocal** rows from the counterpart direction. Entries are ordered by from-side starting BCV (USX book order, then chapter, verse, part). Pagination applies to the filtered list. Resolve failures during filtering do not omit entries (fail open). See [§11.2](#112-jump-menu-filtering).

#### `GET /api/translations/{translation_id}/navigation`

Books and chapters that have stored verse spans. Validates the selected scheme (query `versification` optional uuid) with the same `404`/`409` rules as resolve, but **does not** pad from scheme `maxVerses`. Books are USX/Paratext order; chapters are sorted integers. Empty content → `[]`.

**Success:** `200` `NavBook[]`.

#### `GET /api/resolve/deltas`

**Query:** `from_translation`, `to_translation` (required); optional `book`, `limit`, `offset`, `from_versification`, `to_versification`.

**Success:** `200` `Page<DeltaEntry>`. `base_ref` is the pair-resolved target when resolve succeeds; otherwise the scheme-diff label.

#### `GET /api/resolve/misalignments`

**Query:** same as deltas, plus optional `category` (exact match on the pair-resolve category).

**Success:** `200` `Page<MisalignmentEntry>`. `total` is the count after category filter.

#### `GET /api/resolve/jump-menu`

One filtered pass returning both collections, sharing pagination (`limit`/`offset` slice both lists identically). Optional `book`; no `category` filter (clients filter `misalignments` locally if needed).

**Success:** `200` `JumpMenuEntries`.

#### `GET /api/resolve/jump-books`

Distinct from-side books that have jump-relevant differences after the same filters. No `book` query param. Empty pair, identical schemes, or no remaining differences → `{ "books": [] }`.

**Query:** `from_translation`, `to_translation`, optional `from_versification`, `to_versification`.

**Success:** `200` `JumpBooksOut`.

---

## 9. Framework-provided endpoints

These routes are registered by FastAPI when `FastAPI(title=..., version=...)` is constructed. They are **not** application routers. They are still gated by HTTP Basic middleware. They are omitted from the generated OpenAPI `paths` object (they *are* the documentation surface).

### 9.1 `GET /openapi.json`

Returns the OpenAPI 3 schema FastAPI builds from route signatures and Pydantic models (title `FRVT Versification Viewer`, version `0.1.0`). Application `/api` paths and component schemas are listed here. Static UI paths are not.

**Success:** `200` `application/json`.

**Auth:** `401` on missing/invalid credentials (JSON envelope, not an OpenAPI error object).

### 9.2 `GET /docs`

Swagger UI HTML that loads `/openapi.json`. Interactive "Try it out" still requires the browser to send Basic credentials (the UI itself was already gated). This POC does not use OAuth2.

**Success:** `200` `text/html`.

### 9.3 `GET /docs/oauth2-redirect`

Swagger UI OAuth2 redirect helper shipped by FastAPI. Unused by FRVT (no OAuth2). Included because FastAPI registers it whenever `/docs` is enabled (`docs_url` was not disabled).

**Success:** `200` `text/html`.

### 9.4 `GET /redoc`

ReDoc HTML documentation for the same `/openapi.json`.

**Success:** `200` `text/html`.

### 9.5 Framework behaviors that are not distinct paths

| Behavior | How it appears |
| --- | --- |
| Automatic `HEAD` on every `GET` | Same path and query as `GET`; empty body |
| `405 Method Not Allowed` | Envelope with `code: "bad_request"` |
| Request-model / query validation | `422 validation_failed` with `errors[]` from Pydantic `loc` |
| Unhandled exceptions | `500 internal_error` |
| Starlette `HTTPException` | Mapped through the same envelope via `code_for_status` |

`docs_url`, `redoc_url`, and `openapi_url` are left at FastAPI defaults. There is no custom OpenAPI URL prefix.

---

## 10. Static UI mount

When `frvt/web/dist` exists, the app mounts `SpaStaticFiles` (a `starlette.staticfiles.StaticFiles` subclass with `html=True`) at `/` **after** API and docs routes.

| Request | Behavior |
| --- | --- |
| `GET /` | `index.html`, `Cache-Control: no-cache` |
| Extensionless path (e.g. `/manage/translations`) | If the file is missing, serve `index.html` with `Cache-Control: no-cache` (client-side router) |
| Path whose last segment contains `.` (e.g. `/assets/index-….js`) | Serve the file, or `404` if missing — **no** SPA fallback |
| HTML responses | Always `Cache-Control: no-cache` so browsers do not pin a stale shell after a rebuild |

If `frvt/web/dist` is absent, the mount is skipped: `/` is then a FastAPI `404` (envelope `not_found`) rather than the SPA.

Auth still applies. Unauthenticated `GET /` and `GET /docs` both receive `401` with `WWW-Authenticate`.

---

## 11. Cross-cutting API behaviors

### 11.1 Scheme selection

Used by `GET /api/resolve`, `/api/resolve/chapter`, `/api/resolve/deltas`, `/api/resolve/misalignments`, `/api/resolve/jump-menu`, `/api/resolve/jump-books`, and `GET /api/translations/{id}/navigation`.

For each translation side:

1. If an override uuid is supplied and no scheme has that id → `404` (`Versification {id} not found.`).
2. If the scheme exists but has no association with that translation → `409` (`Versification is not associated with the translation.`).
3. If no override is supplied and the translation has no preferred association → `409` (`Translation has no preferred versification.`).
4. Otherwise use the override scheme, or the preferred scheme.

A per-request override never writes `translation_versification.preferred`.

### 11.2 Jump-menu filtering

Applied to deltas, misalignments, jump-menu, and jump-books, in order:

1. **Scheme differences.** Mapping rows present on only one selected scheme (skip `one_to_one`; skip schemes with no `based_on_id`). Counterpart-only rows are inverted onto the from-to direction.
2. **Cancel filter.** Omit a row whose `navigation_ref` (+ `part`) resolves to exactly one source span and one target span with identical `(book, chapter, verse, part)` and a non-`partial` relation. Identity-locus `partial` results stay visible.
3. **Unreachable filter.** Omit a row whose composed target lands in a book with no stored `verse_span` on the to-translation. Rows with no target spans (`exclude`) stay. Resolve failure keeps the row.
4. **Reciprocal rows.** For counterpart-direction rows that survive the same filters, if the composed target on the from side is a single-verse locus not already listed and not canceling/unreachable in the requested direction, emit a matching from-side jump row (labels, relation, and misalignment category from pair resolve).
5. **Sort** by from-side starting BCV. **Paginate** the filtered list (`jump-books` returns distinct books instead of paging rows).

Misalignment `category` uses pair resolve of `navigation_ref` (+ `part`) with the composed target ref and resolve `relation`, plus scheme-name heuristics (`lxx` → `lxx_psalm`; `synodal`/`rso`/`rsc` → `synodal`; PSA verse 0 / verse renumber → `psalm_title`; NT `exclude` → `nt_omission`; chapter change → `chapter_boundary`; `renumber` → `chapter_count`; else `other`).

### 11.3 Combined milestones on resolve

When a query coordinate falls inside a stored combined-milestone span, the resolver port rewrites the query to the stored anchor verse, then enriches each result span (attach `seq`, `verse_label`, `verse_range`, canonical `verse`). Duplicate spans that collapse onto the same stored row are dropped. Top-level `relation` is recomputed from post-dedupe cardinalities unless it is already `complex`. Topology is not expanded by copying `verse_range` integers onto the other translation.

---

## 12. Configuration that affects the HTTP surface

| Variable | Default | Effect on HTTP |
| --- | --- | --- |
| `BASIC_AUTH_USERNAME` | `admin` | Basic-auth user |
| `BASIC_AUTH_PASSWORD` | `Admin123!` | Basic-auth password |
| `MAX_UPLOAD_BYTES` | `52428800` | `413` threshold for ingest/upload |
| `POSTGRES_*` / `DATABASE_URL` | local Compose defaults | Health `503` when unreachable |
| `RESOLVE_TRACE_PIVOTS` | `false` | TRACE logs only; does not change response bodies |

---

## 13. Out of scope for this catalog

- Database schema, migrations, and bootstrap seeding (design spec §§5.7, 6)
- Resolver hop algorithm and ingredient derivation (resolver/ETL spec)
- UI routes as a product surface (UI spec); this document only describes how the process serves `frvt/web/dist`
- Client-only viewer session persistence (`localStorage`); no session endpoints exist
