# Batch Mapping API — Manual Test Plan

**Status:** Draft 2026-09-10, v1

**Related:**

- [frvt-8-acceptance-criteria-1.md](./frvt-8-acceptance-criteria-1.md)
- [frvt-8-batch-mapping-api-spec-1.md](./frvt-8-batch-mapping-api-spec-1.md) (oracle for request/response and status codes)
- [frvt-3-http-api-spec-1.md](./frvt-3-http-api-spec-1.md) (inherited Basic auth, error envelope, pagination)
- [`.test/scripts/run-frvt-8-test-plan.sh`](../.test/scripts/run-frvt-8-test-plan.sh) (executable companion)

---

## 1. Purpose & scope

This plan is happy-path **manual verification** of the two batch verse-mapping endpoints an integrator will call: `GET /api/resolve/range` and `POST /api/resolve/verses`. A tester who has not read the Python modules should be able to follow the steps with curl (or the companion script) and compare JSON to the **active API** plus the sample project zip / spans oracle. There is no UI for this story.

### In scope / Out of scope

| In scope | Out of scope (automated coverage when applicable) |
| --- | --- |
| HTTP happy paths for range (including partial `BOOK` / `BOOK C` / `BOOK C:V` bounds) and verse set | Parser internals, scheme-selector unit tests, hoisted `ResolvePath` equality → pytest (`test_verse_range.py`, `test_scheme_select.py`, `test_resolver_port_enrich.py`) |
| Optional versification: preferred default and canonical `org` fallback, echoed in the response | TypeScript client, viewer/manage UI, visual overlay |
| Representative HTTP failures: `401`, `400`, `404`, `409`, `422` | Exhaustive grammar matrices, `limit=0`/`501` combinatorics, cycle vs no-ancestor matrices → pytest (`test_api_resolve_batch.py`, `test_resolve_batch.py`) |
| Content check: range `items[].ref` vs stored spans for one chapter | Combined-milestone same-`result` payload → pytest `test_combined_milestone_constituents_share_result` |
| Local stack | Staging/AWS (not specified for this story) |
| | Sub-verse `part` on batch routes; scheme-to-scheme mapping without translation ids; emit-once alignment dedupe; performance / DEBUG-log volume |

### Verification approach

| Pillar | Application |
| --- | --- |
| **API contract** | Status codes, `{detail, code}` envelope, `BatchResolveOut` keys (`items`, `total`, `from_versification`, `to_versification`), pagination `limit`/`offset` |
| **Values** | Range member `ref` values compared to `GET /api/translations/{id}/spans` for the same book/chapter. Sample JSON in this plan is **illustrative** only |
| **Auth & authorization** | HTTP Basic; unauthenticated requests are `401` |
| **Visual** | Not applicable (no UI in this story) |
| **Accessibility** | Not applicable |
| **Isolation / tenancy** | Not applicable (no tenant boundary) |

### Data sources

| Source | Path | How testers verify |
| --- | --- | --- |
| Sample project zip | [`research/SampleTranslations/biblica-spanish-1.zip`](../research/SampleTranslations/biblica-spanish-1.zip) | Ingest via `POST /api/ingest/project`; expected range members come from **spans API**, not from unzipping USX by hand |
| Canonical schemes | `GET /api/versifications?canonical=true` | Open the JSON; `org` and `eng` rows. Org **translation** id is `eng.based_on_id` (anchors are omitted from `GET /api/translations`) |
| Stored spans (oracle) | `GET /api/translations/{id}/spans?book=JHN&chapter=3` | Whole-verse rows (`part` null) formatted as `BOOK C:V` in `seq` order |

### Automated coverage reference

| Area | Automated suite | Manual plan defers |
| --- | --- | --- |
| Partial-ref parse / reversed window | `frvt/tests/test_verse_range.py` | Token-level grammar |
| `org` selector vs existing `409` | `frvt/tests/test_scheme_select.py` | Private `batch_scheme_ref` / `selected_scheme_ref` |
| Stored-range expansion, combined milestones, set order/duplicates | `frvt/tests/test_resolve_batch.py` | SQL expansion and driver slicing |
| HTTP envelopes for both routes | `frvt/tests/test_api_resolve_batch.py` | Full status matrix including empty/`refs` length 501 |
| Hoisted resolve path | `frvt/tests/test_resolver_port_enrich.py` | Chain reuse internals |

### Coverage patterns

UI lifecycle, association-graph manage flows, session persistence, overlay topology, import scale/formula, and client-authored uploads **do not apply** to this API-only story (Out of scope). **Content oracle** is TC-RANGE-01. **End-to-end journey** is TC-SETUP-02 then TC-RANGE-01 / TC-SET-01.

---

## 2. Environments

| Environment | Base URL | Auth | Notes |
| --- | --- | --- | --- |
| **Local** | `http://localhost:8000` | HTTP Basic from `BASIC_AUTH_USERNAME` / `BASIC_AUTH_PASSWORD` (defaults `admin` / `Admin123!`) | Compose Postgres on host **5433**; API started from repo root per [README.md](../README.md) |

All cases run on **every** listed environment before sign-off (Local only in this revision).

**Stop-and-fix:** `GET /api/health` with Basic must return `200` `{"status":"ok"}` before any other case. If the process is down, start it; do not continue.

**curl auth variables (local):**

```bash
BASE=http://localhost:8000
AUTH_VIEWER='-u admin:Admin123!'
# Companion also accepts FRVT_BASE_URL and FRVT_BASIC_AUTH
```

**Executable companion:** After TC-SETUP-01, from the repo root:

```bash
./.test/scripts/run-frvt-8-test-plan.sh
# read-only after a previous ingest:
./.test/scripts/run-frvt-8-test-plan.sh --skip-mutations
```

Copy individual `curl` lines from the cases below to vary query parameters. Markdown remains the QA plan; the script does not replace pytest. On FAIL, paste stdout and stderr to an investigator — **stderr** holds the comparison that failed.

---

## 3. Test data & fixtures

| Artifact | Purpose |
| --- | --- |
| `biblica-spanish-1.zip` | From-translation with stored USX spans and a preferred scheme from the project `.vrs` |
| Canonical `org` / `eng` | Bootstrap seed; `eng.based_on_id` is the org **translation** used as `to_translation` |
| Metadata-only translation (created in TC-SCHEME-02) | No preferred association, so the `org` fallback is observable |

Stable ids are **not** hardcoded. After TC-SETUP-02 record:

| Alias | How obtained |
| --- | --- |
| `FROM_ID` | Ingested translation `id` |
| `ORG_TRANSLATION_ID` | Canonical `eng` scheme `based_on_id` |
| `ORG_SCHEME_ID` | Canonical scheme named `org` |
| `PREFERRED_ID` | `GET /api/translations/{FROM_ID}/versifications` → the row with `preferred: true` → `scheme_id` |
| `LXX_ID` | Canonical scheme named `lxx` (unassociated with the sample translation) |

**Acceptance criteria legend** — every feature case header uses these labels:

| ID | Acceptance criterion |
| --- | --- |
| AC-1.1 | Range of verses identified by from/to BCV |
| AC-1.1.2 | Partials: book, chapter, and verse bounds |
| AC-1.2 | Set of verse IDs |
| AC-2 | Versification is an optional mapping parameter |
| AC-2.1 | Default to the translation’s preferred versification, if present |
| AC-2.2 | Otherwise default to the original Hebrew/Greek (`org`) versification |

**Illustrative sample** (`BatchResolveOut` shape; fixture/API is authoritative):

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

Exactly one of `result` / `error` is non-null on each item; both keys are always present.

---

## 4. Global preconditions

| # | Precondition |
| --- | --- |
| P1 | Local API reachable at `$BASE` (TC-SETUP-01) |
| P2 | Valid Basic credentials (`AUTH_VIEWER`) |
| P3 | `curl` and `jq` available |
| P4 | Sample zip at `research/SampleTranslations/biblica-spanish-1.zip` |
| P5 | Ids from TC-SETUP-02 recorded (`FROM_ID`, `ORG_TRANSLATION_ID`, `ORG_SCHEME_ID`, `PREFERRED_ID`, `LXX_ID`) |

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
**Covers:** [frvt-3-http-api-spec-1.md](./frvt-3-http-api-spec-1.md) §3

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

### TC-SETUP-02 — Ingest the sample project and record pairing ids

**API:** `POST /api/ingest/project`, `GET /api/versifications?canonical=true`, `GET /api/translations/{id}/versifications`  
**Covers:** Enabling data for §7 (ingest contract itself is FRVT-3)

| | |
| --- | --- |
| **Preconditions** | P1–P4, TC-AUTH-01 |

**Steps**

1. If a translation named `frvt-8-batch-sample` already exists in `GET /api/translations?limit=500`, reuse its `id` as `FROM_ID`. Otherwise `POST /api/ingest/project` multipart with `file=@research/SampleTranslations/biblica-spanish-1.zip`, `name=frvt-8-batch-sample`, `language=es`.
2. `GET /api/versifications?canonical=true&limit=100`. Record `ORG_SCHEME_ID` (name `org`), `LXX_ID` (name `lxx`), and `ORG_TRANSLATION_ID` from the `eng` row’s `based_on_id`.
3. `GET /api/translations/{FROM_ID}/versifications`. Record `PREFERRED_ID` from the preferred association.

**Expected outcomes**

| # | Outcome |
| --- | --- |
| E1 | Ingest is `201`, or an existing row is reused |
| E2 | `FROM_ID`, `ORG_TRANSLATION_ID`, `ORG_SCHEME_ID`, `PREFERRED_ID`, and `LXX_ID` are all UUIDs |
| E3 | Canonical `org` scheme id is **not** confused with `ORG_TRANSLATION_ID` (scheme vs translation) |

---

## 7. Feature test cases

Run after enabling flows. Default persona: Basic user (`AUTH_VIEWER`).

### TC-RANGE-01 — Chapter range maps stored verses

**API:** `GET /api/resolve/range`  
**Acceptance criteria:** AC-1.1 — Range of verses identified by from/to BCV; AC-1.1.2 — Partials: book, chapter, and verse bounds  
**Covers:** Batch spec §3, §3.1 (`BOOK C`), §3.2 (stored spans, not `maxVerses`)

| | |
| --- | --- |
| **Preconditions** | P5 |

**Steps**

1. `GET /api/translations/{FROM_ID}/spans?book=JHN&chapter=3&limit=500`. Build the ordered list of whole-verse refs (`part` is JSON `null`) as `JHN 3:{verse}`.
2. `GET /api/resolve/range` with `from_translation=FROM_ID`, `to_translation=ORG_TRANSLATION_ID`, `from_ref=JHN 3`, `to_ref=JHN 3` (omit versification overrides).

**Expected outcomes**

| # | Outcome |
| --- | --- |
| E1 | HTTP `200` |
| E2 | Each `items[].ref` is `JHN 3:…` in chapter/verse order; `total` equals the unsliced expansion size (`>= len(items)` if paged; with default limit, `len(items)` equals `total` when the chapter is ≤ 100 verses) |
| E3 | Whole-verse span refs from step 1 appear in `items[].ref` (content oracle). Do not treat `total` alone as success |
| E4 | Each successful item has `result` non-null and `error` null |
| E5 | `from_versification` and `to_versification` are UUIDs |

---

### TC-RANGE-02 — Book and verse partial bounds

**API:** `GET /api/resolve/range`  
**Acceptance criteria:** AC-1.1.2 — Partials: book, chapter, and verse bounds  
**Covers:** Batch spec §3.1

| | |
| --- | --- |
| **Preconditions** | P5 |

**Steps**

1. `GET /api/resolve/range` with `from_ref=JHN`, `to_ref=JHN 3`, `limit=5` (book start through last stored verse of John 3).
2. `GET /api/resolve/range` with `from_ref=JHN 3:1`, `to_ref=JHN 3:5`.

**Expected outcomes**

| # | Outcome |
| --- | --- |
| E1 | Both calls are HTTP `200` |
| E2 | Step 1: `total` is greater than 5; `items` length is 5; refs stay in John and do not jump to a later book |
| E3 | Step 2: first `items[].ref` is `JHN 3:1`; last is `JHN 3:5`; neighbors outside that closed interval are absent |

---

### TC-RANGE-03 — Range pagination

**API:** `GET /api/resolve/range`  
**Acceptance criteria:** AC-1.1 — Range of verses identified by from/to BCV  
**Covers:** Batch spec §3 `limit`/`offset`; HTTP API spec §5

| | |
| --- | --- |
| **Preconditions** | P5 |

**Steps**

1. Repeat TC-RANGE-01’s range request with `limit=2` and `offset=1`.

**Expected outcomes**

| # | Outcome |
| --- | --- |
| E1 | HTTP `200`; `items` length is 2 |
| E2 | `total` is the **full** chapter expansion (same as TC-RANGE-01 `total`), not 2 |
| E3 | Both item refs start with `JHN 3:` |

---

### TC-SET-01 — Explicit verse list in request order

**API:** `POST /api/resolve/verses`  
**Acceptance criteria:** AC-1.2 — Set of verse IDs  
**Covers:** Batch spec §4

| | |
| --- | --- |
| **Preconditions** | P5 |

**Steps**

1. From the spans oracle (TC-RANGE-01 step 1), take three whole-verse refs. Duplicate the first so the body is `[refA, refB, refA]`.
2. `POST /api/resolve/verses` with JSON `from_translation`, `to_translation`, `refs` (no versification fields).

**Expected outcomes**

| # | Outcome |
| --- | --- |
| E1 | HTTP `200` |
| E2 | `items[].ref` equals the submitted list **including the duplicate**; `total` is 3 |
| E3 | Successful members have `result` set and `error` null |

---

### TC-SET-02 — Malformed member stays HTTP 200

**API:** `POST /api/resolve/verses`  
**Acceptance criteria:** AC-1.2 — Set of verse IDs  
**Covers:** Batch spec §2 (per-verse `error`), §4

| | |
| --- | --- |
| **Preconditions** | P5 |

**Steps**

1. `POST /api/resolve/verses` with `refs` = one valid span ref from John 3 and `GEN 1:1a`.

**Expected outcomes**

| # | Outcome |
| --- | --- |
| E1 | HTTP `200` (not `400`) |
| E2 | Two items; the valid ref has `result` and `error: null`; `GEN 1:1a` has `result: null` and `error.code` `bad_request` |

---

### TC-SCHEME-01 — Omit versification; preferred is used

**API:** `GET /api/resolve/range`  
**Acceptance criteria:** AC-2 — Versification is an optional mapping parameter; AC-2.1 — Default to the translation’s preferred versification, if present  
**Covers:** Batch spec §5 steps 2

| | |
| --- | --- |
| **Preconditions** | P5 |

**Steps**

1. `GET /api/resolve/range` for `JHN 3`→`JHN 3` with **no** `from_versification` or `to_versification`.
2. Compare `from_versification` to `PREFERRED_ID` from TC-SETUP-02.

**Expected outcomes**

| # | Outcome |
| --- | --- |
| E1 | HTTP `200` |
| E2 | `from_versification` equals `PREFERRED_ID` (the ingested project’s preferred scheme) |

---

### TC-SCHEME-02 — No preferred association falls back to `org`

**API:** `POST /api/translations`, `POST /api/resolve/verses`  
**Acceptance criteria:** AC-2 — Versification is an optional mapping parameter; AC-2.2 — Otherwise default to the original Hebrew/Greek (`org`) versification  
**Covers:** Batch spec §5 step 3

| | |
| --- | --- |
| **Preconditions** | P1–P3; `ORG_TRANSLATION_ID` and `ORG_SCHEME_ID` from TC-SETUP-02 (canonical list does not require the sample zip) |

**Steps**

1. `POST /api/translations` with a unique `name`, `language: "en"`, `source_format: "usx"`.
2. `POST /api/resolve/verses` with `from_translation` = the new id, `to_translation` = `ORG_TRANSLATION_ID`, `refs: ["JHN 3:16"]`, and **no** versification fields.

**Expected outcomes**

| # | Outcome |
| --- | --- |
| E1 | Create is `201`; batch request is HTTP `200` (member `result` or `error` may vary; the request must not fail wholesale for missing preferred) |
| E2 | `from_versification` equals `ORG_SCHEME_ID` (canonical **scheme**, not `ORG_TRANSLATION_ID`) |

---

## 8. Negative & edge coverage (representative)

One case per HTTP error class required by the batch spec. Full matrices stay in pytest.

### TC-NEG-01 — Unauthenticated batch routes

**API:** `GET /api/resolve/range`, `POST /api/resolve/verses`  
**Covers:** Batch spec §6 `401`; HTTP API spec §3

| | |
| --- | --- |
| **Preconditions** | P1 |

**Steps**

1. Repeat a minimal range GET and verses POST **without** `Authorization`.

**Expected outcomes**

| # | Outcome |
| --- | --- |
| E1 | Each response is `401` with `code` `unauthorized` |

---

### TC-NEG-02 — Unknown translation is 404

**API:** `GET /api/resolve/range`  
**Covers:** Batch spec §6 `404`

| | |
| --- | --- |
| **Preconditions** | P2, P5 |

**Steps**

1. Range request with `from_translation` a random UUID, otherwise valid `JHN 3` bounds and `to_translation=ORG_TRANSLATION_ID`.

**Expected outcomes**

| # | Outcome |
| --- | --- |
| E1 | `404` with `code` `not_found` |

---

### TC-NEG-03 — Unknown override scheme is 404

**API:** `GET /api/resolve/range`  
**Covers:** Batch spec §5 step 1, §6 `404`

| | |
| --- | --- |
| **Preconditions** | P5 |

**Steps**

1. Range `JHN 3` with `from_versification` a random UUID.

**Expected outcomes**

| # | Outcome |
| --- | --- |
| E1 | `404` with `code` `not_found` (not `409`) |

---

### TC-NEG-04 — Malformed `from_ref` is 400

**API:** `GET /api/resolve/range`  
**Covers:** Batch spec §3.1, §6 `400`

| | |
| --- | --- |
| **Preconditions** | P5 |

**Steps**

1. Range request with `from_ref=GEN 3:` and `to_ref=GEN 3:1`.

**Expected outcomes**

| # | Outcome |
| --- | --- |
| E1 | `400` with `code` `bad_request` |

---

### TC-NEG-05 — Unassociated override is 409

**API:** `GET /api/resolve/range`  
**Covers:** Batch spec §5, §6 `409`

| | |
| --- | --- |
| **Preconditions** | P5 |

**Steps**

1. Range `JHN 3` with `from_versification=LXX_ID`.

**Expected outcomes**

| # | Outcome |
| --- | --- |
| E1 | `409` with `code` `conflict` |

---

### TC-NEG-06 — Reversed range is 422

**API:** `GET /api/resolve/range`  
**Covers:** Batch spec §3.1, §6 `422`

| | |
| --- | --- |
| **Preconditions** | P5 |

**Steps**

1. Range request with `from_ref=EXO` and `to_ref=GEN`.

**Expected outcomes**

| # | Outcome |
| --- | --- |
| E1 | `422` with `code` `validation_failed` |

---

## 9. Execution checklist

| Order | Case | Local |
| --- | --- | :---: |
| 1 | TC-SETUP-01 | ☐ |
| 2 | TC-AUTH-01 | ☐ |
| 3 | TC-SETUP-02 | ☐ |
| 4 | TC-RANGE-01 | ☐ |
| 5 | TC-RANGE-02 | ☐ |
| 6 | TC-RANGE-03 | ☐ |
| 7 | TC-SET-01 | ☐ |
| 8 | TC-SET-02 | ☐ |
| 9 | TC-SCHEME-01 | ☐ |
| 10 | TC-SCHEME-02 | ☐ |
| 11 | TC-NEG-01 | ☐ |
| 12 | TC-NEG-02 | ☐ |
| 13 | TC-NEG-03 | ☐ |
| 14 | TC-NEG-04 | ☐ |
| 15 | TC-NEG-05 | ☐ |
| 16 | TC-NEG-06 | ☐ |

**Sign-off:** All cases pass on Local. Log defects with HTTP method, URL, persona, status, and a short JSON snippet (plus the spans oracle excerpt when a values check failed).

---

## 10. Traceability

Story AC are on case headers in §6–8 and the legend in §3. This table maps **spec sections** only.

| Spec section | Test cases |
| --- | --- |
| Batch spec §3 range endpoint | TC-RANGE-01, TC-RANGE-03 |
| Batch spec §3.1 partial-reference grammar | TC-RANGE-01, TC-RANGE-02, TC-NEG-04, TC-NEG-06 |
| Batch spec §3.2 expansion from stored spans | TC-RANGE-01 |
| Batch spec §3.3 combined milestones | CoveredByCI — `test_combined_milestone_constituents_share_result` |
| Batch spec §4 verse set | TC-SET-01, TC-SET-02 |
| Batch spec §5 versification defaulting | TC-SCHEME-01, TC-SCHEME-02, TC-NEG-03, TC-NEG-05 |
| Batch spec §6 status codes | TC-NEG-01 through TC-NEG-06 |
| HTTP API spec §3 Basic auth | TC-AUTH-01, TC-NEG-01 |
| HTTP API spec §5 pagination | TC-RANGE-03 |

---

## 11. Open items

Listed items do **not** block executing the plan unless marked otherwise.

| Item | Type | Handling |
| --- | --- | --- |
| No meeting notes or POC were supplied for this story | Assumption | Coverage taken from the acceptance criteria and batch API spec; spec wins |
| Staging/AWS not specified | Assumption | Local only; add an environment column if a deploy target is added later |
| Combined-milestone same `result` is not a documented sample-zip walkthrough | Assumption | CoveredByCI; do not require testers to invent USX milestones |
| Empty `refs` and `limit=501` | Out of scope / CoveredByCI | One `422` representative (TC-NEG-06); rest in `test_api_resolve_batch.py` |
| `GET /api/resolve` still `409` without preferred | CoveredByCI | `test_selected_scheme_ref_still_409_without_preferred` — not a batch AC |
| AC-2.2 proven on the set endpoint only | Assumption | Both routes share the same scheme selector; range is not repeated |
