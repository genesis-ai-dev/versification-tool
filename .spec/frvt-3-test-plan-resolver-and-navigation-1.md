# FRVT-3 Test Plan — Resolver & Navigation

**Document:** `frvt-3-test-plan-resolver-and-navigation-1`
**Parent index:** [frvt-3-test-plan-1.md](./frvt-3-test-plan-1.md)
**Areas:** resolver & resolve API (`RESOLVE`), navigation / deltas / misalignments (`NAV`)

Shared setup, fixtures, and the traceability matrix live in the [parent index](./frvt-3-test-plan-1.md). "T#" references point at the resolver/ETL spec (§10) golden cases. Interim algorithm bindings are locked for expected results per assumption A-04.

---

## Resolver & resolve API (`RESOLVE`)

### TC-RESOLVE-001 — T1 identity: JHN 3:16 eng→org

- **Level:** unit/integration · **Category:** functional · **Traces:** REQ-080
- **Preconditions:**
  - `eng` and `org` schemes are available to the resolver.
- **Steps:**
  1. Resolve `JHN 3:16` from `eng` to `org`.
- **Expected result:**
  - Relation is `one_to_one`; source and target refs are identical single-verse refs; `edges` is empty.

### TC-RESOLVE-002 — T2 Psalm title shift: PSA 3:1

- **Level:** unit/integration · **Category:** functional · **Traces:** REQ-081
- **Preconditions:**
  - `eng` and `org` schemes available.
- **Steps:**
  1. Resolve `PSA 3:1` from `eng` to `org`.
- **Expected result:**
  - Relation is `shift`; target is `PSA 3:2`.

### TC-RESOLVE-003 — T3 chapter-boundary drift: GEN 31:55

- **Level:** unit/integration · **Category:** functional · **Traces:** REQ-082, REQ-073
- **Preconditions:**
  - `eng` and `org` schemes available.
- **Steps:**
  1. Resolve `GEN 31:55` from `eng` to `org`.
- **Expected result:**
  - Target is `GEN 32:1`.
  - Relation is either `shift` or `renumber` per the Interim `classify_mapped` rule (see risk R-03; assert membership in {shift, renumber}, not a single value).

### TC-RESOLVE-004 — T4 exclude

- **Level:** unit/integration · **Category:** functional · **Traces:** REQ-083
- **Preconditions:**
  - An exclude fixture (a verse excluded in the target scheme).
- **Steps:**
  1. Resolve the excluded verse.
- **Expected result:**
  - `target_spans` is empty; relation is `exclude`.

### TC-RESOLVE-005 — T5 merge

- **Level:** unit/integration · **Category:** functional · **Traces:** REQ-084
- **Preconditions:**
  - A merge fixture (multiple source verses → one target).
- **Steps:**
  1. Resolve one of the merged source verses.
- **Expected result:**
  - `len(source) > 1` and `len(target) == 1`; relation is `merge`.

### TC-RESOLVE-006 — T6 range input PSA 3:0–2 yields single-verse outputs

- **Level:** unit/integration · **Category:** functional · **Traces:** REQ-085, REQ-086
- **Preconditions:**
  - `eng` and `org` schemes available.
- **Steps:**
  1. Resolve the range `PSA 3:0-2`.
- **Expected result:**
  - No exception is raised; verse 0 is valid input.
  - All output refs are single-verse (no ranges in outputs).

### TC-RESOLVE-007 — T11 complex hull with edges

- **Level:** unit/integration · **Category:** functional · **Traces:** REQ-087
- **Preconditions:**
  - A split∘merge (complex) fixture.
- **Steps:**
  1. Resolve a verse whose mapping is complex.
- **Expected result:**
  - Relation is `complex`; `edges` is populated; target spans cover the full connected component (hull).

### TC-RESOLVE-008 — T12 partial part passed as argument

- **Level:** unit · **Category:** functional · **Traces:** REQ-088
- **Preconditions:**
  - A partial-verse fixture; access to `resolve` and `parse_ref`.
- **Steps:**
  1. Call `resolve(ref, part="a")`.
  2. Call `parse_ref("…a")` (part embedded in the string).
- **Expected result:**
  - `resolve` returns a partial result carrying the part.
  - `parse_ref` with an embedded part raises `ReferenceError`.

### TC-RESOLVE-009 — Resolve API happy path

- **Level:** integration · **Category:** functional · **Traces:** REQ-090
- **Preconditions:**
  - Two translations with associated preferred schemes.
- **Steps:**
  1. `GET /api/resolve` for a driving ref between the two translations.
- **Expected result:**
  - `200` with denormalized single-verse spans and structured book/chapter/verse fields.
  - No range refs appear in the output.

### TC-RESOLVE-010 — Per-request versification override does not mutate preferred

- **Level:** integration · **Category:** data-integrity · **Traces:** REQ-091
- **Preconditions:**
  - A translation with a non-preferred but associated scheme.
- **Steps:**
  1. `GET /api/resolve` supplying the `*_versification` override for the non-preferred scheme.
  2. Inspect the translation's preferred association afterward.
- **Expected result:**
  - The resolve uses the override scheme.
  - The stored preferred association is unchanged.

### TC-RESOLVE-011 — Well-formed bcvRange accepted on the resolve API

- **Level:** integration · **Category:** functional · **Traces:** REQ-092
- **Preconditions:**
  - Schemes ready for a chapter with a mapped range.
- **Steps:**
  1. `GET /api/resolve` with a well-formed range ref.
- **Expected result:**
  - The response expands into individual single-verse spans.

### TC-RESOLVE-012 — Resolve never loads verse text

- **Level:** unit · **Category:** functional · **Traces:** REQ-093
- **Preconditions:**
  - Instrumentation on the DB/loader to detect `verse_span.content` reads.
- **Steps:**
  1. Perform a resolve.
- **Expected result:**
  - No `verse_span.content` load occurs (resolve operates on structure only).

### TC-RESOLVE-013 — Unequal-length range zip clamps (Interim)

- **Level:** unit · **Category:** boundary · **Traces:** REQ-094
- **Preconditions:**
  - A constructed mapping with unequal source/target range lengths.
- **Steps:**
  1. Perform the project hop through that mapping.
- **Expected result:**
  - Indexes zip up to the shorter length; excess indexes clamp to the last element; no exception is raised (Interim binding).

### TC-RESOLVE-014 — Identity hop when no covering row exists

- **Level:** unit · **Category:** functional · **Traces:** REQ-095
- **Preconditions:**
  - A verse with no covering mapping row in the hop.
- **Steps:**
  1. Perform the resolve hop.
- **Expected result:**
  - The hop returns an identity `one_to_one` mapping.

### TC-RESOLVE-020 — Part embedded in a ref string is invalid

- **Level:** unit · **Category:** invalid-input · **Traces:** REQ-088, REQ-096
- **Preconditions:**
  - Access to `parse_ref` and the resolve API.
- **Steps:**
  1. Call `parse_ref("SIR 36:13a")`.
  2. Call the resolve API with a ref containing a part suffix.
- **Expected result:**
  - `parse_ref` raises `ReferenceError`.
  - The API returns `400`.

### TC-RESOLVE-021 — Cross-chapter range input is invalid (Interim)

- **Level:** unit · **Category:** invalid-input · **Traces:** REQ-097
- **Preconditions:**
  - Access to `parse_ref` / the resolve API.
- **Steps:**
  1. Provide a range spanning two chapters.
- **Expected result:**
  - `parse_ref` raises `ReferenceError`; the API returns `400` (Interim binding).

### TC-RESOLVE-022 — Missing translation returns 404 before resolving

- **Level:** integration · **Category:** error-handling · **Traces:** REQ-098
- **Preconditions:**
  - Authenticated client; an unknown translation id.
- **Steps:**
  1. `GET /api/resolve` referencing the unknown translation.
- **Expected result:**
  - `404` is returned before any resolver work runs.

### TC-RESOLVE-023 — Override scheme not associated returns 409

- **Level:** integration · **Category:** invalid-input · **Traces:** REQ-099
- **Preconditions:**
  - A scheme that exists but is not associated with the translation.
- **Steps:**
  1. `GET /api/resolve` with that scheme as the `*_versification` override.
- **Expected result:**
  - `409` is returned.

### TC-RESOLVE-024 — No preferred scheme returns 409

- **Level:** integration · **Category:** error-handling · **Traces:** REQ-100
- **Preconditions:**
  - A translation with no preferred association.
- **Steps:**
  1. `GET /api/resolve` without an override.
- **Expected result:**
  - `409` with `code = "no_preferred_scheme"`.

### TC-RESOLVE-025 — T10 no shared ancestor returns 422

- **Level:** unit/integration · **Category:** error-handling · **Traces:** REQ-101
- **Preconditions:**
  - Two schemes on disjoint `based_on` chains.
- **Steps:**
  1. Resolve between them (unit: expect `LookupError`; API: call `/api/resolve`).
- **Expected result:**
  - The resolver raises `LookupError`; the API maps this to `422`.

### TC-RESOLVE-026 — Cycle in based_on chain is detected

- **Level:** unit · **Category:** error-handling · **Traces:** REQ-102
- **Preconditions:**
  - Schemes whose `based_on` relationships form a cycle.
- **Steps:**
  1. Call `build_chain` for one of them.
- **Expected result:**
  - `LookupError` (cycle) is raised.

### TC-RESOLVE-027 — complex relations are never stored

- **Level:** integration · **Category:** data-integrity · **Traces:** REQ-103, REQ-170
- **Preconditions:**
  - A completed complex resolve.
- **Steps:**
  1. Inspect `mapping_record` rows.
- **Expected result:**
  - No rows have relation `complex` (complex is computed at resolve time only; only atomic derived rows are persisted).

### TC-RESOLVE-028 — verse_end before verse_start is invalid

- **Level:** unit · **Category:** boundary · **Traces:** REQ-104
- **Preconditions:**
  - Access to `parse_ref`.
- **Steps:**
  1. Parse a ref whose `verse_end < verse_start`.
- **Expected result:**
  - `ReferenceError` is raised.

---

## Navigation, deltas, misalignments (`NAV`)

### TC-NAV-001 — Navigation tree built from maxVerses + spans

- **Level:** integration · **Category:** functional · **Traces:** REQ-110
- **Preconditions:**
  - A translation with a preferred scheme and ingested spans.
- **Steps:**
  1. `GET /api/translations/{id}/navigation` (with the relevant versification).
- **Expected result:**
  - A `NavBook[]` structure is returned, derived from the scheme's `maxVerses` and the translation's spans.

### TC-NAV-002 — Deltas are paginated and ordered by ordinal

- **Level:** integration · **Category:** functional · **Traces:** REQ-111
- **Preconditions:**
  - Two schemes with derived mappings between them.
- **Steps:**
  1. `GET /api/resolve/deltas` for the pair.
- **Expected result:**
  - Response is `{items, total}` ordered by `ordinal`.

### TC-NAV-003 — Misalignment category filter uses the fixed vocabulary

- **Level:** integration · **Category:** functional · **Traces:** REQ-112, REQ-169
- **Preconditions:**
  - Deltas that have been categorized.
- **Steps:**
  1. Filter deltas by each category: `psalm_title`, `chapter_boundary`, `chapter_count`, `lxx_psalm`, `synodal`, `nt_omission`, `other`.
- **Expected result:**
  - Each filter returns only entries of that category; the category vocabulary is exactly these seven values.
  - Representative seeds confirm heuristic assignment for the common cases (not an exhaustive per-verse golden list; see A-08).

### TC-NAV-004 — Discrete navigation_ref / navigation contract

- **Level:** integration · **Category:** functional · **Traces:** REQ-113
- **Preconditions:**
  - A mapping whose `source_ref` is a range form.
- **Steps:**
  1. Inspect a `DeltaEntry` for that mapping.
- **Expected result:**
  - `navigation_ref` is the single-verse lower bound; `navigation` is a structured BCV object.
  - `navigation_ref` is legal to feed back as a resolve `ref`.

### TC-NAV-005 — Jump uses navigation object, never parses source_ref

- **Level:** e2e/unit · **Category:** functional · **Traces:** REQ-114, REQ-187
- **Preconditions:**
  - The viewer with deltas loaded, including at least one range-labeled entry.
- **Steps:**
  1. Select a jump entry whose label is a range (e.g. `PSA 3:0-8`).
- **Expected result:**
  - The target column's BCV is taken from the entry's `navigation` object.
  - The client does not parse `source_ref`/the range string.

### TC-NAV-006 — Jump menu has three sections

- **Level:** e2e · **Category:** functional · **Traces:** REQ-189
- **Preconditions:**
  - Viewer with two translations and deltas loaded.
- **Steps:**
  1. Open a column's jump menu.
- **Expected result:**
  - Three sections are present: (1) mapped deltas; (2) misalignment categories with UI-owned human labels for the seven category vocab values; (3) arbitrary verses (book/chapter from navigation, verse from loaded spans).

### TC-NAV-007 — Jump selection sets structured BCV and re-resolves

- **Level:** e2e · **Category:** functional · **Traces:** REQ-190
- **Preconditions:**
  - A jump menu is open in a column.
- **Steps:**
  1. Select an entry.
- **Expected result:**
  - That column's structured BCV is set from the entry's `navigation` object (not from string parsing).
  - Resolve re-runs for the new position.

### TC-NAV-010 — Nav/deltas/misalignments share resolve override error rules

- **Level:** integration · **Category:** error-handling · **Traces:** REQ-115
- **Preconditions:**
  - Same conditions as the resolve override error cases.
- **Steps:**
  1. Call navigation, deltas, and misalignments with a bad/missing versification override (unknown translation, unassociated override, no preferred).
- **Expected result:**
  - Each returns the same `404` / `409` / `no_preferred_scheme` behavior as `/api/resolve`.

### TC-NAV-011 — Counterpart jump disabled with a single translation

- **Level:** e2e · **Category:** functional · **Traces:** REQ-116
- **Preconditions:**
  - Only one user translation exists.
- **Steps:**
  1. Open the viewer.
- **Expected result:**
  - The counterpart column's jump menus are disabled.

### TC-NAV-012 — Optional book filter on deltas

- **Level:** integration · **Category:** boundary · **Traces:** REQ-117
- **Preconditions:**
  - Mappings spanning multiple books.
- **Steps:**
  1. `GET /api/resolve/deltas?book=<book>`.
- **Expected result:**
  - Results are scoped to the requested book.
