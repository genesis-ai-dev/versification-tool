# FRVT HTTP API

HTTP contract for the FastAPI process started in the README. Use this file when calling the API or when changing routes; use [openapi.json](./openapi.json) for code generation. Interactive Swagger/ReDoc on a running server (`GET /docs`, `GET /redoc`) require HTTP Basic and load **live** `GET /openapi.json`, which is not the patched checked-in schema (see [OpenAPI notes](#openapi-notes)).

Internal design notes live under `.spec/`. If this file and a `.spec` catalog disagree about a live status code or body, the running server wins.

## Contents

- [Base URL and process](#base-url-and-process)
- [Authentication](#authentication)
- [Errors](#errors)
- [Pagination](#pagination)
- [References (BCV)](#references-bcv)
- [Scheme selection](#scheme-selection)
- [Canonical `org` / `eng`](#canonical-org--eng)
- [Quick start](#quick-start)
- [Endpoint index](#endpoint-index)
- [Health](#health)
- [Translations](#translations)
- [Spans](#spans)
- [Versifications](#versifications)
- [Associations](#associations)
- [Ingest and upload](#ingest-and-upload)
- [Resolve](#resolve)
- [Batch mapping](#batch-mapping)
- [Navigation and jump menu](#navigation-and-jump-menu)
- [Resource shapes](#resource-shapes)
- [OpenAPI notes](#openapi-notes)
- [Settings that change the HTTP surface](#settings-that-change-the-http-surface)

---

## Base URL and process

Local default: `http://localhost:8000`. Start uvicorn from the **repository root** so `frvt.api.main:app` imports (see the README).

JSON application routes live under `/api` and use `Content-Type: application/json` except ingest/upload (`multipart/form-data`). Timestamps are ISO-8601 UTC. FastAPI serves `/openapi.json`, `/docs`, and `/redoc` outside the `/api` prefix. When `frvt/web/dist` exists, the React app is mounted at `/` after the API routes so `/api/...` is never shadowed.

Every `GET` also accepts `HEAD` with the same query parameters, auth, and status codes, and an empty body. An unsupported method on a registered path returns `405` with `code: "bad_request"`.

Path parameters `{translation_id}` and `{scheme_id}` are UUIDs. A malformed UUID is `422 validation_failed`.

---

## Authentication

All routes, including `/docs` and `/openapi.json`, require HTTP Basic.

```http
Authorization: Basic <base64(username:password)>
```

Credentials come from `BASIC_AUTH_USERNAME` / `BASIC_AUTH_PASSWORD`. Local defaults are `admin` / `Admin123!`. Those values log a warning at startup and must not be used on a shared host.

Failed auth returns `401`:

```json
{ "detail": "Missing or invalid credentials.", "code": "unauthorized" }
```

plus `WWW-Authenticate: Basic realm="FRVT"`. Ten failures from the same client IP inside 60 seconds yield `429` with `code: "too_many_requests"` (`BASIC_AUTH_FAILURE_LIMIT` / `BASIC_AUTH_FAILURE_WINDOW_SECONDS`). There is no cookie session and no CORS middleware.

`BASIC_AUTH_PUBLIC_PATHS` is a comma-separated list of path prefixes that skip the gate. Empty (the default) keeps every route gated. Prefix `/` opens the entire process, including the limiter; do not set that in production.

---

## Errors

Application and framework errors share one envelope:

```json
{
  "detail": "Human-readable summary.",
  "code": "not_found",
  "errors": [{ "field": "query.limit", "message": "..." }]
}
```

`detail` and `code` are always present. `errors` appears only for per-field or per-file problems (Pydantic validation, ingest issues).

| Status | `code` | Typical cause |
| --- | --- | --- |
| 400 | `bad_request` | Bad BCV, missing project files, `405` |
| 401 | `unauthorized` | Missing or invalid Basic credentials |
| 404 | `not_found` | Unknown translation, scheme, or association |
| 409 | `conflict` | Duplicate name, association invariant, unassociated override, no preferred scheme (non-batch), delete blocked |
| 413 | `payload_too_large` | Upload over `MAX_UPLOAD_BYTES` (default 50 MiB) |
| 422 | `validation_failed` | Pydantic validation, `limit` outside 1–500, resolver chain failure, reversed batch range |
| 429 | `too_many_requests` | Auth failure limiter |
| 500 | `internal_error` | Unhandled exception |
| 503 | `database_unavailable` | Health check cannot ping Postgres |

Live `GET /openapi.json` still lists FastAPI's `HTTPValidationError` on many `422` responses. The process **does not** emit that shape: `RequestValidationError` is rewritten to the envelope above, with `errors[].field` joined from Pydantic `loc` (`query.limit`, `body.name`). [openapi.json](./openapi.json) is patched to `ErrorBody`.

---

## Pagination

Collection endpoints take `limit` (default `100`, max `500`) and `offset` (default `0`). Values below `1` or above `500` for `limit` are `422 validation_failed`, not silently clamped. Negative `offset` is treated as `0`.

Success body:

```json
{ "items": [], "total": 0 }
```

`total` is the match count **before** the page slice.

Paginated: `GET /api/translations`, `GET /api/translations/{id}/spans`, `GET /api/versifications`, `GET /api/resolve/deltas`, `GET /api/resolve/misalignments`, `GET /api/resolve/jump-menu` (both inner lists), `GET /api/resolve/range`.

Not paginated: association lists and `GET /api/translations/{id}/navigation` return a bare JSON array. `GET /api/resolve/chapter` uses `{items, total}` but has no `limit`/`offset`; `total` equals `len(items)` after emit-once dedupe. `POST /api/resolve/verses` is not paged; the caller already controls the list (`refs` length 1–500).

---

## References (BCV)

Unless an endpoint says otherwise:

- Single-verse string: `BOOK C:V` (example `JHN 3:16`).
- Same-chapter range (resolve `ref` and batch `refs` members): `BOOK C:V-V`.
- `BOOK` is a three-character USFM code matching `[A-Z1-6]{3}`.
- Verse `0` is a Psalm title.
- A sub-verse part is **never** embedded in the string (`GEN 1:1a` is invalid). Use the `part` query parameter on `GET /api/resolve` when you need it. Batch routes have no `part` field.

Range bounds on `GET /api/resolve/range` additionally accept partials: `BOOK`, `BOOK C`, or `BOOK C:V`. See [Batch mapping](#batch-mapping).

---

## Scheme selection

Coordinate routes take optional `from_versification` / `to_versification` (UUID). A per-request override never writes `preferred` on the association row.

**`GET /api/resolve`, `/api/resolve/chapter`, jump-menu routes, and `GET /api/translations/{id}/navigation`:**

1. Override id with no such scheme → `404`.
2. Scheme exists but is not associated with that translation → `409`.
3. No override and no preferred association → `409` (`Translation has no preferred versification.`).

**`GET /api/resolve/range` and `POST /api/resolve/verses` only:** step 3 falls back to the canonical scheme named `org` instead of `409`. The response echoes the scheme ids actually used (`from_versification`, `to_versification`).

---

## Canonical `org` / `eng`

Startup seeds canonical numbering-space **anchors** (translations with `is_anchor = true`) and matching canonical schemes. Anchors are omitted from `GET /api/translations` but are readable by id and are valid as `to_translation` on resolve.

To get the original Hebrew/Greek translation id without listing anchors:

```bash
curl -sS -u "$AUTH" "$BASE/api/versifications?canonical=true&limit=100" \
  | jq -r '.items[] | select(.name | ascii_downcase == "eng") | .based_on_id'
```

The canonical **scheme** named `org` is a different UUID from that translation id. Batch defaulting uses the scheme.

---

## Quick start

Assume `BASE=http://localhost:8000` and `AUTH='admin:Admin123!'`. Zip paths are relative to the repository root. The snippets use `jq`.

```bash
# Health (also a DB ping)
curl -sS -u "$AUTH" "$BASE/api/health"
# {"status":"ok"}

# Ingest a Paratext-style zip (USX + .vrs). Name/language in metadata.xml win over form fields.
curl -sS -u "$AUTH" -X POST "$BASE/api/ingest/project" \
  -F "file=@research/SampleTranslations/biblica-spanish-1.zip;type=application/zip" \
  -F "name=my-sample" \
  -F "language=es"

# List translations, then resolve one verse into org
FROM=$(curl -sS -u "$AUTH" "$BASE/api/translations?limit=20" | jq -r '.items[0].id')
ORG=$(curl -sS -u "$AUTH" "$BASE/api/versifications?canonical=true&limit=100" \
  | jq -r '.items[] | select(.name | ascii_downcase == "eng") | .based_on_id')

curl -sS -u "$AUTH" -G "$BASE/api/resolve" \
  --data-urlencode "from_translation=$FROM" \
  --data-urlencode "to_translation=$ORG" \
  --data-urlencode "ref=JHN 3:16"
```

---

## Endpoint index

| Method | Path | Success |
| --- | --- | --- |
| `GET` | `/api/health` | `200` `{"status":"ok"}` |
| `GET` | `/api/translations` | `200` page of translations |
| `POST` | `/api/translations` | `201` translation |
| `GET` | `/api/translations/{translation_id}` | `200` translation |
| `PATCH` | `/api/translations/{translation_id}` | `200` translation |
| `DELETE` | `/api/translations/{translation_id}` | `204` |
| `GET` | `/api/translations/{translation_id}/spans` | `200` page of spans |
| `GET` | `/api/translations/{translation_id}/versifications` | `200` association array |
| `POST` | `/api/translations/{translation_id}/versifications` | `201` association |
| `PUT` | `/api/translations/{translation_id}/versifications/{scheme_id}/preferred` | `200` association |
| `DELETE` | `/api/translations/{translation_id}/versifications/{scheme_id}` | `204` |
| `GET` | `/api/translations/{translation_id}/navigation` | `200` `NavBook[]` |
| `GET` | `/api/versifications` | `200` page of schemes |
| `GET` | `/api/versifications/{scheme_id}` | `200` scheme plus `ingredient` |
| `PATCH` | `/api/versifications/{scheme_id}` | `200` scheme |
| `DELETE` | `/api/versifications/{scheme_id}` | `204` |
| `POST` | `/api/versifications/upload` | `201` scheme |
| `POST` | `/api/ingest/project` | `201` translation + preferred scheme |
| `GET` | `/api/resolve` | `200` `ResolveResult` |
| `GET` | `/api/resolve/chapter` | `200` chapter alignments |
| `GET` | `/api/resolve/range` | `200` `BatchResolveOut` |
| `POST` | `/api/resolve/verses` | `200` `BatchResolveOut` |
| `GET` | `/api/resolve/deltas` | `200` page of deltas |
| `GET` | `/api/resolve/misalignments` | `200` page of misalignments |
| `GET` | `/api/resolve/jump-menu` | `200` both lists, shared paging |
| `GET` | `/api/resolve/jump-books` | `200` `{ "books": [] }` |

There is no `POST /api/versifications`. Schemes are created by upload or project ingest.

---

## Health

### `GET /api/health`

Runs `SELECT 1` against Postgres. `200 {"status":"ok"}` or `503 database_unavailable`. Still requires Basic auth.

---

## Translations

Listings omit anchors. `GET`/`PATCH`/`DELETE` by id still work for anchors.

### `GET /api/translations`

Ordered by `name`. Query: `limit`, `offset`.

### `POST /api/translations`

Metadata-only row (no spans). Body:

| Field | Type | Required |
| --- | --- | --- |
| `name` | non-blank string | yes |
| `language` | non-blank string | yes |
| `source_format` | `usx` or `usfm` | yes |

`text_direction` is stored as `ltr`. `409` on a case-insensitive duplicate name.

### `GET /api/translations/{translation_id}`

`404` if missing.

### `PATCH /api/translations/{translation_id}`

Optional `name` and/or `language`. Omitted fields are unchanged. A present-but-blank field is `422 validation_failed`.

### `DELETE /api/translations/{translation_id}`

Deletes the translation, its spans, and its association rows. If the preferred scheme has the same name (case-insensitive) and no other translation uses it, that scheme and its mapping rows go too. `409` when the translation is still `versification_scheme.based_on_id`.

---

## Spans

### `GET /api/translations/{translation_id}/spans`

| Query | Required | Notes |
| --- | --- | --- |
| `book` | yes | USFM book id |
| `chapter` | no | Narrow to one chapter |
| `limit`, `offset` | no | Pagination |

Ordered by `seq`. Unknown `book` returns `{items: [], total: 0}`, not an error. `404` if the translation does not exist.

Whole-verse rows have `"part": null`. Combined USX milestones store one row at the anchor verse with `verse_range` set (for example `JHN 3:16-17`) and optional `verse_label`.

---

## Versifications

### `GET /api/versifications`

Query: optional `canonical` (boolean), `limit`, `offset`. Ordered by `name`. List items include `associated_translation_names` (non-anchor translations) and omit the heavy `ingredient` payload.

### `GET /api/versifications/{scheme_id}`

Includes `ingredient` (Copenhagen/Burrito document).

### `PATCH /api/versifications/{scheme_id}`

Optional `name`. A blank `name` is `422 validation_failed`.

### `DELETE /api/versifications/{scheme_id}`

`204` when no association references the scheme. `409` if any association still points at it (canonical schemes in use included).

---

## Associations

A translation may have several schemes and exactly one preferred scheme once any association exists. The first association created is marked preferred.

### `GET /api/translations/{translation_id}/versifications`

Bare JSON array of `{id, translation_id, scheme_id, preferred}`. Not a `{items, total}` page.

### `POST /api/translations/{translation_id}/versifications`

Body: `{ "scheme_id": "<uuid>" }`. `404` if the translation or scheme is missing; `409` if already associated.

### `PUT /api/translations/{translation_id}/versifications/{scheme_id}/preferred`

Makes this pair the preferred default and clears `preferred` on any previous row in the same transaction. `404` if the translation is missing; `409` if the scheme is not associated.

### `DELETE /api/translations/{translation_id}/versifications/{scheme_id}`

Removes a **non-preferred** association. `409` if it is still preferred; point preferred at another scheme first.

---

## Ingest and upload

Both accept `multipart/form-data`. Bodies larger than `MAX_UPLOAD_BYTES` are `413`. Parsing is all-or-nothing; validation issues roll back the transaction.

### `POST /api/ingest/project`

Paratext-style zip: USX tree plus a required `.vrs`.

| Form field | Required | Notes |
| --- | --- | --- |
| `file` | yes | Zip |
| `name` | no | Used only when `metadata.xml` has no `<identification><name>` |
| `language` | no | Used only when metadata has no language |

`metadata.xml` is authoritative. If name or language cannot be resolved, `400` with `errors` on those fields. `text_direction` comes from `<scriptDirection>` (`RTL` → `rtl`; missing → `ltr`). `source_format` is inferred from zip members. The created scheme is named after the resolved translation name and marked preferred.

`201` body: `{ "translation": TranslationOut, "versification": VersificationOut }`.

`409` if that translation name already exists. `422` on invalid USX/ingredient or unknown ingredient `basedOn`.

### `POST /api/versifications/upload`

Standalone `.vrs` or Copenhagen `.json`. Form: `file` (required), `name` (optional override). Missing ingredient `basedOn` defaults to `org`. The scheme is **not** associated; call the association `POST` yourself.

---

## Resolve

### `GET /api/resolve`

Map one reference from the source translation’s selected scheme to the target’s.

| Query | Required | Notes |
| --- | --- | --- |
| `from_translation` | yes | uuid |
| `to_translation` | yes | uuid |
| `ref` | yes | `BOOK C:V` or same-chapter `BOOK C:V-V` |
| `part` | no | Sub-verse part |
| `from_versification` | no | uuid override |
| `to_versification` | no | uuid override |

Scheme selection is the strict (non-batch) rules. Invalid `ref` grammar or an embedded part is `400`. Combined-milestone queries that fall inside a stored `verse_range` are rewritten to the stored **anchor** before resolve. No shared ancestor or a cycle is `422`.

Success is a `ResolveResult`: `source_spans`, `target_spans`, `relation`, `edges`. Cardinality is list length (1:1, split 1:N, merge N:1, exclude 1:0, complex/range M:N with `edges`). `source_rel` / `target_rel` are omitted (not `null`) when unset.

### `GET /api/resolve/chapter`

Overlay chapter mode. Query: `from_translation`, `to_translation`, `book`, `chapter` (`>= 1`), optional scheme overrides.

Enumerates distinct whole-verse numbers from **stored spans** of `from_translation` in that book/chapter (`part IS NULL`), not from scheme `maxVerses`. Each verse is resolved; identical alignments are emit-once deduped. Per-verse failures are skipped. Empty chapter → `{items: [], total: 0}`.

---

## Batch mapping

Two routes for integrators who need many verses in one round trip. Scheme chains are built **once per request**. Span enrichment still queries per verse; keep the default page size (`100`) for interactive callers. `LOG_LEVEL` defaults to `DEBUG` and a 500-verse page emits a large log.

There is no emit-once dedupe. Duplicate requested refs produce duplicate entries.

Per-member failures stay HTTP `200` with `items[].error` set. A chain problem (cycle, no shared ancestor) fails the whole request with `422` before any entries are built.

Shared success body (`BatchResolveOut`):

```json
{
  "items": [
    {
      "ref": "JHN 3:16",
      "result": { "source_spans": [], "target_spans": [], "relation": "one_to_one", "edges": [] },
      "error": null
    }
  ],
  "total": 1,
  "from_versification": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  "to_versification": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
}
```

Exactly one of `result` / `error` is non-null; both keys are always present. Member `error` is `{ "code": "<ErrorCode>", "detail": "..." }` (no `errors` array). Request-level failures still use the usual envelope.

### `GET /api/resolve/range`

Expand a closed interval of the from-translation’s **stored whole-verse spans**, then resolve the page.

| Query | Required | Notes |
| --- | --- | --- |
| `from_translation` | yes | uuid |
| `to_translation` | yes | uuid |
| `from_ref` | yes | `BOOK`, `BOOK C`, or `BOOK C:V` |
| `to_ref` | yes | same grammar |
| `from_versification` | no | uuid override |
| `to_versification` | no | uuid override |
| `limit` | no | Default 100, max 500 |
| `offset` | no | Default 0 |

`from_ref` / `to_ref` after strip:

- Unknown book code → `422 validation_failed`.
- Part suffix or range marker (`GEN 3:5a`, `GEN 1-2`) → `400 bad_request`.
- Truncated `GEN 3:` → `400`.
- Lower bound after upper bound (`EXO` to `GEN`, or `GEN 5` to `GEN 2`) → `422` (`Range end before start.`).

Omitted chapter or verse is open toward that bound’s own side: `GEN` is the first (or last) stored verse of Genesis; `GEN 3` is the first (or last) stored verse of Genesis 3; `GEN 3:5` is that verse only.

Expansion uses stored `verse_span` rows (`part IS NULL`), including every constituent of a combined-milestone `verse_range`, then sorts by USX book order, chapter, verse. Formatted as `BOOK C:V`. A metadata-only translation expands to `{items: [], total: 0}` with the resolved scheme ids. Pagination slices after expansion; only the page is resolved. `total` is the unsliced expansion length.

Combined-milestone constituents (`GEN 1:1` and `GEN 1:2` of a `GEN 1:1-2` row) share the same `result` payload under different `ref` keys.

```bash
curl -sS -u "$AUTH" -G "$BASE/api/resolve/range" \
  --data-urlencode "from_translation=$FROM" \
  --data-urlencode "to_translation=$ORG" \
  --data-urlencode "from_ref=JHN 3" \
  --data-urlencode "to_ref=JHN 3" \
  --data-urlencode "limit=20"
```

### `POST /api/resolve/verses`

Explicit list, request order, duplicates preserved.

```json
{
  "from_translation": "<uuid>",
  "to_translation": "<uuid>",
  "refs": ["JHN 3:16", "JHN 3:17"],
  "from_versification": null,
  "to_versification": null
}
```

`refs`: 1–500 strings in the same grammar as `GET /api/resolve` `ref`. Empty or 501+ → `422`. A malformed member (`GEN 1:1a`) becomes `items[].error` with `code: "bad_request"`; siblings still resolve. No `part` on the body or per ref.

`total` equals `len(refs)`.

```bash
curl -sS -u "$AUTH" -H 'Content-Type: application/json' \
  -X POST "$BASE/api/resolve/verses" \
  -d "$(jq -n --arg from "$FROM" --arg to "$ORG" \
    '{from_translation:$from, to_translation:$to, refs:["JHN 3:16","JHN 3:17"]}')"
```

---

## Navigation and jump menu

Jump endpoints (`deltas`, `misalignments`, `jump-menu`, `jump-books`) share one filtered mapping set: scheme-difference rows (not `one_to_one`), cancel filtering (identity loci omitted), unreachable-target filtering (resolved target book has no stored spans on the to-translation; excludes are kept), then reciprocal rows from the counterpart direction. Ordered by from-side starting BCV. Pagination applies to that filtered list. Resolve failures during filtering do not drop entries.

Strict scheme selection (no `org` fallback).

### `GET /api/translations/{translation_id}/navigation`

Books and chapters that have stored spans. Optional query `versification`. Does **not** pad from scheme `maxVerses`. Empty content → `[]`.

### `GET /api/resolve/deltas`

Query: `from_translation`, `to_translation`; optional `book`, `limit`, `offset`, scheme overrides. `base_ref` is the pair-resolved target when resolve succeeds.

### `GET /api/resolve/misalignments`

Same query as deltas, plus optional `category` exact match (`psalm_title`, `chapter_boundary`, `chapter_count`, `lxx_psalm`, `synodal`, `nt_omission`, `other`).

### `GET /api/resolve/jump-menu`

One pass returning `{ "deltas": Page, "misalignments": Page }` with identical `limit`/`offset` on both. Optional `book`; no `category` filter.

### `GET /api/resolve/jump-books`

Distinct from-side USFM books that still have jump-relevant differences. No `book` query param. Empty pair or identical schemes → `{ "books": [] }`.

---

## Resource shapes

Field types match `frvt.api.schemas`. Null means JSON `null`.

**`TranslationOut`:** `id`, `name`, `language`, `text_direction` (`ltr` \| `rtl`), `source_format`, `created_at`, `updated_at`.

**`VerseSpanOut`:** `id`, `seq`, `book`, `chapter`, `verse`, `part`, `verse_label`, `verse_range`, `content`.

**`VersificationOut`:** `id`, `name`, `based_on_name`, `based_on_id`, `canonical`, timestamps, `associated_translation_names` (populated on list; detail/patch/upload default to `[]`). Detail adds `ingredient`.

**`AssociationOut`:** `id`, `translation_id`, `scheme_id`, `preferred`.

**`BatchResolveEntry`:** `ref`, `result` (`ResolveResult` or `null`), `error` (`{code, detail}` or `null`). **`BatchResolveOut`:** `items`, `total`, `from_versification`, `to_versification` (scheme ids actually used).

**`ResolvedSpan`:** `ref` (single-verse BCV, never a range or part suffix), `book`, `chapter`, `verse`, `seq`, `part`, `verse_label`, `verse_range`.

**`ResolveResult`:** `source_spans`, `target_spans`, `relation`, `edges` (`source_index`, `target_index`, `relation`). `RelationType`: `one_to_one`, `shift`, `renumber`, `split`, `merge`, `exclude`, `partial`, `complex`, `range`. `complex` and `range` are resolve-time only; they are never stored on `mapping_record`.

**`NavBook`:** `book`, `chapters` (sorted ints). **`NavRef`:** `book`, `chapter`, `verse`, `part`. Jump entries carry display `source_ref` (may be a range) plus `navigation_ref` / `navigation` as a single-verse target legal as `GET /api/resolve` `ref`.

---

## OpenAPI notes

[openapi.json](./openapi.json) is produced by [export-openapi.py](./export-openapi.py) from the FastAPI app (`title` `FRVT Versification Viewer`, `version` `0.1.0`). Relative to live `GET /openapi.json` it:

- Declares `components.securitySchemes.basicAuth` and a document-level `security` requirement (auth is middleware, not a FastAPI `Depends`).
- Sets `servers[0].url` to `http://localhost:8000`.
- Adds `ErrorBody` / `FieldError`, rewrites `422` to that schema, and documents `401` / `429` on every operation (plus `503` on health and `413` on ingest/upload).
- Drops unused `HTTPValidationError` / `ValidationError` schemas.

From the repository root:

```bash
PYTHONPATH=. frvt/.venv/bin/python docs/export-openapi.py
```

`GET /docs` and `GET /redoc` still load the **unpatched** live schema. Try-it-out needs the browser to send Basic credentials.

---

## Settings that change the HTTP surface

| Variable | Default | Effect |
| --- | --- | --- |
| `BASIC_AUTH_USERNAME` | `admin` | Basic user |
| `BASIC_AUTH_PASSWORD` | `Admin123!` | Basic password |
| `BASIC_AUTH_PUBLIC_PATHS` | empty | Path prefixes that skip auth |
| `BASIC_AUTH_FAILURE_LIMIT` | `10` | Failures per IP before `429`; `<= 0` disables |
| `BASIC_AUTH_FAILURE_WINDOW_SECONDS` | `60` | Limiter window; `<= 0` disables |
| `TRUST_PROXY_HEADERS` | `false` | Key the limiter on the rightmost `X-Forwarded-For` hop; enable only behind a trusted proxy |
| `MAX_UPLOAD_BYTES` | `52428800` | Ingest/upload `413` threshold |
| `POSTGRES_*` / `DATABASE_URL` | Compose defaults | Health `503` when unreachable. `DATABASE_URL` overrides the discrete `POSTGRES_*` pieces. |
| `LOG_LEVEL` | `DEBUG` | Batch resolve is noisy at DEBUG |
| `RESOLVE_TRACE_PIVOTS` | `false` | TRACE logs only; response bodies unchanged |
