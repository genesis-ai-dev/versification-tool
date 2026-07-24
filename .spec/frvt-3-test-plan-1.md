# FRVT-3 Test Plan

**Document:** `frvt-3-test-plan-1`
**Status:** Draft-complete (agent) — pending owner/peer review
**Story ID:** `frvt-3`

This is the **index** document for the FRVT-3 test plan. Detailed test cases live in the per-area files linked in [Section 4](#4-test-case-index); this file owns the summary, assumptions, fixtures, the full traceability matrix, the owner action checklist, and entry/exit criteria. All files share revision `-1`.

## 1. Summary

This plan covers the FRVT-3 versification viewer end to end: HTTP Basic gate, PostgreSQL-backed API (CRUD, ingest, resolve, navigation/deltas/misalignments), in-process resolver/ETL (including Interim algorithm bindings), and the React desktop viewer (URL session, jump menus, SVG overlay, manage flows). Sources used: authoritative specs [frvt-3-server-and-api-spec-1.md](./frvt-3-server-and-api-spec-1.md), [frvt-3-ui-spec-1.md](./frvt-3-ui-spec-1.md), [frvt-3-resolver-and-etl-spec-1.md](./frvt-3-resolver-and-etl-spec-1.md); supporting research [research/frvt-versification-viewer-poc-1.md](../research/frvt-versification-viewer-poc-1.md) and [research/frvt-versification-standards-and-tooling-1.md](../research/frvt-versification-standards-and-tooling-1.md). Meeting notes were not provided. Per source precedence, **specs win** over POC/standards where they conflict; Interim resolver/ETL behaviors are locked for this plan per owner decision.

The plan is split into an index (this file) plus per-area case files because the detailed cases exceed the single-file size limit; see [Section 4](#4-test-case-index).

**Priority focus:** Human verification targets **Required** cases on **directly accessible** surfaces (HTTP API, browser UI, manual observation) across auth, API, ingest, resolve, navigation, viewer, overlay, and manage. Cases that call Python/ETL modules, probe DrawPlan builders / `lib/*` / cache-key shapes, or rely on DevTools request inspection are **Optional (CI/CD / Automation candidate)** or rewritten to user-visible outcomes. Resolver golden cases are Required via `GET /api/resolve`; overlay topologies are Required via visible connectors in the viewer.

## 2. Assumptions & Open Questions

### Assumptions (flagged for review)

| ID | Assumption |
| --- | --- |
| A-01 | Meeting notes are absent; UI/server locked decisions in the three specs are treated as the decision record. |
| A-02 | Precedence conflicts (POC chapter-wide overlay toggle, POC `active` flag, POC left=source, etc.) are resolved in favor of the specs; losing interpretations are `OutOfScope`. |
| A-03 | Standards research supplies domain fixture categories only; it does not introduce product requirements unless echoed in a spec. |
| A-04 | Interim resolver/ETL bindings (shared-ancestor rule, zip-by-index clamp, compose table, classify_mapped, USX comma-verses, VRS conversion, in-memory mapping load, etc.) are **locked** for test expected results. |
| A-05 | Primary project-zip fixture: `research/SampleTranslations/6b7f504f1b6050c1-rev1-release.zip` (any of the six sample zips that contain `release/USX_*` + `.vrs` is acceptable). Non-identity overlay demos associate a user translation with contrasting bootstrap schemes (`org` / `lxx`) and/or use Copenhagen `eng.json`/`org.json` / `validated.json` fixtures. |
| A-06 | Health, OpenAPI `/docs`, and static UI are gated by Basic auth (no public exceptions), per server §5.3. |
| A-07 | USFM→USX is in scope as specified by resolver/ETL and server ingest contracts (fail with `IngestIssue` if conversion fails). |
| A-08 | Misalignment tests assert the fixed category vocabulary and discrete `navigation` / `navigation_ref` contracts; heuristic assignment of individual verses to categories is covered with representative seeds, not an exhaustive golden list of every verse. |

### Owner-resolved decisions

| ID | Question | Owner decision |
| --- | --- | --- |
| Q-01 | Are meeting notes intentionally omitted (no acceptance criteria beyond the five inputs)? | Yes — notes omitted; the five inputs are the complete source set. |
| Q-02 | Is locking Interim algorithm bindings (A-04) acceptable for this revision? | Yes — Interim bindings are locked; later Interim changes require a plan `REVISION` bump. |
| Q-03 | Does USFM conversion remain in acceptance for this plan (A-07)? | Yes — in scope; a stubbed converter must still fail closed as an ingest failure, never silently persist. |

No open owner-decision-needed questions remain for this revision. The [owner action checklist](#6-owner-action-checklist-ambiguity--risk-flags) lists assumptions and residual ambiguities for owner confirmation during review.

## 3. Test Data, Fixtures & Environment

### Environment

- Docker Compose PostgreSQL (host port **5433** per server spec) and API process serving static UI from `frvt/web/dist/`.
- Env/`.env`: `BASIC_AUTH_USERNAME` / `BASIC_AUTH_PASSWORD` (defaults `admin` / `Admin123!`), `MAX_UPLOAD_BYTES=52428800`, `LOG_LEVEL`, optional `RESOLVE_TRACE_PIVOTS`.
- Test DB: dedicated database URL for integration tests; migrations applied once per session.
- Tools: pytest (API/resolver), Vitest (UI unit/contract), browser e2e (Playwright or equivalent), manual checklist for overlay polish / a11y floor.

### Fixtures

| Fixture | Path / construction | Use |
| --- | --- | --- |
| Sample project zip | `research/SampleTranslations/6b7f504f1b6050c1-rev1-release.zip` | Project ingest happy path |
| Other sample zips | remaining `research/SampleTranslations/*.zip` | Optional ingest variety |
| Copenhagen ingredients | `research/CopenhagenFormat/{org,eng,lxx,rso,rsc,vul}.json` | Bootstrap seed validation; resolve chains |
| Validated ingredient | `research/CopenhagenFormat/validated.json` | partial/merged/excluded cases |
| Schema | `research/CopenhagenFormat/versification_schema.json` | Invalid-ingredient negatives |
| Paratext VRS | `research/ParatextFormat/eng.vrs`, `org.vrs`, `lxx.vrs`, customs | Standalone VRS upload / convert |
| Synthetic schemes | Constructed ingredients for split/merge/exclude/complex (T4, T5, T11) | Relation topology tests |
| Malformed zips | Zip missing `release/USX_*`; zip missing `.vrs`; oversize file | Ingest negatives |
| UI overlay fixtures | DrawPlan fixtures per relation + `drive=right` (UI §11.3) | Overlay unit tests |

### Step-3 negative/edge checklist (considered)

- [x] Boundary conditions
- [x] Invalid/malformed inputs
- [x] Error and failure handling
- [x] Concurrency/race (resolve abort; no invented multi-user suite — marked OutOfScope)
- [x] Permissions/auth (Basic gate on all routes)
- [x] Data-integrity / ingest validation
- [x] UI/visual overlay edges
- [x] Accessibility / deploy smoke **not invented** beyond UI §11.5 floor and Compose Postgres (explicit in specs)

## 4. Test-Case Index

Detailed cases (with Preconditions / Steps / Expected result and **Priority**) live in the per-area files below. Each case ID is unique across the whole plan and is referenced by the [Traceability Matrix](#5-traceability-matrix).

| Priority | Meaning |
| --- | --- |
| `Required` | Directly accessible via HTTP API, UI, or manual observation. Primary human-verification set. |
| `Optional (CI/CD / Automation candidate)` | Internals / direct module calls / DrawPlan unit / cache-key probes — backlog for automated suites, not Required for delivery sign-off. |

| Area file | Areas covered | Case IDs |
| --- | --- | --- |
| [frvt-3-test-plan-auth-and-bootstrap-1.md](./frvt-3-test-plan-auth-and-bootstrap-1.md) | Auth; server bootstrap/health/static | TC-AUTH-001/002/010/011/013; TC-SERVER-001/002/003/004/010/011/013 |
| [frvt-3-test-plan-api-and-ingest-1.md](./frvt-3-test-plan-api-and-ingest-1.md) | API errors/pagination/CRUD; ingest/ETL | TC-API-001–005, 010–017; TC-INGEST-001–007, 010–018 |
| [frvt-3-test-plan-resolver-and-navigation-1.md](./frvt-3-test-plan-resolver-and-navigation-1.md) | Resolver & resolve API; navigation/deltas/misalignments | TC-RESOLVE-001–014, 020–028; TC-NAV-001–007, 010–012 |
| [frvt-3-test-plan-viewer-and-overlay-1.md](./frvt-3-test-plan-viewer-and-overlay-1.md) | Viewer UI session; SVG overlay | TC-UI-001–007, 009–010, 020–027, 030–037; TC-OVERLAY-001–007, 010–012 |
| [frvt-3-test-plan-manage-and-oos-1.md](./frvt-3-test-plan-manage-and-oos-1.md) | Manage UI; out-of-scope confirmations | TC-MANAGE-001–006, 010–011; TC-OOS-001–003 |

> **Cases trimmed / retargeted (no revision bump):**
> - Removed the former `TC-AUTH-012` (asserted use of `secrets.compare_digest`): implementation detail. REQ-005 is `DeferredNFR`.
> - Removed the former `TC-SERVER-012` (`TRACE=5` constant registration): boilerplate. REQ-020 covered by TC-SERVER-013.
> - Removed `TC-UI-008` (DOM `data-*` attribute inspection). REQ-127 is `DeferredNFR`; functional anchoring remains Covered by Required overlay/UI cases (e.g. TC-OVERLAY-001, TC-UI-007, TC-UI-031).
> - Resolver golden/error cases rewritten to Required `GET /api/resolve` only; `TC-RESOLVE-012` / `TC-RESOLVE-026` remain Optional automation candidates.
> - Direct ETL/Python ingest cases (`TC-INGEST-004/005/006/007/014/015/016`) marked Optional (CI/CD / Automation candidate).
> - UI/overlay retargeted the same way: Required cases observe browser outcomes (no network-panel / cache-key / DrawPlan steps). Overlay topologies (`TC-OVERLAY-002–005`, `011`) and scheme-stale/override flows (`TC-UI-033`, `036`, etc.) are Required visual/e2e; `TC-OVERLAY-007` / `010` and `TC-UI-037` remain Optional automation candidates.

## 5. Traceability Matrix

| Requirement ID | Requirement / Acceptance Criterion | Source | Test Case ID(s) | Status |
| --- | --- | --- | --- | --- |
| REQ-001 | Unauthenticated requests to all routes get `401` + `WWW-Authenticate: Basic realm="FRVT"` | server §5.3 | TC-AUTH-010 | Covered |
| REQ-002 | Valid Basic credentials allow API access | server §5.3 | TC-AUTH-001 | Covered |
| REQ-003 | Static UI gated by same Basic middleware | server §5.3; UI §5.2 | TC-AUTH-002, TC-AUTH-010 | Covered |
| REQ-004 | OpenAPI `/docs` gated by Basic | server §5.3 | TC-AUTH-010 | Covered |
| REQ-005 | Credential compare is constant-time | server §5.3 | Code review of auth middleware (see TC-AUTH-011 note) | DeferredNFR |
| REQ-006 | UI uses browser Basic; no custom Authorization header / no login form | UI §5.2 | TC-AUTH-002, TC-OOS-003 | Covered |
| REQ-007 | Auth-failure banner after challenge failures | UI §5.2 | TC-AUTH-013 | Covered |
| REQ-008 | Auth error envelope `code=unauthorized` | server §5.4 | TC-AUTH-010 | Covered |
| REQ-010 | Health `200 ok` when DB up | server §7.10 | TC-SERVER-001 | Covered |
| REQ-011 | Static mount serves SPA without shadowing `/api` | server §5.5 | TC-SERVER-004 | Covered |
| REQ-012 | Seed creates anchor translations org/eng/lxx/rso/rsc/vul | server §5.7 | TC-SERVER-002 | Covered |
| REQ-013 | Seed creates canonical schemes with correct based_on (org root null) | server §5.7 | TC-SERVER-002 | Covered |
| REQ-014 | Canonical translations associated preferred to matching schemes | server §5.7 | TC-SERVER-002 | Covered |
| REQ-015 | Uploaded schemes with absent basedOn default to org; roots not via upload | server §5.7 | TC-INGEST-002 | Covered |
| REQ-016 | `GET /api/translations` excludes anchors (`total===0` clean install) | server §5.7; UI §6.3 | TC-SERVER-003, TC-UI-001 | Covered |
| REQ-017 | Deep-link SPA routes work via html fallback | UI §6.1; server §5.5 | TC-SERVER-004 | Covered |
| REQ-018 | Health `503 database_unavailable` when DB down | server §7.10 | TC-SERVER-010 | Covered |
| REQ-019 | Seed is idempotent | server §5.7 | TC-SERVER-011 | Covered |
| REQ-020 | Custom TRACE logging level (5) | server §5.6 | TC-SERVER-013 | Covered |
| REQ-021 | RESOLVE_TRACE_PIVOTS logs pivots; not in response body | server §5.6 | TC-SERVER-013 | Covered |
| REQ-022 | Error envelope `{detail,code}` (+ optional `errors[]`) | server §5.4 | TC-API-010 | Covered |
| REQ-023 | Fixed error code vocabulary | server §5.4 | TC-API-010 | Covered |
| REQ-024 | Status mapping 400/404/409/413/422/500/503 as specified | server §5.4 | TC-API-010 | Covered |
| REQ-025 | Paginated `{items,total}` with limit/offset defaults | server §7.1 | TC-API-005 | Covered |
| REQ-026 | limit max 500 | server §7.1 | TC-API-016 | Covered |
| REQ-027 | Nested association/nav list endpoints return bare arrays | server §7.1 | TC-API-005 | Covered |
| REQ-030 | Translations list/create/patch/delete contracts | server §7.3 | TC-API-001 | Covered |
| REQ-031 | Duplicate case-insensitive translation name → 409 | server §7.3 | TC-API-011 | Covered |
| REQ-032 | Missing translation id → 404 | server §7.3 | TC-API-017 | Covered |
| REQ-033 | Delete translation referenced as based_on → 409 | server §7.3 | TC-API-012 | Covered |
| REQ-034 | Delete translation cascades spans/associations, not schemes | server §6.1.1 | TC-API-001 | Covered |
| REQ-035 | Spans ordered by seq; chapter filter | server §7.4 | TC-API-002 | Covered |
| REQ-036 | Unknown book on spans → empty list | server §7.4 | TC-API-002 | Covered |
| REQ-040 | Versifications list/detail (ingredient only on detail) | server §7.5 | TC-API-003 | Covered |
| REQ-041 | PATCH rename scheme | server §7.5 | TC-API-003 | Covered |
| REQ-042 | DELETE unassociated scheme → 204 | server §7.5 | TC-MANAGE-002 | Covered |
| REQ-043 | DELETE associated scheme → 409 | server §7.5 | TC-API-014 | Covered |
| REQ-044 | Schemes created only via upload, not plain POST | server §7.5 | TC-API-015 | Covered |
| REQ-045 | Associate scheme → 201; duplicate → 409 | server §7.6 | TC-API-004 | Covered |
| REQ-046 | PUT preferred clears previous preferred atomically | server §7.6 | TC-API-004 | Covered |
| REQ-047 | PUT preferred for unassociated scheme → 409 | server §7.6 | TC-API-004 | Covered |
| REQ-048 | DELETE preferred association → 409; non-preferred → 204 | server §7.6 | TC-API-013 | Covered |
| REQ-050 | Project ingest multipart success 201 + preferred scheme | server §7.7.1 | TC-INGEST-001 | Covered |
| REQ-051 | Project ingest requires USX + .vrs | server §7.7; resolver §8.2 | TC-INGEST-010, TC-INGEST-011 | Covered |
| REQ-052 | Invalid ingest → 422; all-or-nothing | server §7.7; resolver §3.2 | TC-INGEST-012 | Covered |
| REQ-053 | Ingested scheme preferred by default | server §7.7.1 | TC-INGEST-001 | Covered |
| REQ-054 | source_format inferred server-side | server §7.7.1 | TC-INGEST-001 | Covered |
| REQ-055 | Standalone versification upload .vrs/JSON | server §7.7.2 | TC-INGEST-002, TC-INGEST-003 | Covered |
| REQ-056 | Upload basedOn default org; canonical=false | resolver §8.1; server §5.7 | TC-INGEST-002 | Covered |
| REQ-057 | ingest/derive are pure (no DB writes in ETL) | resolver §3.2 | TC-INGEST-007 | Covered |
| REQ-058 | missing files → IngestIssue missing → API 400 | resolver §3.2, §9 | TC-INGEST-010, TC-INGEST-011 | Covered |
| REQ-059 | invalid content → IngestIssue invalid → API 422 | resolver §3.2, §9 | TC-INGEST-012 | Covered |
| REQ-060 | Oversize upload → 413 | server §7.7 | TC-INGEST-013 | Covered |
| REQ-061 | Ingest synchronous; UI blocks | server §3.2; UI §2.3 | TC-INGEST-018 | Covered |
| REQ-062 | Modal surfaces 413/422 errors[] | UI §9.1 | TC-INGEST-018 | Covered |
| REQ-070 | VRS convert eng.vrs (T8) | resolver §10 T8 | TC-INGEST-004 | Covered |
| REQ-071 | USX parse sample tree (T9) | resolver §10 T9 | TC-INGEST-005 | Covered |
| REQ-072 | Derive mappedVerses/excluded/merged/partial ordering | resolver §7.1 | TC-INGEST-006 | Covered |
| REQ-073 | classify_mapped Interim shift/renumber rules | resolver §7.2 | TC-RESOLVE-003, TC-INGEST-006 | Covered |
| REQ-074 | partialVerses: part column only, plain bcv ref (T13) | resolver §10 T13 | TC-INGEST-006 | Covered |
| REQ-075 | USX comma-verse Interim binding | resolver §8.4 | TC-INGEST-014 | Covered |
| REQ-076 | USX notes dropped | resolver §8.4 | TC-INGEST-015 | Covered |
| REQ-077 | Unsupported VRS fail-closed | resolver §8.3 | TC-INGEST-016 | Covered |
| REQ-078 | USFM→USX then same path (or ingest failure) | resolver §8.2 | TC-INGEST-017 | Covered |
| REQ-080 | T1 identity resolve | resolver §10 T1 | TC-RESOLVE-001 | Covered |
| REQ-081 | T2 Psalm title shift | resolver §10 T2 | TC-RESOLVE-002 | Covered |
| REQ-082 | T3 GEN chapter boundary | resolver §10 T3 | TC-RESOLVE-003 | Covered |
| REQ-083 | T4 exclude | resolver §10 T4 | TC-RESOLVE-004 | Covered |
| REQ-084 | T5 merge | resolver §10 T5 | TC-RESOLVE-005 | Covered |
| REQ-085 | T6 range + single-verse outputs | resolver §10 T6 | TC-RESOLVE-006 | Covered |
| REQ-086 | Verse 0 valid | resolver §4.1 | TC-RESOLVE-006, TC-UI-004 | Covered |
| REQ-087 | T11 complex hull + edges | resolver §10 T11 | TC-RESOLVE-007 | Covered |
| REQ-088 | T12 partial part separate; part-in-string invalid | resolver §10 T12 | TC-RESOLVE-008, TC-RESOLVE-020 | Covered |
| REQ-090 | API resolve returns denormalized single-verse spans | server §7.8 | TC-RESOLVE-009 | Covered |
| REQ-091 | Per-request *_versification does not mutate preferred | server §7.8; UI §3.2 | TC-RESOLVE-010, TC-UI-006 | Covered |
| REQ-092 | Well-formed bcvRange accepted on resolve API | server §7.8 | TC-RESOLVE-011 | Covered |
| REQ-093 | Resolve does not load verse content | resolver §5 / A20 | TC-RESOLVE-012 | Covered |
| REQ-094 | Unequal-length zip clamp Interim | resolver §6.4 | TC-RESOLVE-013 | Covered |
| REQ-095 | No covering row → identity hop | resolver §6.3 | TC-RESOLVE-014 | Covered |
| REQ-096 | Invalid BCV / part in ref → 400 | server §7.8; resolver §9 | TC-RESOLVE-020 | Covered |
| REQ-097 | Cross-chapter range invalid Interim | resolver §4.1 | TC-RESOLVE-021 | Covered |
| REQ-098 | Missing translation → 404 before resolver | server §7.8 | TC-RESOLVE-022 | Covered |
| REQ-099 | Override exists but not associated → 409 | server §7.8 | TC-RESOLVE-023 | Covered |
| REQ-100 | No preferred → 409 | server §7.8 | TC-RESOLVE-024 | Covered |
| REQ-101 | Residual LookupError → 422 (T10) | server §7.8; resolver §10 T10 | TC-RESOLVE-025 | Covered |
| REQ-102 | Cycle → LookupError | resolver §6.2 | TC-RESOLVE-026 | Covered |
| REQ-103 | complex never stored on mapping_record | resolver §3.3; server §6.2 | TC-RESOLVE-027 | Covered |
| REQ-104 | verse_end < verse_start → ReferenceError | resolver §4.2 | TC-RESOLVE-028 | Covered |
| REQ-110 | Navigation endpoint from maxVerses + spans | server §7.9 | TC-NAV-001 | Covered |
| REQ-111 | Deltas paginated ordered by source starting BCV | server §7.9 | TC-NAV-002 | Covered |
| REQ-112 | Misalignments category vocab + filter | server §7.9 | TC-NAV-003 | Covered |
| REQ-113 | navigation_ref / navigation discrete jump contract | server §7.9 | TC-NAV-004 | Covered |
| REQ-114 | UI never parses range source_ref for jump | UI §6.6 | TC-NAV-005 | Covered |
| REQ-115 | Nav/deltas/misalignments share resolve override errors | server §7.9 | TC-NAV-010 | Covered |
| REQ-116 | Counterpart jump disabled with one translation | UI §6.3 | TC-NAV-011 | Covered |
| REQ-117 | Optional book filter on deltas | server §7.9 | TC-NAV-012 | Covered |
| REQ-120 | Empty state + project upload CTA | UI §6.3 | TC-UI-001 | Covered |
| REQ-121 | URL owns viewer session params | UI §7.1 | TC-UI-002 | Covered |
| REQ-122 | Render spans by seq independent of scheme | UI §6.5 | TC-UI-003 | Covered |
| REQ-123 | Verse 0 displays Title (0) | UI §7.5 | TC-UI-004 | Covered |
| REQ-124 | drive left/right controls resolve + overlay attachment | UI §7.6, §8.4 | TC-UI-005 | Covered |
| REQ-125 | Column scheme select is per-request only | UI §6.5 | TC-UI-006 | Covered |
| REQ-126 | Follower chapter load, URL update, scroll; exclude no scroll | UI §6.4 | TC-UI-007 | Covered |
| REQ-127 | DOM data-* anchors (implementation detail for overlay) | UI §8.3 | — (functional anchoring via TC-OVERLAY-001, TC-UI-007, TC-UI-031) | DeferredNFR |
| REQ-128 | Viewer and manage routes | UI §6.1 | TC-UI-009 | Covered |
| REQ-129 | UI error mapping per §9.1 | UI §9.1 | TC-UI-010, TC-MANAGE-011 | Covered |
| REQ-130 | One-translation placeholder disables resolve/overlay/jumps | UI §6.3 | TC-UI-020 | Covered |
| REQ-131 | In-flight resolve superseded when driving ref changes | UI §9.1 | TC-UI-021 | Covered |
| REQ-132 | Removed scheme clears *vers override | UI §6.5 | TC-UI-022 | Covered |
| REQ-133 | No resolve without associated schemes | UI §7.6 | TC-UI-023 | Covered |
| REQ-134 | Desktop-only two-column layout ~1280px+ | UI §5.3 | TC-UI-024 | Covered |
| REQ-135 | A11y floor: labels + keyboard to selectors/jump | UI §11.5 | TC-UI-025 | Covered |
| REQ-136 | UI does not log credentials | UI §11.2 | TC-UI-026 (Optional automation/security) | Covered |
| REQ-140 | Map toggle draws current ResolveResult only | UI §3.2, §8.2 | TC-OVERLAY-001, TC-OVERLAY-012 | Covered |
| REQ-141 | Overlay topologies for atomic relations | UI §8.2–8.5 | TC-OVERLAY-002 | Covered |
| REQ-142 | Complex: one connector per edges entry | UI §8.4 | TC-OVERLAY-003 | Covered |
| REQ-143 | Exclude connector-to-void | UI §8.5 | TC-OVERLAY-004 | Covered |
| REQ-144 | Partial part outline/label | UI §8.2 | TC-OVERLAY-005 | Covered |
| REQ-145 | Text highlight independent of map connectors | UI §8.2 | TC-OVERLAY-006 | Covered |
| REQ-146 | rAF redraw coalescing + cleanup | UI §8.4 | TC-OVERLAY-007 | Covered |
| REQ-147 | Anchor lookup prefers seq, falls back ref+part | UI §8.3 | TC-OVERLAY-010 | Covered |
| REQ-148 | drive=right overlay attachment | UI §8.4 | TC-OVERLAY-011 | Covered |
| REQ-150 | Manage translations capabilities | UI §6.1–6.2 | TC-MANAGE-001 | Covered |
| REQ-151 | Manage versifications capabilities | UI §6.1–6.2 | TC-MANAGE-002 | Covered |
| REQ-152 | Preferred association remove blocked in UI | UI §6.5 | TC-MANAGE-003 | Covered |
| REQ-153 | Manage modals are local state not routes | UI §6.2 | TC-MANAGE-010 | Covered |
| REQ-160 | Chapter-wide overlay when map on is OutOfScope (POC lost) | UI §3.2 vs POC capabilities | TC-OVERLAY-012 | OutOfScope |
| REQ-161 | Versification detection/sniffer OutOfScope | server/UI §2.2; POC non-goal | TC-OOS-001 | OutOfScope |
| REQ-162 | Editing scripture text OutOfScope | UI §2.2; POC non-goal | TC-OOS-002 | OutOfScope |
| REQ-163 | Production auth / multi-tenant / scaling OutOfScope | server/UI §2.2 | — | OutOfScope |
| REQ-164 | Mobile/responsive layout OutOfScope | UI §2.2 | — | OutOfScope |
| REQ-165 | Full a11y audit OutOfScope (floor only) | UI §11.5 | TC-UI-025 | OutOfScope |
| REQ-166 | POC `active` flag model superseded by preferred + per-request | POC vs server/UI §3.2 | — | OutOfScope |
| REQ-167 | Multi-user write concurrency suite | — | — | OutOfScope |
| REQ-168 | Standards tooling recommendations (SIL.Scripture, sniffer-in-product, SWORD, etc.) not product requirements | standards research | — | OutOfScope |
| REQ-169 | Misalignment heuristic completeness for every verse | server §7.9 | TC-NAV-003 | Covered |
| REQ-170 | Ingredient jsonb SoR; mapping_record derived atomic only | server §6.3 | TC-RESOLVE-027, TC-INGEST-006 | Covered |
| REQ-180 | Per-column BCV selectors; verse options from navigation + loaded spans | UI §2.3 #3, §6.1 | TC-UI-030 | Covered |
| REQ-181 | Clicking a verse span sets that column's current ref | UI §5.1 | TC-UI-031 | Covered |
| REQ-182 | URL defaults when data exists but params missing | UI §7.1 | TC-UI-032 | Covered |
| REQ-183 | Scheme switch / navigation does not reuse a stale alignment (cache keying intent) | UI §7.2 | TC-UI-033 | Covered |
| REQ-184 | Follower auto-scroll after resolve does not loop | UI §7.2, §6.4 | TC-UI-034 | Covered |
| REQ-185 | Scheme control options (assoc⋈versification, preferred marked) + "Preferred (default)" clear | UI §6.5 | TC-UI-035 | Covered |
| REQ-186 | Column scheme override applies to resolve, jumps, and navigation without changing preferred | UI §6.5, §7.6 | TC-UI-036 | Covered |
| REQ-187 | Client libs build single-verse refs only; never parse ranges | UI §5.1, §7.4, §11.3 | TC-UI-037, TC-NAV-005 | Covered |
| REQ-188 | Independent per-column vertical scroll; overlay stays aligned | UI §5.3 | TC-UI-027 | Covered |
| REQ-189 | Jump menu three sections incl. UI-owned category labels + arbitrary verses | UI §6.6 | TC-NAV-006 | Covered |
| REQ-190 | Jump selection sets structured BCV from `navigation` | UI §6.6 | TC-NAV-007 | Covered |
| REQ-191 | Upload versification and associate are separate steps | UI §6.2, §2.3 #11–12 | TC-MANAGE-004 | Covered |
| REQ-192 | Manage modals (upload/rename/associate/remove/delete) are local state, not routes | UI §6.2 | TC-MANAGE-005 | Covered |
| REQ-193 | Preferred scheme changed only via CRUD `PUT .../preferred` | UI §6.5; server §7.6 | TC-MANAGE-006 | Covered |

**Orphan test check:** All TC-* IDs across the area files map to at least one REQ.
**Gap check:** No in-scope spec capability intentionally left as `Gap` in this draft; Interim items are Covered under A-04 lock. REQ-005 (constant-time compare) and REQ-127 (DOM `data-*` names) are `DeferredNFR`. ETL/DrawPlan/lib internals may be Covered only by Optional automation candidates; product surfaces have Required API/UI cases. USFM library choice may yield implementation failure — still Covered by TC-INGEST-017 (Q-03).

## 6. Owner Action Checklist (Ambiguity & Risk Flags)

Each row is an item to confirm or decide during owner review (Step 6). "Recommended disposition" is the suggested action; check the box once the owner has confirmed or overridden it.

| ID | Ambiguity / risk | Reasonable-but-wrong implementation | In Section 2? | Recommended owner disposition | Done |
| --- | --- | --- | --- | --- | --- |
| R-01 | Spec status banners still say "for reconciliation" while content is implementation-ready | Testers defer Interim locks or skip contracts | A-04, Q-02 | Accept A-04 (Interim locked) as the test baseline | [ ] |
| R-02 | Project zip `.vrs` name: UI empty-state copy may say `custom.vrs`; resolver accepts any `release/**/*.vrs` | Tests require exact filename `custom.vrs` and fail valid zips | A-05 | Accept A-05 (any `.vrs` accepted); do not assert a literal filename | [ ] |
| R-03 | T3 allows shift **or** renumber under Interim classify | Flaky assertion if a test hard-codes one relation | Noted in TC-RESOLVE-003 | Accept the {shift, renumber} membership assertion | [ ] |
| R-04 | Misalignment category assignment heuristics under-specified beyond vocab | Implementer invents categories inconsistently; tests overfit | A-08 | Accept A-08 (vocab + representative seeds, not per-verse golden list) | [ ] |
| R-05 | USFM library unspecified | Stub vs real converter diverges | Q-03 | Confirm Q-03 (convert or fail closed; never silent persist) | [ ] |
| R-06 | Meeting notes missing | Hidden acceptance criteria not tested | Q-01 | Confirm Q-01 (five inputs are the complete source set) | [ ] |
| R-07 | Sample zips may be near-identity eng-like | Overlay non-identity paths untested without contrasting schemes | A-05 | Accept A-05 fixture strategy (associate contrasting schemes for overlay demos) | [ ] |
| R-08 | POC chapter-wide overlay wording | Implementer draws all chapter connectors | REQ-160 / TC-OVERLAY-012 | Confirm chapter-wide overlay is OutOfScope (current-result only) | [ ] |
| R-09 | Health behind auth unusual for ops | Implementer leaves `/api/health` public | A-06 | Confirm A-06 (health is gated by Basic, no public exception) | [ ] |
| R-10 | Pagination `limit>500`: spec sets `max 500` (no clamp) and rejects, but the rejection code could be `422` (FastAPI query validation) or `400` (hand-validated bad query param) | Test hard-codes the wrong rejection status | Noted in TC-API-016 | Confirm `422` (FastAPI query constraint) as primary; accept `400` only if the bound is hand-validated | [ ] |

## 7. Entry/Exit Criteria

### Draft-complete (agent)

- [x] Requirements extracted from available sources (3 specs + POC + standards; notes absent) with `REQ-###` IDs
- [x] Every matrix row has a valid Status
- [x] No in-scope requirement left unlabeled
- [x] Cross-source conflicts resolved via precedence (spec > POC/standards); decisions in Assumptions
- [x] Step 3 negative/edge checklist completed
- [x] Owner action checklist populated; significant items reflected in Section 2
- [x] Test Data, Fixtures & Environment section present
- [x] Owner-decision-needed questions from the prior revision resolved (Q-01/02/03) and recorded
- [x] UI functionality coverage reconciled against `frvt-3-ui-spec-1.md` (selectors, session/URL, caches, jump menu, overlay, manage modals)
- [x] Cases reviewed against the testing-standards rule; boilerplate/implementation-detail cases trimmed (see Section 4)
- [x] Detailed cases written as Preconditions / Steps / Expected result blocks in the per-area files
- [x] Every test case has Priority (`Required` or `Optional (CI/CD / Automation candidate)`)
- [x] Required cases use directly accessible surfaces across API **and** UI/overlay/manage; resolver goldens are API-only; DOM attribute case dropped; UI network/cache/DrawPlan steps rewritten or Optional
- [x] Plan written to `.spec/frvt-3-test-plan-1.md` (index) plus per-area files, sharing revision `-1`

### Approved (human) — agent never marks these done

- [ ] Owner review (Step 6) complete; owner action checklist (Section 6) dispositioned
- [ ] Gaps supplemented (Step 7) or accepted as deferred with Status updated
- [ ] Peer review (Step 8) complete
- [ ] No unresolved `Ambiguous` / `UntestableAsWritten` rows without an owner decision
- [ ] Precedence-resolved conflicts accepted or overridden by owner
- [ ] Owner-decision-needed questions resolved or explicitly deferred by owner
