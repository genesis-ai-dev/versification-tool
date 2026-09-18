# Translation Index API — Manual Test Plan

**Status:** Draft 2026-09-17, v1

**Related:**

- [frvt-12-acceptance-criteria-1.md](./frvt-12-acceptance-criteria-1.md)
- Product API spec: [frvt-12-translation-index-api-spec-1.md](./frvt-12-translation-index-api-spec-1.md) (authoritative for routes and fields)
- [frvt-8-batch-mapping-api-spec-1.md](./completed/frvt-8-batch-mapping-api-spec-1.md) (batch routes that must consume indexes when ready)
- [frvt-3-http-api-spec-1.md](./completed/frvt-3-http-api-spec-1.md) (inherited Basic auth, error envelope, pagination)
- [docs/api.md](../docs/api.md) (live HTTP surface for non-index routes)

---

## 1. Purpose & scope

Happy-path **manual verification** of the translation-index feature: CRUD for translation/versification “indexes”, asynchronous build/rebuild/terminate behavior (including automatic reactions to related data changes), resource-consumption reporting, versification defaulting, and batch-mapping use of ready indexes. A tester who has not read the Python modules should follow the steps with curl and compare JSON to the **active API**. There is no UI for this story.

### In scope / Out of scope

| In scope | Out of scope |
| --- | --- |
| Index CRUD (create, list, get, delete) | Viewer / manage UI |
| Async status; manual rebuild and terminate interacting safely with automatic work | Worker/queue internals, SQL plan shapes |
| Auto terminate / rebuild / cascade when indexes, translations, or versifications change | Exhaustive cartesian matrices beyond a small fixture set |
| Resource consumption fields (e.g. mapping row counts) on an index | Capacity stress of 12 full Bibles × ~1,500 divergent mappings (operational note in AC-1; not a local manual gate) |
| Versification optional on create: preferred, else canonical `org` | Scheme-selector unit tests already covered elsewhere |
| Batch `GET /api/resolve/range` / `POST /api/resolve/verses` use ready indexes for the pair | Batch grammar / pagination / auth matrices → FRVT-8 plan / pytest |
| Local stack correctness for the above | Hard proof of AC-5 “&lt; 1 s in a typical AWS deployment” on Local only — see TC-PERF-01 / open items |

### Verification approach

| Pillar | Application |
| --- | --- |
| **API contract** | Status codes, `{detail, code}` envelope, index resource shape (id, translation, versification, status, resource metrics), collection pagination if the product spec requires it |
| **Values** | After a build reaches ready, indexed pairs used by batch resolve return the same semantic mapping results as a cold resolve (content), with improved latency when indexes are ready (timing) |
| **Auth & authorization** | HTTP Basic; unauthenticated index and control routes are `401` |
| **Async lifecycle** | Status progresses; delete/remove cancels in-flight work; add/update of related entities triggers rebuild without leaving the cartesian product stale |
| **Visual / Accessibility** | Not applicable |
| **Isolation / tenancy** | Not applicable |

### Data sources

| Source | Path | How testers verify |
| --- | --- | --- |
| Sample project zips | [`research/SampleTranslations/`](../research/SampleTranslations/) — at least two distinct projects (e.g. `biblica-spanish-1.zip`, `american-standard-1.zip`) | Ingest via `POST /api/ingest/project`; record translation ids and preferred schemes |
| Canonical schemes | `GET /api/versifications?canonical=true` | `org` / `eng`; org **translation** id is `eng.based_on_id` |
| Batch oracle | `GET /api/resolve/range`, `POST /api/resolve/verses` | Same pair before indexes are ready vs after; compare `items[].ref` / `result` (not only latency) |

### Route map

| Operation | HTTP |
| --- | --- |
| List indexes | `GET /api/indexes` |
| Create index | `POST /api/indexes` body `{ "translation_id": "<uuid>", "versification_id"?: "<uuid>" }` |
| Usage | `GET /api/indexes/usage` |
| Get index | `GET /api/indexes/{index_id}` |
| Change versification | `PATCH /api/indexes/{index_id}` body `{ "versification_id": "<uuid>" }` |
| Delete index | `DELETE /api/indexes/{index_id}` |
| Manual rebuild | `POST /api/indexes/{index_id}/rebuild` |
| Manual terminate | `POST /api/indexes/{index_id}/cancel` |

Status vocabulary: `pending` → `building` → `ready` (success path); `failed` / `cancelled` as needed. Resource metrics on the index are `outbound_mappings` / `inbound_mappings`; aggregate usage is `GET /api/indexes/usage`. Poll get until terminal for the case under test; do not sleep fixed long intervals without a status check.

Companion: [`.test/scripts/run-frvt-12-test-plan.sh`](../.test/scripts/run-frvt-12-test-plan.sh).

### Coverage patterns

UI lifecycle and client uploads **do not apply**. **Content oracle** for indexed batch use is TC-BATCH-01. **End-to-end journey** is TC-SETUP-02 → TC-CRUD-01 → wait ready → TC-BATCH-01. Cartesian maintenance is TC-AUTO-03.

---

## 2. Environments

| Environment | Base URL | Auth | Notes |
| --- | --- | --- | --- |
| **Local** | `http://localhost:8000` | HTTP Basic from `BASIC_AUTH_USERNAME` / `BASIC_AUTH_PASSWORD` (defaults `admin` / `Admin123!`) | Compose Postgres on host **5433**; API from repo root per [README.md](../README.md) |
| **AWS / staging** (optional for AC-5) | Deployed base URL | Same Basic scheme unless deploy docs say otherwise | Required only for TC-PERF-01 sign-off against the “typical AWS deployment” clause |

All **Required** cases run on Local before feature sign-off. TC-PERF-01 is **Required** for AC-5 but may be marked blocked until an AWS/staging environment exists.

**Stop-and-fix:** `GET /api/health` with Basic must return `200` `{"status":"ok"}` before any other case.

**curl auth variables (local):**

```bash
BASE=http://localhost:8000
AUTH_VIEWER='-u admin:Admin123!'
```

Copy individual `curl` lines from the cases below. On FAIL, log method, URL, persona, status, and a short JSON snippet (plus timing for TC-PERF-01).

---

## 3. Test data & fixtures

| Artifact | Purpose |
| --- | --- |
| Two ingested sample projects | Distinct `translation_id`s so cartesian product between indexes is observable |
| Canonical `org` / `eng` | Fallback versification and a stable `to_translation` for batch calls |
| Metadata-only translation (TC-SCHEME-02) | No preferred association → `org` default on index create |

Stable ids are **not** hardcoded. After TC-SETUP-02 record:

| Alias | How obtained |
| --- | --- |
| `T1_ID` | First ingested translation `id` |
| `T2_ID` | Second ingested translation `id` |
| `T1_PREFERRED_ID` | Preferred `scheme_id` for `T1_ID` |
| `T2_PREFERRED_ID` | Preferred `scheme_id` for `T2_ID` |
| `ORG_SCHEME_ID` | Canonical scheme named `org` |
| `ORG_TRANSLATION_ID` | Canonical `eng` scheme `based_on_id` |
| `IDX1_ID` / `IDX2_ID` | Created in feature cases |

**Acceptance criteria legend** — feature case headers use these labels:

| ID | Acceptance criterion |
| --- | --- |
| AC-1 | CRUD list of translation/versification combinations (“indexes”); mappings pre-created as cartesian product among indexed combos |
| AC-1.note | Operational scale note (≤12 full translations; ≤~5% / ~1,500 divergent mappings) — not a Local gate |
| AC-2.1.1 | Indexing terminated when the index or related translation/versification is removed |
| AC-2.1.2 | Indexing rebuilt when the related translation or versification is updated |
| AC-2.1.3 | Indexing rebuilt when other indexes are added (cartesian product) |
| AC-2.2.1 | API exposes indexing status |
| AC-2.2.2 | Manual rebuild and termination safely interact with automatic indexing |
| AC-3.1 | Resource consumption data (e.g. mapping row counts) |
| AC-3.2 | Indexes removed when their configured translation or versification is removed |
| AC-4 | Versification optional on index; preferred if present, else `org` |
| AC-5 | Batch mapping uses ready indexes; &lt;1 s for ~50 verses in typical AWS |

**Illustrative index resource** (fixture/API is authoritative):

```json
{
  "id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  "translation_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  "versification_id": "cccccccc-cccc-cccc-cccc-cccccccccccc",
  "status": "ready",
  "resources": {
    "mapping_row_count": 0
  }
}
```

Field names may differ; assert the documented equivalents for identity, pair, status, and at least one consumption metric.

---

## 4. Global preconditions

| # | Precondition |
| --- | --- |
| P1 | Local API reachable at `$BASE` (TC-SETUP-01) |
| P2 | Valid Basic credentials (`AUTH_VIEWER`) |
| P3 | `curl` and `jq` available |
| P4 | Two sample zips present under `research/SampleTranslations/` |
| P5 | Ids from TC-SETUP-02 recorded (`T1_ID`, `T2_ID`, preferred scheme ids, `ORG_*`) |

---

## 5. Visual references

No UI ships with this story. Do not use Figma, screenshots, or the viewer overlay as oracles.

---

## 6. Enabling flows

### TC-SETUP-01 — Start the local stack

**Covers:** README local run (not a story AC)

| | |
| --- | --- |
| **Preconditions** | Docker; Python venv as in README |

**Steps**

1. From `frvt/`, `docker compose up -d` and wait until Postgres accepts connections on port 5433.
2. Apply migrations if needed (`python -m alembic -c alembic.ini upgrade head`).
3. From the **repository root**, start uvicorn on port 8000 as in the README.

**Expected outcomes**

| # | Outcome |
| --- | --- |
| E1 | Postgres is up; the API process is listening on port 8000 |

---

### TC-AUTH-01 — Establish an API session

**API:** `GET /api/health`  
**Covers:** HTTP API spec §3 / docs auth

| | |
| --- | --- |
| **Preconditions** | P1, P2 |

**Steps**

1. `curl -sS $AUTH_VIEWER "$BASE/api/health"`

**Expected outcomes**

| # | Outcome |
| --- | --- |
| E1 | HTTP `200` |
| E2 | Body is `{"status":"ok"}` |

---

### TC-SETUP-02 — Ingest two sample projects and record pairing ids

**API:** `POST /api/ingest/project`, `GET /api/versifications?canonical=true`, `GET /api/translations/{id}/versifications`  
**Covers:** Enabling data for §7 (ingest contract itself is FRVT-3)

| | |
| --- | --- |
| **Preconditions** | P1–P4, TC-AUTH-01 |

**Steps**

1. Ingest (or reuse by stable name) two projects, e.g. names `frvt-12-index-t1` and `frvt-12-index-t2`, from two different sample zips. Record `T1_ID` and `T2_ID`.
2. `GET /api/versifications?canonical=true&limit=100`. Record `ORG_SCHEME_ID` and `ORG_TRANSLATION_ID` (`eng.based_on_id`).
3. For each translation, `GET /api/translations/{id}/versifications`. Record `T1_PREFERRED_ID` and `T2_PREFERRED_ID`.

**Expected outcomes**

| # | Outcome |
| --- | --- |
| E1 | Both ingests are `201`, or existing rows are reused |
| E2 | All recorded aliases are UUIDs; `T1_ID` ≠ `T2_ID` |
| E3 | Preferred scheme ids are present for both sample translations |

---

## 7. Feature test cases

Run after enabling flows. Default persona: Basic user (`AUTH_VIEWER`). Where status must be `ready`, poll get/list with a short interval until ready or a documented failure — do not proceed on `building`.

### TC-CRUD-01 — Create, list, get, delete an index

**API:** provisional index collection routes  
**Acceptance criteria:** AC-1  
**Covers:** Index CRUD happy path

| | |
| --- | --- |
| **Preconditions** | P5 |

**Steps**

1. `POST` create index for `T1_ID` **without** `versification_id`.
2. `GET` list indexes; locate the new row; record `IDX1_ID`.
3. `GET` index by `IDX1_ID`.
4. Poll until status is `ready` (or product-spec success terminal).
5. `DELETE` `IDX1_ID`, then `GET` by id.

**Expected outcomes**

| # | Outcome |
| --- | --- |
| E1 | Create returns success (`201` or product-spec equivalent) with an id |
| E2 | List includes the index; get returns the same `translation_id` (and resolved `versification_id`) |
| E3 | Status reaches ready without manual rebuild |
| E4 | After delete, get is `404` `not_found` (or list no longer contains the id) |

---

### TC-CRUD-02 — Second index participates in the cartesian product

**API:** provisional index routes; optional inspection of stored mapping pairs if exposed  
**Acceptance criteria:** AC-1; AC-2.1.3  
**Covers:** Mappings pre-created among all indexed combinations

| | |
| --- | --- |
| **Preconditions** | P5; prior indexes from TC-CRUD-01 deleted or a clean pair of ids |

**Steps**

1. Create index for `T1_ID` → `IDX1_ID`; wait ready.
2. Create index for `T2_ID` → `IDX2_ID`; wait ready (expect rebuild activity on the existing index set per AC-2.1.3).
3. Confirm both indexes report ready and resource metrics are non-decreasing vs the single-index state where comparable (e.g. mapping row counts account for pairs involving both indexes).

**Expected outcomes**

| # | Outcome |
| --- | --- |
| E1 | Both creates succeed; both reach ready |
| E2 | After the second create, the system has finished (or re-finished) product work for the **pair** of indexes — status does not remain stuck building indefinitely |
| E3 | Resource metrics on at least one index reflect additional precomputed mappings vs the one-index baseline (exact formula per product spec) |

---

### TC-STATUS-01 — Status is visible while building and when ready

**API:** get/list (or status sub-resource)  
**Acceptance criteria:** AC-2.2.1  

| | |
| --- | --- |
| **Preconditions** | P5 |

**Steps**

1. Create an index for `T1_ID`.
2. Immediately get the index; note `status`.
3. Poll until ready; get again.

**Expected outcomes**

| # | Outcome |
| --- | --- |
| E1 | Early read shows a non-ready in-progress status (e.g. `pending` / `building`) **or** ready if the build finished before the first poll — either is acceptable if the field is always present |
| E2 | Terminal success status is documented and stable on subsequent gets |

---

### TC-RES-01 — Resource consumption data is returned

**API:** get/list (or resources sub-resource)  
**Acceptance criteria:** AC-3.1  

| | |
| --- | --- |
| **Preconditions** | An index in ready state (from TC-CRUD-02 or recreate) |

**Steps**

1. Get the ready index (and/or list entry).

**Expected outcomes**

| # | Outcome |
| --- | --- |
| E1 | Response includes resource consumption data (at minimum a mapping row count or equivalent documented metric) |
| E2 | Metric is a non-negative integer (or documented numeric type); not omitted when ready |

---

### TC-SCHEME-01 — Omit versification; preferred is used

**API:** `POST` create index  
**Acceptance criteria:** AC-4  

| | |
| --- | --- |
| **Preconditions** | P5 |

**Steps**

1. Create index for `T1_ID` with **no** versification field.
2. Get the index; compare `versification_id` to `T1_PREFERRED_ID`.

**Expected outcomes**

| # | Outcome |
| --- | --- |
| E1 | Create succeeds |
| E2 | Stored/echoed versification equals `T1_PREFERRED_ID` |

---

### TC-SCHEME-02 — No preferred association falls back to `org`

**API:** `POST /api/translations`, create index  
**Acceptance criteria:** AC-4  

| | |
| --- | --- |
| **Preconditions** | P1–P3; `ORG_SCHEME_ID` from TC-SETUP-02 |

**Steps**

1. `POST /api/translations` with a unique `name`, `language: "en"`, `source_format: "usx"` (metadata-only; no preferred association).
2. Create index for that translation with **no** versification field.
3. Get the index.

**Expected outcomes**

| # | Outcome |
| --- | --- |
| E1 | Translation create is `201`; index create succeeds (build may yield empty/low metrics) |
| E2 | Index `versification_id` equals `ORG_SCHEME_ID` (canonical **scheme**, not `ORG_TRANSLATION_ID`) |

---

### TC-AUTO-01 — Delete index terminates in-flight indexing

**API:** create, delete, get  
**Acceptance criteria:** AC-2.1.1; AC-2.2.2  

| | |
| --- | --- |
| **Preconditions** | P5 |

**Steps**

1. Create an index for `T1_ID`.
2. While status is still in progress (retry create+delete quickly if the fixture builds too fast), `DELETE` the index.
3. Confirm the index is gone and no orphaned “building” row remains for that id.
4. Optionally create again and confirm a fresh build can reach ready (no stuck global lock).

**Expected outcomes**

| # | Outcome |
| --- | --- |
| E1 | Delete succeeds (`204` or product-spec equivalent) |
| E2 | Subsequent get is `404`; list does not show the id |
| E3 | A later create for the same translation can reach ready |

---

### TC-AUTO-02 — Removing a translation removes its index and stops work

**API:** create index; `DELETE /api/translations/{id}`  
**Acceptance criteria:** AC-2.1.1; AC-3.2  

| | |
| --- | --- |
| **Preconditions** | A disposable ingested or metadata translation with an index (prefer a third ingest or clone name, not `T1`/`T2` if those are needed later) |

**Steps**

1. Create index for the disposable translation; note `IDX_ID` (optionally still building).
2. `DELETE` the translation.
3. Get `IDX_ID`; list indexes.

**Expected outcomes**

| # | Outcome |
| --- | --- |
| E1 | Translation delete succeeds per existing API rules |
| E2 | Index is gone (`404` / absent from list) — not left ready against a missing translation |
| E3 | No continued build errors that leave the API unusable (`GET /api/health` still `200`) |

---

### TC-AUTO-03 — Adding another index rebuilds the cartesian product

**API:** create indexes  
**Acceptance criteria:** AC-2.1.3  

| | |
| --- | --- |
| **Preconditions** | P5; clean slate of indexes for `T1_ID` / `T2_ID` if possible |

**Steps**

1. Create index only for `T1_ID`; wait ready; record resource metric `M1`.
2. Create index for `T2_ID`; observe status on **both** indexes (existing may leave ready briefly then rebuild).
3. Wait until both ready; record metrics again.

**Expected outcomes**

| # | Outcome |
| --- | --- |
| E1 | After step 2, automatic rebuild/maintain work runs (status transition and/or metric change), not only a silent no-op |
| E2 | Both indexes end ready |
| E3 | Metrics are consistent with mappings existing for the indexed set (product-spec formula); at minimum ready state is achieved for the pair |

---

### TC-AUTO-04 — Updating related translation or versification triggers rebuild

**API:** index get; `PATCH` translation and/or versification (or re-ingest/upload that updates stored content per product rules)  
**Acceptance criteria:** AC-2.1.2  

| | |
| --- | --- |
| **Preconditions** | Ready index on `T1_ID` |

**Steps**

1. Record index status and resource metric.
2. Apply an update that the product spec treats as invalidating the index (e.g. patch translation metadata if that triggers rebuild, or replace/update versification ingredient / spans — **follow the product spec**).
3. Get the index; poll until ready again.

**Expected outcomes**

| # | Outcome |
| --- | --- |
| E1 | Status leaves ready into an in-progress state (or equivalently a rebuild generation counter increments) after the update |
| E2 | Index returns to ready without requiring manual rebuild |
| E3 | If the update changed mapping inputs, metrics or batch results reflect the new data |

---

### TC-MANUAL-01 — Manual rebuild while idle

**API:** `POST .../rebuild`  
**Acceptance criteria:** AC-2.2.2  

| | |
| --- | --- |
| **Preconditions** | Ready index `IDX1_ID` |

**Steps**

1. `POST` rebuild for `IDX1_ID`.
2. Poll status until ready.

**Expected outcomes**

| # | Outcome |
| --- | --- |
| E1 | Rebuild accepted (not `409` solely for “already ready”) |
| E2 | Status shows in-progress then ready |
| E3 | Index remains usable for batch resolve afterward |

---

### TC-MANUAL-02 — Manual terminate during build; safe with automatic work

**API:** `POST .../cancel`, create/delete  
**Acceptance criteria:** AC-2.2.2; AC-2.1.1  

| | |
| --- | --- |
| **Preconditions** | P5 |

**Steps**

1. Create an index; while building, `POST` cancel.
2. Confirm status becomes `cancelled` (row remains).
3. Rebuild; confirm progress to ready.
4. Overlap check: start rebuild, then cancel; optionally delete while cancelling — API must not `500`; final state is coherent (`cancelled` or gone, not half-ready).

**Expected outcomes**

| # | Outcome |
| --- | --- |
| E1 | Terminate is accepted during build |
| E2 | No crash; health remains `200` |
| E3 | A subsequent create/rebuild can succeed |

---

### TC-BATCH-01 — Batch mapping uses ready indexes (correctness)

**API:** `GET /api/resolve/range` (and optionally `POST /api/resolve/verses`)  
**Acceptance criteria:** AC-5 (correctness portion); AC-1  

| | |
| --- | --- |
| **Preconditions** | Ready indexes for `T1_ID` and a suitable `to_translation` pair covered by the cartesian product (e.g. `T2_ID` or `ORG_TRANSLATION_ID` per product rules); chapter with ~whole-verse spans (e.g. `JHN 3`) |

**Steps**

1. Before indexes are ready (or with indexes deleted), run `GET /api/resolve/range` for `from_translation=T1_ID`, `to_translation=<paired>`, `from_ref=JHN 3`, `to_ref=JHN 3`, default limit. Save `items` (refs + relation summary).
2. Ensure indexes covering that pair are ready.
3. Repeat the same range request.

**Expected outcomes**

| # | Outcome |
| --- | --- |
| E1 | Both calls are HTTP `200` |
| E2 | `items[].ref` sequences match between cold and indexed runs |
| E3 | For corresponding refs, successful `result.relation` (and span identity at the level the product guarantees) match; indexed path must not change mapping semantics |
| E4 | Response still echoes `from_versification` / `to_versification` per FRVT-8 |

---

### TC-PERF-01 — Indexed batch chapter completes in under one second (AWS)

**API:** `GET /api/resolve/range`  
**Acceptance criteria:** AC-5  
**Environment:** AWS / staging (Local timing is informational only)

| | |
| --- | --- |
| **Preconditions** | Deployed environment; ready indexes for the pair; ~50-verse chapter window |

**Steps**

1. Warm once (discard).
2. Time `GET /api/resolve/range` for an average chapter (~50 verses) between an indexed pair.
3. Record wall time from request start to full body received.

**Expected outcomes**

| # | Outcome |
| --- | --- |
| E1 | HTTP `200` with ~50 items (or `total` ≥ 50 with limit covering the chapter) |
| E2 | Elapsed time **&lt; 1 second** on the typical AWS deployment |
| E3 | If only Local is available, mark this case **blocked** for AC-5 sign-off; do not invent a Local pass |

---

## 8. Negative & edge coverage (representative)

One case per essential failure class. Full matrices stay in automated tests once implemented.

### TC-NEG-01 — Unauthenticated index routes

**API:** index collection and control routes  
**Covers:** Inherited Basic auth (FRVT-11 gate)

| | |
| --- | --- |
| **Preconditions** | P1 |

**Steps**

1. `GET` list, `POST` create (minimal body), and one control route **without** `Authorization`.

**Expected outcomes**

| # | Outcome |
| --- | --- |
| E1 | Each response is `401` with `code` `unauthorized` |

---

### TC-NEG-02 — Unknown translation on create is 404

**API:** `POST` create index  

| | |
| --- | --- |
| **Preconditions** | P2 |

**Steps**

1. Create with `translation_id` a random UUID.

**Expected outcomes**

| # | Outcome |
| --- | --- |
| E1 | `404` `not_found` (not `500`) |

---

### TC-NEG-03 — Unknown versification override is 404

**API:** `POST` create index  

| | |
| --- | --- |
| **Preconditions** | P5 |

**Steps**

1. Create for `T1_ID` with `versification_id` a random UUID.

**Expected outcomes**

| # | Outcome |
| --- | --- |
| E1 | `404` `not_found` |

---

### TC-NEG-04 — Duplicate index for the same pair is conflict (or idempotent)

**API:** `POST` create index twice  

| | |
| --- | --- |
| **Preconditions** | Ready or existing index for `T1_ID` + its resolved versification |

**Steps**

1. Create the same translation/versification pair again.

**Expected outcomes**

| # | Outcome |
| --- | --- |
| E1 | `409` `conflict` |
| E2 | Must not create two distinct ready rows for the identical pair |

---

### TC-NEG-05 — Manual rebuild/cancel on unknown id is 404

**API:** rebuild / cancel  

| | |
| --- | --- |
| **Preconditions** | P2 |

**Steps**

1. Rebuild and cancel with a random index UUID.

**Expected outcomes**

| # | Outcome |
| --- | --- |
| E1 | Each is `404` `not_found` |

---

## 9. Execution checklist

| Order | Case | Local | AWS (if avail.) |
| --- | --- | :---: | :---: |
| 1 | TC-SETUP-01 | ☐ | — |
| 2 | TC-AUTH-01 | ☐ | — |
| 3 | TC-SETUP-02 | ☐ | — |
| 4 | TC-CRUD-01 | ☐ | — |
| 5 | TC-CRUD-02 | ☐ | — |
| 6 | TC-STATUS-01 | ☐ | — |
| 7 | TC-RES-01 | ☐ | — |
| 8 | TC-SCHEME-01 | ☐ | — |
| 9 | TC-SCHEME-02 | ☐ | — |
| 10 | TC-AUTO-01 | ☐ | — |
| 11 | TC-AUTO-02 | ☐ | — |
| 12 | TC-AUTO-03 | ☐ | — |
| 13 | TC-AUTO-04 | ☐ | — |
| 14 | TC-MANUAL-01 | ☐ | — |
| 15 | TC-MANUAL-02 | ☐ | — |
| 16 | TC-BATCH-01 | ☐ | — |
| 17 | TC-PERF-01 | ☐ info only | ☐ |
| 18 | TC-NEG-01 | ☐ | — |
| 19 | TC-NEG-02 | ☐ | — |
| 20 | TC-NEG-03 | ☐ | — |
| 21 | TC-NEG-04 | ☐ | — |
| 22 | TC-NEG-05 | ☐ | — |

**Sign-off:** All Required Local cases pass. AC-5 additionally requires TC-PERF-01 on AWS/staging. Log defects with HTTP method, URL, persona, status, JSON snippet, and elapsed ms when timing-related.

---

## 10. Traceability

Story AC are on case headers in §6–8 and the legend in §3.

| Acceptance criterion | Test cases |
| --- | --- |
| AC-1 CRUD + cartesian product | TC-CRUD-01, TC-CRUD-02, TC-BATCH-01 |
| AC-1.note scale ceilings | Out of scope for Local manual gate; document in product/ops guidance |
| AC-2.1.1 terminate on remove | TC-AUTO-01, TC-AUTO-02, TC-MANUAL-02 |
| AC-2.1.2 rebuild on update | TC-AUTO-04 |
| AC-2.1.3 rebuild when indexes added | TC-CRUD-02, TC-AUTO-03 |
| AC-2.2.1 status | TC-STATUS-01 |
| AC-2.2.2 manual rebuild/terminate | TC-MANUAL-01, TC-MANUAL-02, TC-AUTO-01 |
| AC-3.1 resource data | TC-RES-01 |
| AC-3.2 cascade delete with translation/versification | TC-AUTO-02 |
| AC-4 versification defaulting | TC-SCHEME-01, TC-SCHEME-02 |
| AC-5 indexed batch + latency | TC-BATCH-01, TC-PERF-01 |
| Auth inherited | TC-AUTH-01, TC-NEG-01 |
| Representative failures | TC-NEG-02 through TC-NEG-05 |

---

## 11. Open items

Listed items do **not** block drafting the plan.

| Item | Type | Handling |
| --- | --- | --- |
| Status enum and resource payload | Locked | `pending`/`building`/`ready`/`failed`/`cancelled`; `outbound_mappings`/`inbound_mappings` plus `GET /api/indexes/usage` |
| Which translation/versification updates invalidate an index | Locked | Rename/language on a translation; rename or mapping rebuild on a versification; fingerprint sweep for chain changes |
| Duplicate create behavior | Locked | `409` `conflict` |
| AC-1 scale ceilings (12 translations / ~5% divergence) | Out of scope | Operational note; not Local checklist items |
| AC-5 AWS “typical deployment” | Environment | TC-PERF-01 required for AC-5; Local times are informational |
| Companion shell script | Done | [`.test/scripts/run-frvt-12-test-plan.sh`](../.test/scripts/run-frvt-12-test-plan.sh) |
| Automated pytest matrix | Deferred | Prefer happy paths + essential failures per testing standards once implemented |
