# FRVT-3 Test Plan — API & Ingest

**Document:** `frvt-3-test-plan-api-and-ingest-1`
**Parent index:** [frvt-3-test-plan-1.md](./frvt-3-test-plan-1.md)
**Areas:** API errors / pagination / CRUD (`API`), ingest / ETL (`INGEST`)

Shared setup, fixtures, and the traceability matrix live in the [parent index](./frvt-3-test-plan-1.md). Fixture paths (sample project zip, Copenhagen JSON, Paratext VRS, malformed zips) are defined there under **Test Data, Fixtures & Environment**. Direct ETL/Python parse-convert cases are **Optional (CI/CD / Automation candidate)**; HTTP ingest/API cases are **Required**.

---

## API errors, pagination, CRUD (`API`)

### TC-API-001 — Translation create / list / patch / delete lifecycle

- **Level:** integration · **Priority:** Required · **Category:** functional · **Traces:** REQ-030, REQ-031, REQ-032, REQ-033, REQ-034
- **Preconditions:**
  - Authenticated client; seeded database.
- **Steps:**
  1. `POST /api/translations` with a metadata-only body (unique name + language).
  2. `GET /api/translations` and locate the new item.
  3. `PATCH` the translation to rename it.
  4. `DELETE` the translation.
  5. Inspect spans, associations, and schemes for the deleted translation.
- **Expected result:**
  - `POST` returns `201`; `PATCH` returns `200`; `DELETE` returns `204`.
  - The list excludes anchor translations and includes the created one before deletion.
  - Delete cascades the translation's spans and associations but does **not** delete the associated schemes.

### TC-API-002 — Spans returned by book/chapter ordered by seq

- **Level:** integration · **Priority:** Required · **Category:** functional · **Traces:** REQ-035, REQ-036
- **Preconditions:**
  - A translation ingested from a project zip with spans persisted.
- **Steps:**
  1. `GET /api/translations/{id}/spans?book=<book>&chapter=<n>` for a known populated chapter.
  2. Repeat with a book code that does not exist in the translation.
- **Expected result:**
  - The populated request returns spans ordered ascending by `seq`.
  - The unknown-book request returns an empty list (`[]`), not an error.

### TC-API-003 — Versification list / detail / rename contracts

- **Level:** integration · **Priority:** Required · **Category:** functional · **Traces:** REQ-040, REQ-041
- **Preconditions:**
  - At least one uploaded (non-canonical) scheme exists.
- **Steps:**
  1. `GET /api/versifications` (list).
  2. `GET /api/versifications/{id}` (detail).
  3. `PATCH /api/versifications/{id}` to rename.
- **Expected result:**
  - The list response omits the heavy `ingredient` payload; the detail response includes it.
  - `PATCH` renames the scheme and returns the updated record (per server §7.5).

### TC-API-004 — Associate schemes and set preferred atomically

- **Level:** integration · **Priority:** Required · **Category:** data-integrity · **Traces:** REQ-045, REQ-046, REQ-047
- **Preconditions:**
  - One translation and two schemes (A and B) available to associate.
- **Steps:**
  1. `POST` to associate scheme A, then scheme B, to the translation.
  2. `PUT` preferred = A, then `PUT` preferred = B.
  3. Attempt `PUT` preferred for a scheme that is **not** associated.
- **Expected result:**
  - Each associate returns `201`; a duplicate associate returns `409`.
  - After setting B preferred, only B is marked preferred and A's preferred flag is cleared in the same operation.
  - Setting preferred for an unassociated scheme returns `409`.

### TC-API-005 — Pagination defaults, max, and bare nested arrays

- **Level:** integration · **Priority:** Required · **Category:** boundary · **Traces:** REQ-025, REQ-027
- **Preconditions:**
  - At least two user translations exist.
- **Steps:**
  1. `GET /api/translations` with no pagination params.
  2. `GET /api/translations?limit=500`.
  3. Inspect a nested association/navigation list endpoint response shape.
- **Expected result:**
  - Top-level list responses return `{items, total}` with default limit applied (per server §7.1).
  - `limit=500` is accepted.
  - Nested association/navigation endpoints return bare arrays (not wrapped in `{items,total}`).

### TC-API-010 — Error envelope vocabulary and status mapping

- **Level:** integration · **Priority:** Required · **Category:** error-handling · **Traces:** REQ-022, REQ-023, REQ-024
- **Preconditions:**
  - Authenticated client; ability to provoke each error class.
- **Steps:**
  1. Provoke each of `400`, `401`, `404`, `409`, `413`, `422`, `500`, `503` responses.
  2. Inspect each body.
- **Expected result:**
  - Every error body is `{detail, code}`, with `errors[]` present only for validation-style failures.
  - Every `code` comes from the fixed vocabulary and each HTTP status maps to the specified code (server §5.4).

### TC-API-011 — Duplicate translation name conflicts

- **Level:** integration · **Priority:** Required · **Category:** invalid-input · **Traces:** REQ-031
- **Preconditions:**
  - A translation named e.g. `Demo` already exists.
- **Steps:**
  1. `POST /api/translations` with the same name in different case (e.g. `demo`).
- **Expected result:**
  - Response is `409` with `code = "conflict"` (name uniqueness is case-insensitive).

### TC-API-012 — Deleting a translation used as based_on is blocked

- **Level:** integration · **Priority:** Required · **Category:** data-integrity · **Traces:** REQ-033
- **Preconditions:**
  - A translation that is referenced as the `based_on` for some scheme.
- **Steps:**
  1. `DELETE` that translation.
- **Expected result:**
  - Response is `409` (referential integrity prevents deletion).

### TC-API-013 — Deleting the preferred association is blocked

- **Level:** integration · **Priority:** Required · **Category:** data-integrity · **Traces:** REQ-048
- **Preconditions:**
  - A translation with a preferred association and at least one non-preferred association.
- **Steps:**
  1. `DELETE` the preferred association.
  2. `DELETE` a non-preferred association.
- **Expected result:**
  - Deleting the preferred association returns `409`.
  - Deleting a non-preferred association returns `204`.

### TC-API-014 — Deleting an associated scheme is blocked

- **Level:** integration · **Priority:** Required · **Category:** data-integrity · **Traces:** REQ-043
- **Preconditions:**
  - A scheme that is still associated with at least one translation.
- **Steps:**
  1. `DELETE /api/versifications/{id}` for that scheme.
- **Expected result:**
  - Response is `409` (unassociate first; deleting an unassociated scheme returns `204`, covered by TC-MANAGE-002).

### TC-API-015 — Schemes cannot be created by plain POST

- **Level:** integration · **Priority:** Required · **Category:** out-of-scope-confirmation · **Traces:** REQ-044
- **Preconditions:**
  - Authenticated client.
- **Steps:**
  1. `POST /api/versifications` with a JSON scheme body (no file upload).
- **Expected result:**
  - The request is not supported (`404`/`405`/rejected). Schemes are created only via the upload/ingest endpoints.

### TC-API-016 — Pagination limit above the maximum is rejected

- **Level:** integration · **Priority:** Required · **Category:** boundary · **Traces:** REQ-026
- **Preconditions:**
  - Authenticated client.
- **Steps:**
  1. `GET /api/translations?limit=501`.
- **Expected result:**
  - The request is rejected, not silently clamped (server §7.1 sets `max 500` with no clamp behavior).
  - Status is `422` when the bound is enforced as a FastAPI query constraint (server §5.4: "FastAPI also emits `422` for request-model validation"); `400` `bad_request` is acceptable only if the team hand-validates the bound (server §5.4: "bad query parameter"). See risk R-10.

### TC-API-017 — Unknown translation id on CRUD returns 404

- **Level:** integration · **Priority:** Required · **Category:** error-handling · **Traces:** REQ-032
- **Preconditions:**
  - Authenticated client; a random UUID not present in the database.
- **Steps:**
  1. `GET`, `PATCH`, and `DELETE` `/api/translations/{random-uuid}`.
- **Expected result:**
  - Each returns `404` with the appropriate error envelope.

---

## Ingest / ETL (`INGEST`)

### TC-INGEST-001 — Project zip ingest happy path

- **Level:** integration · **Priority:** Required · **Category:** functional · **Traces:** REQ-050, REQ-053, REQ-054
- **Preconditions:**
  - The sample project zip fixture (contains `release/USX_*` and a `.vrs`).
- **Steps:**
  1. `POST /api/ingest/project` (multipart) with a name, language, and the zip file.
  2. Inspect the created translation, its scheme, and persisted spans.
- **Expected result:**
  - Response is `201`.
  - A translation and its scheme are created, with that scheme set preferred by default.
  - Verse spans are persisted; `source_format` is inferred server-side (client does not supply it).

### TC-INGEST-002 — Standalone VRS upload

- **Level:** integration · **Priority:** Required · **Category:** functional · **Traces:** REQ-055, REQ-056
- **Preconditions:**
  - A Paratext `eng.vrs` fixture.
- **Steps:**
  1. `POST /api/versifications/upload` with the `.vrs` file.
- **Expected result:**
  - Response is `201` creating an **unassociated** scheme.
  - `basedOn` defaults to `org` when absent; `canonical = false`.

### TC-INGEST-003 — Copenhagen JSON upload

- **Level:** integration · **Priority:** Required · **Category:** functional · **Traces:** REQ-055
- **Preconditions:**
  - The `validated.json` Copenhagen ingredient fixture.
- **Steps:**
  1. Upload the JSON via the versification upload endpoint.
- **Expected result:**
  - A scheme is created and the ingredient validates against the schema.

### TC-INGEST-004 — VRS conversion contract (resolver T8)

- **Level:** unit · **Priority:** Optional (CI/CD / Automation candidate) · **Category:** functional · **Traces:** REQ-070
- **Preconditions:**
  - The `eng.vrs` fixture; direct access to the ETL conversion function.
- **Steps:**
  1. Convert `eng.vrs` in the ETL layer.
- **Expected result:**
  - The converted ingredient has `maxVerses` for `GEN` chapter 1 equal to `31`.
  - A mapped record for `GEN 31:55` is present (matching resolver §10 T8).

### TC-INGEST-005 — USX parse contract (resolver T9)

- **Level:** unit/integration · **Priority:** Optional (CI/CD / Automation candidate) · **Category:** functional · **Traces:** REQ-071
- **Preconditions:**
  - A sample USX tree from the project fixture.
- **Steps:**
  1. Parse the USX tree in the ETL layer.
- **Expected result:**
  - Parsed spans have monotonically increasing `seq`.
  - At least one book has verse 1 content present.

### TC-INGEST-006 — Derive mapping records (resolver T7/T13)

- **Level:** unit · **Priority:** Optional (CI/CD / Automation candidate) · **Category:** functional · **Traces:** REQ-072, REQ-073, REQ-074
- **Preconditions:**
  - The `eng` ingredient; direct access to `derive_mapping_records`.
- **Steps:**
  1. Call `derive_mapping_records` on the ingredient.
  2. Inspect row counts and specific rows (PSA 3:0–8; a partial-verse ref).
- **Expected result:**
  - Row counts match mapped + excluded + merged + partial groupings.
  - PSA 3:0–8 produces a shift classification (Interim `classify_mapped`).
  - Partial-verse refs are stored as plain BCV plus a separate `part` column (no part suffix inside the ref string).

### TC-INGEST-007 — ETL ingest/derive functions are pure (no DB writes)

- **Level:** unit · **Priority:** Optional (CI/CD / Automation candidate) · **Category:** functional · **Traces:** REQ-057
- **Preconditions:**
  - Direct access to the ETL module; no DB session passed.
- **Steps:**
  1. Call the ingest/derive functions without a database session.
- **Expected result:**
  - No commit or persistence occurs; the functions return DTOs and `IngestIssue`s only.

### TC-INGEST-010 — Project zip missing the USX tree is rejected

- **Level:** integration · **Priority:** Required · **Category:** invalid-input · **Traces:** REQ-051, REQ-058
- **Preconditions:**
  - A malformed zip with no `release/USX_*` directory.
- **Steps:**
  1. `POST /api/ingest/project` with the malformed zip.
  2. Inspect the database afterward.
- **Expected result:**
  - Response is `400` reporting the missing USX (IngestIssue "missing").
  - Nothing is persisted (all-or-nothing).

### TC-INGEST-011 — Project zip missing the .vrs is rejected

- **Level:** integration · **Priority:** Required · **Category:** invalid-input · **Traces:** REQ-051, REQ-058
- **Preconditions:**
  - A zip containing USX but no `.vrs`.
- **Steps:**
  1. `POST /api/ingest/project` with that zip.
  2. Inspect the database afterward.
- **Expected result:**
  - Response is `400` reporting the missing versification.
  - Nothing is persisted.

### TC-INGEST-012 — Invalid ingredient upload is rejected

- **Level:** integration · **Priority:** Required · **Category:** invalid-input · **Traces:** REQ-052, REQ-059
- **Preconditions:**
  - A JSON ingredient that violates the schema.
- **Steps:**
  1. Upload the invalid ingredient.
  2. Inspect the database afterward.
- **Expected result:**
  - Response is `422` with `code = "validation_failed"` and a populated `errors[]`.
  - Nothing is persisted.

### TC-INGEST-013 — Oversize upload is rejected

- **Level:** integration · **Priority:** Required · **Category:** boundary · **Traces:** REQ-060
- **Preconditions:**
  - A file larger than `MAX_UPLOAD_BYTES`.
- **Steps:**
  1. Attempt both a project ingest and a standalone versification upload with the oversize file.
- **Expected result:**
  - Each returns `413` with `code = "payload_too_large"`.

### TC-INGEST-014 — USX comma-separated verses (Interim binding)

- **Level:** unit · **Priority:** Optional (CI/CD / Automation candidate) · **Category:** boundary · **Traces:** REQ-075
- **Preconditions:**
  - A USX fragment containing a verse marker like `"6,7"`.
- **Steps:**
  1. Parse the fragment.
- **Expected result:**
  - Two spans are produced; the full text attaches to the first, and the subsequent span's content is empty (Interim binding, resolver §8.4).

### TC-INGEST-015 — USX notes are dropped

- **Level:** unit · **Priority:** Optional (CI/CD / Automation candidate) · **Category:** functional · **Traces:** REQ-076
- **Preconditions:**
  - A USX fragment containing a `<note>` element.
- **Steps:**
  1. Parse the fragment.
- **Expected result:**
  - The note text does not appear in the extracted verse content.

### TC-INGEST-016 — Unsupported VRS construct fails closed

- **Level:** unit · **Priority:** Optional (CI/CD / Automation candidate) · **Category:** error-handling · **Traces:** REQ-077
- **Preconditions:**
  - A `.vrs` containing a construct the converter does not support.
- **Steps:**
  1. Convert the `.vrs` in the ETL layer.
- **Expected result:**
  - The converter raises/returns an `IngestIssue` of type "invalid" and rejects the input (no silent partial acceptance).

### TC-INGEST-017 — USFM-only project path (convert or fail closed)

- **Level:** integration · **Priority:** Required · **Category:** functional · **Traces:** REQ-078
- **Preconditions:**
  - A USFM-only project (or a stubbed converter, per owner decision Q-03).
- **Steps:**
  1. Ingest the USFM-only project.
  2. Inspect the result and the database.
- **Expected result:**
  - Either USFM is converted to USX and follows the normal path, **or** ingest fails with a clear ingest failure.
  - There is never a silent partial persist.

### TC-INGEST-018 — UI blocks during upload and surfaces upload errors inline

- **Level:** e2e · **Priority:** Required · **Category:** nfr · **Traces:** REQ-061, REQ-062
- **Preconditions:**
  - The viewer/manage UI in an empty or manage state; the project upload modal available.
- **Steps:**
  1. Start a project upload and observe the UI while the request is in flight.
  2. Repeat with inputs that trigger `413` and `422` responses.
- **Expected result:**
  - The UI is blocked (busy/disabled) until the synchronous ingest response returns.
  - `413`/`422` errors (including `errors[]`) are surfaced inline within the upload modal.
