# FRVT-3 Test Plan — Resolver & Navigation

**Document:** `frvt-3-test-plan-resolver-and-navigation-1`
**Parent index:** [frvt-3-test-plan-1.md](./frvt-3-test-plan-1.md)
**Areas:** resolver & resolve API (`RESOLVE`), navigation / deltas / misalignments (`NAV`)

Shared setup, fixtures, and the traceability matrix live in the [parent index](./frvt-3-test-plan-1.md). "T#" references point at the resolver/ETL spec (§10) golden cases. Interim algorithm bindings are locked for expected results per assumption A-04.

**Priority:** Required cases use `GET /api/resolve` (or UI) only. Direct Python/`parse_ref`/`build_chain` paths are Optional (CI/CD / Automation candidate) or rewritten away.

---

## Resolver & resolve API (`RESOLVE`)

### TC-RESOLVE-001 — T1 identity: JHN 3:16 eng→org

- **Level:** integration · **Priority:** Required · **Category:** functional · **Traces:** REQ-080
- **Preconditions:**
  - Two translations whose preferred schemes are (or override to) `eng` and `org` respectively (or the reverse drive direction as needed).
  - Authenticated client.
- **Steps:**
  1. `GET /api/resolve` with `ref=JHN 3:16` from the eng-side translation to the org-side translation.
- **Expected result:**
  - `200`; relation is `one_to_one`; source and target refs are identical single-verse refs; `edges` is empty.

### TC-RESOLVE-002 — T2 Psalm title shift: PSA 3:1

- **Level:** integration · **Priority:** Required · **Category:** functional · **Traces:** REQ-081
- **Preconditions:**
  - Same eng/org scheme pairing as TC-RESOLVE-001; authenticated client.
- **Steps:**
  1. `GET /api/resolve` with `ref=PSA 3:1` eng→org.
- **Expected result:**
  - `200`; relation is `shift`; target is `PSA 3:2`.

### TC-RESOLVE-003 — T3 chapter-boundary drift: GEN 31:55

- **Level:** integration · **Priority:** Required · **Category:** functional · **Traces:** REQ-082, REQ-073
- **Preconditions:**
  - Same eng/org scheme pairing; authenticated client.
- **Steps:**
  1. `GET /api/resolve` with `ref=GEN 31:55` eng→org.
- **Expected result:**
  - `200`; target is `GEN 32:1`.
  - Relation is either `shift` or `renumber` per the Interim `classify_mapped` rule (see risk R-03; assert membership in {shift, renumber}, not a single value).

### TC-RESOLVE-004 — T4 exclude

- **Level:** integration · **Priority:** Required · **Category:** functional · **Traces:** REQ-083
- **Preconditions:**
  - Translations/schemes loaded with an exclude fixture (a verse excluded in the target scheme).
  - Authenticated client.
- **Steps:**
  1. `GET /api/resolve` for the excluded verse between those translations.
- **Expected result:**
  - `200`; `target_spans` is empty; relation is `exclude`.

### TC-RESOLVE-005 — T5 merge

- **Level:** integration · **Priority:** Required · **Category:** functional · **Traces:** REQ-084
- **Preconditions:**
  - Translations/schemes loaded with a merge fixture (multiple source verses → one target).
  - Authenticated client.
- **Steps:**
  1. `GET /api/resolve` for one of the merged source verses.
- **Expected result:**
  - `200`; more than one source span and exactly one target span; relation is `merge`.

### TC-RESOLVE-006 — T6 range input PSA 3:0–2 yields single-verse outputs

- **Level:** integration · **Priority:** Required · **Category:** functional · **Traces:** REQ-085, REQ-086
- **Preconditions:**
  - eng/org scheme pairing available via translations; authenticated client.
- **Steps:**
  1. `GET /api/resolve` with `ref=PSA 3:0-2`.
- **Expected result:**
  - `200` (not an error); verse 0 is accepted as input.
  - All output refs are single-verse (no ranges in outputs).

### TC-RESOLVE-007 — T11 complex hull with edges

- **Level:** integration · **Priority:** Required · **Category:** functional · **Traces:** REQ-087
- **Preconditions:**
  - Translations/schemes loaded with a split∘merge (complex) fixture.
  - Authenticated client.
- **Steps:**
  1. `GET /api/resolve` for a verse whose mapping is complex.
- **Expected result:**
  - `200`; relation is `complex`; `edges` is populated; target spans cover the full connected component (hull).

### TC-RESOLVE-008 — T12 partial part via resolve API

- **Level:** integration · **Priority:** Required · **Category:** functional · **Traces:** REQ-088
- **Preconditions:**
  - Translations/schemes loaded with a partial-verse fixture.
  - Authenticated client.
- **Steps:**
  1. `GET /api/resolve` for the partial verse supplying `part` as a separate query argument (not embedded in the ref string).
- **Expected result:**
  - `200`; response is a partial result carrying the part identifier.
  - (Invalid part-in-string refs are covered by TC-RESOLVE-020.)

### TC-RESOLVE-009 — Resolve API happy path

- **Level:** integration · **Priority:** Required · **Category:** functional · **Traces:** REQ-090
- **Preconditions:**
  - Two translations with associated preferred schemes; authenticated client.
- **Steps:**
  1. `GET /api/resolve` for a driving ref between the two translations.
- **Expected result:**
  - `200` with denormalized single-verse spans and structured book/chapter/verse fields.
  - No range refs appear in the output.

### TC-RESOLVE-010 — Per-request versification override does not mutate preferred

- **Level:** integration · **Priority:** Required · **Category:** data-integrity · **Traces:** REQ-091
- **Preconditions:**
  - A translation with a non-preferred but associated scheme; authenticated client.
- **Steps:**
  1. `GET /api/resolve` supplying the `*_versification` override for the non-preferred scheme.
  2. `GET` the translation's associations (or preferred) afterward.
- **Expected result:**
  - The resolve uses the override scheme.
  - The stored preferred association is unchanged.

### TC-RESOLVE-011 — Well-formed bcvRange accepted on the resolve API

- **Level:** integration · **Priority:** Required · **Category:** functional · **Traces:** REQ-092
- **Preconditions:**
  - Schemes ready for a chapter with a mapped range; authenticated client.
- **Steps:**
  1. `GET /api/resolve` with a well-formed range ref.
- **Expected result:**
  - `200`; the response expands into individual single-verse spans.

### TC-RESOLVE-012 — Resolve never loads verse text

- **Level:** unit · **Priority:** Optional (CI/CD / Automation candidate) · **Category:** functional · **Traces:** REQ-093
- **Preconditions:**
  - Instrumentation on the DB/loader to detect `verse_span.content` reads.
- **Steps:**
  1. Perform a resolve (module or instrumented API call).
- **Expected result:**
  - No `verse_span.content` load occurs (resolve operates on structure only).

### TC-RESOLVE-013 — Unequal-length range zip clamps (Interim)

- **Level:** integration · **Priority:** Required · **Category:** boundary · **Traces:** REQ-094
- **Preconditions:**
  - Translations/schemes with a constructed mapping of unequal source/target range lengths.
  - Authenticated client.
- **Steps:**
  1. `GET /api/resolve` through that mapping.
- **Expected result:**
  - `200` (no error); indexes zip up to the shorter length; excess indexes clamp to the last element (Interim binding).

### TC-RESOLVE-014 — Identity hop when no covering row exists

- **Level:** integration · **Priority:** Required · **Category:** functional · **Traces:** REQ-095
- **Preconditions:**
  - A verse with no covering mapping row in the hop between the selected schemes.
  - Authenticated client.
- **Steps:**
  1. `GET /api/resolve` for that verse.
- **Expected result:**
  - `200`; relation is identity `one_to_one`.

### TC-RESOLVE-020 — Part embedded in a ref string is invalid

- **Level:** integration · **Priority:** Required · **Category:** invalid-input · **Traces:** REQ-088, REQ-096
- **Preconditions:**
  - Authenticated client; two translations ready for resolve.
- **Steps:**
  1. `GET /api/resolve` with a ref containing a part suffix (e.g. `SIR 36:13a`).
- **Expected result:**
  - `400` with the bad-request envelope.

### TC-RESOLVE-021 — Cross-chapter range input is invalid (Interim)

- **Level:** integration · **Priority:** Required · **Category:** invalid-input · **Traces:** REQ-097
- **Preconditions:**
  - Authenticated client; two translations ready for resolve.
- **Steps:**
  1. `GET /api/resolve` with a range spanning two chapters.
- **Expected result:**
  - `400` (Interim binding).

### TC-RESOLVE-022 — Missing translation returns 404 before resolving

- **Level:** integration · **Priority:** Required · **Category:** error-handling · **Traces:** REQ-098
- **Preconditions:**
  - Authenticated client; an unknown translation id.
- **Steps:**
  1. `GET /api/resolve` referencing the unknown translation.
- **Expected result:**
  - `404` is returned before any resolver work runs.

### TC-RESOLVE-023 — Override scheme not associated returns 409

- **Level:** integration · **Priority:** Required · **Category:** invalid-input · **Traces:** REQ-099
- **Preconditions:**
  - A scheme that exists but is not associated with the translation; authenticated client.
- **Steps:**
  1. `GET /api/resolve` with that scheme as the `*_versification` override.
- **Expected result:**
  - `409` is returned.

### TC-RESOLVE-024 — No preferred scheme returns 409

- **Level:** integration · **Priority:** Required · **Category:** error-handling · **Traces:** REQ-100
- **Preconditions:**
  - A translation with no preferred association; authenticated client.
- **Steps:**
  1. `GET /api/resolve` without an override.
- **Expected result:**
  - `409` with `code = "no_preferred_scheme"`.

### TC-RESOLVE-025 — T10 no shared ancestor returns 422

- **Level:** integration · **Priority:** Required · **Category:** error-handling · **Traces:** REQ-101
- **Preconditions:**
  - Two translations whose preferred schemes sit on disjoint `based_on` chains.
  - Authenticated client.
- **Steps:**
  1. `GET /api/resolve` between them.
- **Expected result:**
  - `422` (residual `LookupError` mapped by the API).

### TC-RESOLVE-026 — Cycle in based_on chain is detected

- **Level:** unit · **Priority:** Optional (CI/CD / Automation candidate) · **Category:** error-handling · **Traces:** REQ-102
- **Preconditions:**
  - Schemes whose `based_on` relationships form a cycle; direct access to chain-building.
- **Steps:**
  1. Call `build_chain` for one of them.
- **Expected result:**
  - `LookupError` (cycle) is raised.

### TC-RESOLVE-027 — complex relations are never stored

- **Level:** integration · **Priority:** Required · **Category:** data-integrity · **Traces:** REQ-103, REQ-170
- **Preconditions:**
  - A completed complex resolve via the API (see TC-RESOLVE-007).
- **Steps:**
  1. Inspect `mapping_record` rows (DB or admin/query surface available to the tester).
- **Expected result:**
  - No rows have relation `complex` (complex is computed at resolve time only; only atomic derived rows are persisted).

### TC-RESOLVE-028 — verse_end before verse_start is invalid

- **Level:** integration · **Priority:** Required · **Category:** boundary · **Traces:** REQ-104
- **Preconditions:**
  - Authenticated client; two translations ready for resolve.
- **Steps:**
  1. `GET /api/resolve` with a ref whose `verse_end < verse_start`.
- **Expected result:**
  - `400` with the bad-request envelope.

---

## Navigation, deltas, misalignments (`NAV`)

### TC-NAV-001 — Navigation tree built from maxVerses + spans

- **Level:** integration · **Priority:** Required · **Category:** functional · **Traces:** REQ-110
- **Preconditions:**
  - A translation with a preferred scheme and ingested spans; authenticated client.
- **Steps:**
  1. `GET /api/translations/{id}/navigation` (with the relevant versification).
- **Expected result:**
  - A `NavBook[]` structure is returned, derived from the scheme's `maxVerses` and the translation's spans.

### TC-NAV-002 — Deltas are paginated and ordered by source starting BCV

- **Level:** integration · **Priority:** Required · **Category:** functional · **Traces:** REQ-111
- **Preconditions:**
  - Two schemes with derived mappings between them; authenticated client.
- **Steps:**
  1. `GET /api/resolve/deltas` for the pair.
- **Expected result:**
  - Response is `{items, total}` ordered by from-side starting BCV (`navigation`: USX book, chapter, verse, part). A range label such as `PSA 62:1-12` orders by `PSA 62:1`.

### TC-NAV-003 — Misalignment category filter uses the fixed vocabulary

- **Level:** integration · **Priority:** Required · **Category:** functional · **Traces:** REQ-112, REQ-169
- **Preconditions:**
  - Deltas that have been categorized; authenticated client.
- **Steps:**
  1. Filter deltas by each category: `psalm_title`, `chapter_boundary`, `chapter_count`, `lxx_psalm`, `synodal`, `nt_omission`, `other`.
- **Expected result:**
  - Each filter returns only entries of that category; the category vocabulary is exactly these seven values.
  - Representative seeds confirm heuristic assignment for the common cases (not an exhaustive per-verse golden list; see A-08).

### TC-NAV-004 — Discrete navigation_ref / navigation contract

- **Level:** integration · **Priority:** Required · **Category:** functional · **Traces:** REQ-113
- **Preconditions:**
  - A mapping whose `source_ref` is a range form; authenticated client.
- **Steps:**
  1. `GET /api/resolve/deltas` and inspect a `DeltaEntry` for that mapping.
- **Expected result:**
  - `navigation_ref` is the single-verse lower bound; `navigation` is a structured BCV object.
  - `navigation_ref` is legal to feed back as a resolve `ref`.

### TC-NAV-005 — Jump uses navigation object, never parses source_ref

- **Level:** e2e · **Priority:** Required · **Category:** functional · **Traces:** REQ-114, REQ-187
- **Preconditions:**
  - The viewer with deltas loaded, including at least one range-labeled entry.
- **Steps:**
  1. Select a jump entry whose label is a range (e.g. `PSA 3:0-8`).
- **Expected result:**
  - The target column's BCV matches the entry's structured `navigation` (correct book/chapter/verse).
  - The column does not land on a mis-parsed range (e.g. treating the whole range string as a single ref).

### TC-NAV-006 — Jump menu has three sections

- **Level:** e2e · **Priority:** Required · **Category:** functional · **Traces:** REQ-189
- **Preconditions:**
  - Viewer with two translations and deltas loaded.
- **Steps:**
  1. Open a column's jump menu.
- **Expected result:**
  - Three sections are present: (1) mapped deltas; (2) misalignment categories with UI-owned human labels for the seven category vocab values; (3) arbitrary verses (book/chapter from navigation, verse from loaded spans).

### TC-NAV-007 — Jump selection sets structured BCV and re-resolves

- **Level:** e2e · **Priority:** Required · **Category:** functional · **Traces:** REQ-190
- **Preconditions:**
  - A jump menu is open in a column.
- **Steps:**
  1. Select an entry.
- **Expected result:**
  - That column's structured BCV updates to the jumped position.
  - Alignment/overlay (or follower highlight) updates for the new position.

### TC-NAV-010 — Nav/deltas/misalignments share resolve override error rules

- **Level:** integration · **Priority:** Required · **Category:** error-handling · **Traces:** REQ-115
- **Preconditions:**
  - Same conditions as the resolve override error cases; authenticated client.
- **Steps:**
  1. Call navigation, deltas, and misalignments with a bad/missing versification override (unknown translation, unassociated override, no preferred).
- **Expected result:**
  - Each returns the same `404` / `409` / `no_preferred_scheme` behavior as `/api/resolve`.

### TC-NAV-011 — Counterpart jump disabled with a single translation

- **Level:** e2e · **Priority:** Required · **Category:** functional · **Traces:** REQ-116
- **Preconditions:**
  - Only one user translation exists.
- **Steps:**
  1. Open the viewer.
- **Expected result:**
  - The counterpart column's jump menus are disabled.

### TC-NAV-012 — Optional book filter on deltas

- **Level:** integration · **Priority:** Required · **Category:** boundary · **Traces:** REQ-117
- **Preconditions:**
  - Mappings spanning multiple books; authenticated client.
- **Steps:**
  1. `GET /api/resolve/deltas?book=<book>`.
- **Expected result:**
  - Results are scoped to the requested book.

### TC-NAV-014 — Jump-books API summary

- **Level:** integration · **Priority:** Required · **Category:** boundary · **Traces:** ADD-S-003
- **Preconditions:**
  - Eng↔org (or equivalent) pair with known book-level jump differences; authenticated client.
- **Steps:**
  1. `GET /api/resolve/jump-books` with the pair and scheme overrides.
  2. Compare against cancel-filtered deltas book set.
- **Expected result:**
  - `200` `{ books: string[] }` in USX order; books match distinct from-side navigation targets from cancel-filtered rows; identical schemes yield `[]`; missing translation `404`; unassociated scheme `409`.

### TC-NAV-015 — Book dropdown markers and legend

- **Level:** e2e · **Priority:** Required · **Category:** nav · **Traces:** ADD-U-003
- **Preconditions:**
  - Two associated translations with known jump differences (e.g. eng↔org Psalms).
- **Steps:**
  1. Open the viewer with both columns populated.
  2. Inspect each column's book `<select>` and legend.
  3. Select a marked book.
- **Expected result:**
  - Legend `● Book has mapping differences` visible in both columns when translations are selected.
  - Marked books show ` ●` suffix in option text only; `value` stays bare USFM.
  - URL book param updates without the marker character.
