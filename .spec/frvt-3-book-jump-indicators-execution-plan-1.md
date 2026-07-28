# Book Jump-Difference Indicators — Execution Plan

**Document:** `frvt-3-book-jump-indicators-execution-plan-1`
**Status:** Ready for implementation
**Audience:** A coding agent (and reviewers) adding per-book indicators on the viewer book dropdown for books that have jump-menu differences, plus a visible legend.
**Scope:** Spec amendments; new pair-scoped summary API; ViewerSession fetch/cache; `ColumnChrome` book-option markers and legend; tests.

## How to use this document

- Work phases **in order**. Do not start phase *N+1* until phase *N* Acceptance passes.
- Product specs remain authoritative after Phase 0 amends them: [server](./frvt-3-server-and-api-spec-1.md), [UI](./frvt-3-ui-spec-1.md).
- Cite product-spec sections (not this plan) when making policy decisions in code.
- **Never commit or push** (Rule 11).

> **Rule 12 (product code).** Phase numbers and plan/workflow identifiers must **never** appear in product application code under `frvt/api`, `frvt/resolver`, `frvt/ingest`, or `frvt/web/src`. Name modules and symbols for what they do, not for the phase that created them.

---

## Locked owner decisions

| Topic | Decision |
| --- | --- |
| Meaning | Mark a book when it has **≥1 jump-relevant difference** for the current pair + schemes — i.e. any row that would appear in **Mapped deltas** or **Misalignments** after the server cancel-filter (same underlying `_cancel_filtered_jump_mappings` set; deltas and misalignments are two projections of that set) |
| Indicator richness | **Boolean only** — no per-book counts, no per-category icons |
| Control UI | Keep the native book `<select>`. Encode the mark as a **unicode suffix** on the option label (see Marker). Do **not** build a custom dropdown |
| Marker | Suffix ` ●` (U+25CF BLACK CIRCLE) after the USFM code when the book is flagged — e.g. `PSA ●`. Books without differences stay `PSA`. The `value` attribute remains the bare book code |
| Legend | **Always visible** in each column’s chrome, immediately under or beside the Book control: `● Book has mapping differences` (same wording in both columns) |
| Columns | **Both** left and right book dropdowns. Each request uses that column as `from_translation` and the counterpart as `to_translation`, with that column’s `*_versification` overrides (same directionality as `JumpMenu`) |
| API | New **`GET /api/resolve/jump-books`**. Do **not** enrich per-translation `NavBook` / navigation (pair-scoped data does not belong there). Do **not** require the client to page through full deltas/misalignments |
| Response | `{ books: string[] }` — distinct from-side book codes that have ≥1 post-cancel-filter jump row, sorted in USX book order (`usx_book_sort_key`) |
| Empty / disabled | When `!canResolve`, show no markers and still show the legend (so users learn the symbol) **or** hide the legend when jump is disabled — **decide in Phase 0 UI wording as: show legend whenever a translation is selected; markers only when `canResolve` and data has loaded**. Prefer: legend visible whenever the Book select is enabled; markers appear when summary data is present |
| Loading | While the summary request is in flight, show unmarked book labels (no flicker of stale pair data). Clear cached books immediately when pair/schemes change |
| Cancel filter | Indicators must match jump-menu visibility: only books with rows **kept** by `filter_canceling_jump_rows` |
| Non-goals for marker | Do not mark books solely from identity verses; do not show chapter-level marks |

---

## Why a new endpoint

```mermaid
flowchart LR
  chrome["ColumnChrome book select"]
  session["ViewerSession"]
  jumpBooks["GET /api/resolve/jump-books"]
  jumpMenu["GET /api/resolve/jump-menu"]
  legend["Chrome legend"]

  chrome --> session
  session --> jumpBooks
  session --> chrome
  legend --> chrome
  jumpMenu -.->|"same cancel-filtered row set"| jumpBooks
```

- Jump menu is **book-scoped**; users need translation-level cues before opening Jump.
- Existing deltas/misalignments return entry lists (paginated). Client aggregation would require fetching all pages, re-implementing cancel semantics, and repeating work per column.
- Navigation is **per-translation**; differences are **pair + scheme** scoped — a dedicated summary endpoint is the correct seam.
- Reuse `_cancel_filtered_jump_mappings(..., book=None)` and collect distinct books from kept rows’ navigation targets (see Phase 1).

---

## Global conventions (every phase)

- **Logging:** public backend entry at `DEBUG`; caught exceptions at `ERROR` with `exc_info=True`; getter-style reads at `TRACE`.
- **Orienting comments** (Rule 4) on every new field and non-overriding method.
- **Testing** (Rule 3): happy paths and essential failure contracts only — no thin handler-only tests, no DTO accessor tests.
- **Reuse** (Rule 6): share cancel-filter + scheme selection with jump-menu routers; share USX sort with navigation.
- **Size / arguments** (Rules 9–10): keep modules under limits; extract a small helper module if `navigation.py` grows past comfort.
- Quality gates on changed code: Python `ruff` / `mypy` / `black`; TypeScript `tsc --noEmit` / `eslint` / `prettier --check`.
- **Never commit or push.**

---

## Phases

### Phase 0 — Spec amendments

Amend product specs before code.

**Server** — [`frvt-3-server-and-api-spec-1.md`](./frvt-3-server-and-api-spec-1.md):

1. Capability row 4 (or adjacent): book dropdown indicators use a pair-scoped summary of jump differences.
2. New endpoint near §7.9:

| Method | Path | Query | Response |
| --- | --- | --- | --- |
| `GET` | `/api/resolve/jump-books` | `from_translation`, `to_translation`, optional `from_versification`, `to_versification` | `200` `{ books: string[] }` |

Contract notes:

- Same scheme-selection / `404` / `409` rules as deltas / jump-menu.
- Books are distinct from-side book codes from **cancel-filtered** scheme-difference rows (unfiltered by `book`).
- Sort with existing USX order.
- Empty pair / identical schemes / no differences ⇒ `{ books: [] }`.

**UI** — [`frvt-3-ui-spec-1.md`](./frvt-3-ui-spec-1.md):

1. Capability / §6.6 (or ColumnChrome §): book `<select>` suffixes ` ●` for books returned by jump-books for that column’s from→to direction.
2. Always-visible legend copy: `● Book has mapping differences`.
3. Fetch timing: load when both translations are resolvable; refetch on translation or versification change; do not block BCV selection on this request.
4. Note native `<option>` limitation: unicode suffix, not a separate icon element.

**Acceptance:** wording present in UI + server specs; no product code required.

---

### Phase 1 — Pure book-set helper (server)

Extract (or add) a focused function that turns cancel-filtered jump rows into a sorted unique book list. Prefer a small helper in [`frvt/api/routers/navigation.py`](../frvt/api/routers/navigation.py) or a sibling module such as `frvt/api/jump_books.py` if that keeps the router thinner.

**Implement:**

```python
def jump_difference_books(rows: list[JumpMapping]) -> list[str]:
    """Return distinct from-side books for jump rows, USX-sorted."""
```

- Derive each row’s book from `navigation_target(row.source_ref, …)` / existing `jump_navigation_ref` + `NavRef.book` so range refs contribute their lower-bound book (same navigation book the jump menu would use).
- Deduplicate; sort via `usx_book_sort_key`.
- Unit-test with synthetic `JumpMapping` fixtures (multi-book, duplicate books, empty, unparseable skipped or handled as existing navigation helpers do).

**Do not** add the HTTP route yet.

**Acceptance:** unit tests green for the pure collector; ruff / mypy / black clean; existing navigation tests still green.

---

### Phase 2 — HTTP `GET /api/resolve/jump-books`

**Touch:**

- [`frvt/api/schemas/__init__.py`](../frvt/api/schemas/__init__.py) — e.g. `JumpBooksOut` with `books: list[str]`
- [`frvt/api/routers/navigation.py`](../frvt/api/routers/navigation.py) — route handler
- Tests: [`frvt/tests/test_api_navigation.py`](../frvt/tests/test_api_navigation.py) or new `test_api_jump_books.py`
- Fixtures: reuse complementary / eng–org setups from [`frvt/testops/fixtures/`](../frvt/testops/fixtures/)

**Implement handler:**

1. `DEBUG` log translations + overrides.
2. Resolve schemes via `selected_scheme_ref` (same as deltas).
3. `rows = _cancel_filtered_jump_mappings(..., book=None)`.
4. Return `JumpBooksOut(books=jump_difference_books(rows))`.

**Essential HTTP tests:**

- Happy path: pair known to differ in specific books (e.g. eng↔org Psalms / complementary fixture) ⇒ those books present; books with only canceling identity rows absent.
- Empty / identical schemes ⇒ `books: []`.
- Missing translation ⇒ `404`; no preferred scheme ⇒ `409` (match deltas).
- Optional: book list is USX-sorted.

**Acceptance:** pytest green; quality gates clean; deltas/jump-menu tests unchanged in behavior.

---

### Phase 3 — Client API + ViewerSession cache

**Touch:**

- [`frvt/web/src/api/types.ts`](../frvt/web/src/api/types.ts) — `JumpBooksOut`
- [`frvt/web/src/api/resolve.ts`](../frvt/web/src/api/resolve.ts) — `listJumpBooks(...)` (or `navigation.ts` if preferred; keep next to other resolve/jump clients)
- [`frvt/web/src/viewer/ViewerSession.tsx`](../frvt/web/src/viewer/ViewerSession.tsx)
- Session/unit tests for gating if a harness exists; otherwise a small pure cache-key helper test

**Implement:**

1. `listJumpBooks({ fromTranslation, toTranslation, fromVersification?, toVersification? }, options?)`.
2. Session exposes e.g. `jumpBooksFor(side: DriveSide): ReadonlySet<string>` (or `string[]`).
3. When `canResolve`, fetch **twice** conceptually (left-as-from and right-as-from) — or one effect per side. Use `AbortController`; ignore stale responses.
4. Cache key: `from|to|fromVers|toVers` per direction. Clear on translation/scheme change before the new response arrives (so markers do not show the previous pair).
5. Do **not** couple to Jump panel open state — prefetch for chrome independently of [`JumpMenu.tsx`](../frvt/web/src/viewer/JumpMenu.tsx).

**Acceptance:**

- `canResolve === false` ⇒ empty sets, no request (or requests aborted).
- Switching counterpart translation clears old markers then fills new ones.
- `tsc` / eslint clean.

---

### Phase 4 — ColumnChrome marker + legend

**Touch:**

- [`frvt/web/src/viewer/ColumnChrome.tsx`](../frvt/web/src/viewer/ColumnChrome.tsx)
- [`frvt/web/src/styles/app.css`](../frvt/web/src/styles/app.css) — compact legend styling under the Book control (muted text; do not introduce card chrome)
- Viewer unit/RTL tests that query option text / legend if present ([`viewerStates.test.tsx`](../frvt/web/src/routes/viewerStates.test.tsx) or ColumnChrome tests)

**Implement:**

1. Book options:

```tsx
<option key={book.book} value={book.book}>
  {jumpBooks.has(book.book) ? `${book.book} ●` : book.book}
</option>
```

2. Legend (always when Book select is enabled — translation selected):

```tsx
<p className="book-jump-legend" aria-hidden="true">
  ● Book has mapping differences
</p>
```

   Also expose an accessible name: e.g. `aria-describedby` on the Book `<select>` pointing at a legend element with an `id` (do not rely on `aria-hidden` alone if using describedby — prefer one visible legend with `id` and `aria-describedby` on the select; drop `aria-hidden` in that case).

3. Selected value stays the bare code (`value={bcv?.book}`); parsing must **not** strip markers from `value` (markers are display-only in option text).

**Acceptance:**

- With a fixture pair that differs in PSA (or similar), PSA option text includes `●`; a book with no jump rows does not.
- Legend visible in both columns when translations are selected.
- Changing book still navigates via bare USFM code.
- No custom dropdown component introduced.

---

### Phase 5 — Test-plan sync, e2e, gate wrap-up

**Touch:**

- [`frvt-3-test-plan-resolver-and-navigation-1.md`](./frvt-3-test-plan-resolver-and-navigation-1.md) — add cases (suggested ids: TC-NAV-014 API jump-books; TC-NAV-015 UI markers + legend)
- [`frvt/web/e2e/viewer.spec.ts`](../frvt/web/e2e/viewer.spec.ts) (or navigation-focused e2e)
- Coverage matrix under [`.test/`](../.test/) if applicable

**E2E / manual checks:**

1. Two associated translations with known differences → marked books in the from-side dropdown; legend visible.
2. Open Jump on a marked book → Mapped deltas and/or Misalignments non-empty (after cancel filter).
3. Open Jump on an unmarked book → both difference sections empty (chapter verses may still list).
4. Single-translation mode → Jump disabled; no erroneous markers from a stale pair.
5. Switch versification override → markers refresh to match new scheme differences.

**Acceptance:** docs and tests agree with shipped behavior; quality gates clean; no commits/pushes.

---

## Touch-point index

| Artifact | Role |
| --- | --- |
| `.spec/frvt-3-server-and-api-spec-1.md` | `GET /api/resolve/jump-books` contract |
| `.spec/frvt-3-ui-spec-1.md` | Book marker + legend UX |
| `.spec/frvt-3-test-plan-resolver-and-navigation-1.md` | TC-NAV-014 / TC-NAV-015 |
| `frvt/api/jump_books.py` (or helper in navigation router) | Pure book-set collector |
| `frvt/api/schemas/__init__.py` | `JumpBooksOut` |
| `frvt/api/routers/navigation.py` | HTTP endpoint; reuse cancel-filtered rows |
| `frvt/api/jump_cancel.py` | Unchanged cancel semantics |
| `frvt/tests/test_api_navigation.py` (or `test_api_jump_books.py`) | API contracts |
| `frvt/web/src/api/resolve.ts` | `listJumpBooks` |
| `frvt/web/src/api/types.ts` | DTO |
| `frvt/web/src/viewer/ViewerSession.tsx` | Per-side fetch + cache |
| `frvt/web/src/viewer/ColumnChrome.tsx` | Option suffix + legend |
| `frvt/web/src/styles/app.css` | Legend layout |
| `frvt/web/e2e/viewer.spec.ts` | Marker / legend smoke |

---

## Explicit non-goals

- Custom book dropdown / portal / combobox widgets
- Per-book counts or per-misalignment-category icons
- Enriching `GET /api/translations/{id}/navigation` with pair-scoped flags
- Changing cancel-filter rules, jump-menu sections, or overlay mapping visibility
- Chapter-level indicators inside the chapter `<select>`
- Committing or pushing (Rule 11)

---

## Verification cheat-sheet (implementer)

After Phase 5, a reviewer should be able to:

1. Load two translations with scheme differences (e.g. eng/org or complementary Psalms fixture).
2. See `● Book has mapping differences` under each column’s Book control.
3. See `●` only on books that actually have Jump deltas/misalignments for that column’s from→to direction.
4. Select a marked book, open Jump, and find at least one mapped delta or misalignment entry.
5. Select an unmarked book, open Jump, and find empty delta/misalignment sections.
6. Confirm book `value` changes still set structured BCV correctly (no `●` leaked into URL book params).
