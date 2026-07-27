# Canceling Jump-Misalignment Filter — Execution Plan

**Document:** `frvt-3-canceling-jump-filter-execution-plan-1`
**Status:** Implemented
**Audience:** A coding agent (and reviewers) hiding jump-menu entries that cancel to the same BCV after resolve.
**Scope:** Server-side filter on `GET /api/resolve/deltas` and `GET /api/resolve/misalignments`; spec amendments; pytest coverage.

## How to use this document

- Work phases **in order**. Do not start phase *N+1* until phase *N* Acceptance passes.
- Product specs remain authoritative: [server](./frvt-3-server-and-api-spec-1.md) §7.9, [UI](./frvt-3-ui-spec-1.md) §6.6.
- **Never commit or push** (Rule 11).

> **Rule 12 (product code).** Phase numbers and plan/workflow identifiers must **never** appear in product application code under `frvt/api`, `frvt/resolver`, `frvt/ingest`, or `frvt/web/src`.

---

## Locked owner decisions

| Topic | Decision |
| --- | --- |
| Surface | Filter **both** `GET /api/resolve/deltas` and `GET /api/resolve/misalignments` |
| Cancel definition | After resolve at `navigation_ref` (+ `part` when present), **hide** when exactly one source span and one target span share `(book, chapter, verse, part)` — even if `relation` is `shift`/`renumber` |
| Keep visible | Multi-span, `exclude`, `partial` (identity-locus part annotations), real coordinate shifts, resolve failures |
| Resolve errors | **Fail open** — only hide when resolve succeeds and proves same BCV |
| Placement | Server-side shared filter; no new query params |
| Pagination | Filter before `limit`/`offset`; `total` is post-filter count |

---

## Phases

### Phase 0 — Spec amendment

Amend server §7.9 and UI §6.6 with cancel-filter contract text (see product specs).

**Acceptance:** wording present; no product code required.

### Phase 1 — Pure cancel predicate

Implement [`frvt/api/jump_cancel.py`](../frvt/api/jump_cancel.py) and [`frvt/tests/test_jump_cancel_filter.py`](../frvt/tests/test_jump_cancel_filter.py).

**Acceptance:** unit tests green; ruff/black/mypy clean.

### Phase 2 — Wire filter + HTTP tests

Integrate into [`frvt/api/routers/navigation.py`](../frvt/api/routers/navigation.py); complementary-scheme fixture in [`frvt/testops/fixtures/synthetic_schemes.py`](../frvt/testops/fixtures/synthetic_schemes.py) and [`api_setup.py`](../frvt/testops/fixtures/api_setup.py); HTTP cases in [`frvt/tests/test_api_navigation.py`](../frvt/tests/test_api_navigation.py) (TC-NAV-013).

**Acceptance:** all navigation pytest cases green; eng→org regressions unchanged.

### Phase 3 — Performance sanity

Coordinate-only resolve in filter loop; reuse `SchemeRef` per request; no `VerseSpan` enrichment.

**Acceptance:** no span DB reads in filter path; PSA book-filtered complementary pair completes in a few seconds under TestClient.

### Phase 4 — Viewer smoke

No UI changes required. Existing Jump e2e (TC-NAV-005/006/007) uses eng/org and remains valid.

### Phase 5 — Gate wrap-up

Re-run navigation pytest; update [`.test/coverage-matrix.md`](../.test/coverage-matrix.md) TC-NAV-013 row; quality gates clean.

---

## Touch-point index

| Artifact | Role |
| --- | --- |
| `frvt/api/jump_cancel.py` | cancel predicate and row filter |
| `frvt/api/routers/navigation.py` | deltas + misalignments integration |
| `frvt/resolver/resolve.py` | coordinate-only resolve (unchanged) |
| `frvt/tests/test_jump_cancel_filter.py` | unit tests |
| `frvt/tests/test_api_navigation.py` | HTTP regression + TC-NAV-013 |
| `frvt/testops/fixtures/synthetic_schemes.py` | psalm style A/B ingredients |
| `frvt/testops/fixtures/api_setup.py` | `complementary_psalm_context` helper |

---

## Explicit non-goals

- Changing resolve classification
- UI-side filtering
- Chapter-wide overlay behavior
- Committing or pushing
