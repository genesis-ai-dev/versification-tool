# Versification Viewer: Spec Reconciliation Decision Log

**Status:** Reconciliation applied
**Audience:** Anyone producing the execution plan or generating code from the FRVT-3 specs.
**Scope:** Records the cross-document decisions applied to reconcile the four FRVT-3 specs so they no longer contradict each other. Each entry states the decision and the sections it touched. The specs themselves remain authoritative; this log is a provenance/orientation aid.

Reconciled documents:

- [frvt-3-resolver-requirements-1.md](./frvt-3-resolver-requirements-1.md)
- [frvt-3-resolver-1.md](./frvt-3-resolver-1.md)
- [frvt-3-server-db-api-design-1.md](./frvt-3-server-db-api-design-1.md)
- [frvt-3-ui-design-1.md](./frvt-3-ui-design-1.md)

Supporting (non-authoritative): [research/frvt-versification-viewer-poc-1.md](../research/frvt-versification-viewer-poc-1.md), [research/frvt-versification-standards-and-tooling-1.md](../research/frvt-versification-standards-and-tooling-1.md), and the prototype under [research/prototypes/frontier_web/](../research/prototypes/frontier_web/).

---

## Decisions

### Canonical bootstrap and numbering-space anchors

Resolution pivots through a `translation` anchor (e.g. `org`), and scheme ingest fails if the named base does not exist — yet no document owned creating the canonical anchors, and seeding them as ordinary translations would break the UI empty state.

Decision: the server owns an idempotent bootstrap/seed step that creates the canonical numbering-space translations (`org`, `eng`, `lxx`, `rso`, `rsc`, `vul`) and their canonical schemes. Each anchor translation carries `is_anchor = true` and is excluded from `GET /api/translations` and the UI empty-state count, so a clean install still presents the upload-first empty state while `basedOn` lookups resolve.

Applied in: server §5.7 (new), server §6.1.1 (`is_anchor` column + ER), server §7.3 (anchor exclusion), requirements assumption A21 and ER model, UI §3.2 empty-state note.

### Upload base default versus root handling

VRS conversion previously defaulted a missing `basedOn` to `org`, which conflicted with treating a missing `basedOn` as a root (null).

Decision: bootstrap creates the canonical roots (`org` is the null-base root; others get their canonical base). Every scheme ingested via the API (standalone upload or inside a project zip) is assumed to be based on a canonical versification and defaults `basedOn` to `org` when absent. The null-base root case applies only to bootstrapped schemes, so a scheme is never based on itself.

Applied in: requirements A22 (new), A17; resolver §8.1, §8.2, §8.3; server §6.1.3.

### Reference and part separation on the boundary

The UI built refs like `SIR 36:13a` (part appended), but the resolver grammar has no part component, so partial resolves would raise.

Decision: the reference on the wire is `BOOK C:V` / `BOOK C:V-V` with no part; a sub-verse part travels as a separate field/parameter everywhere (resolve `part` query param, `verse_span.part`, `mapping_record.part`).

Applied in: requirements A23 (new), A3, A8; resolver §3.1, §4.1, §6.1, §9; server §3.2, §7.8; UI §3.2, §7.4 (`toResolveArgs`), §7.6, §12.1.

### Project ingest requires a versification file (all-or-nothing) and missing-versus-invalid status

The requirements allowed a translation-only project ingest, while the server treated a missing versification file as a hard failure; the error status (400 vs 422) for missing files was also unspecified because the ingest port only returned generic issues.

Decision: project ingest is all-or-nothing and requires both a USX tree and a `.vrs`; nothing is persisted on any failure. Translation-only ingest is out of scope for the project endpoint. `IngestIssue` gains a `kind` (`missing` | `invalid`): a `missing` issue maps to `400`, an `invalid` issue to `422`.

Applied in: requirements Path A, A15, failure table; resolver §3.2, §8.1, §8.2, §9; server §7.7.1, §8.2.

### Structured coordinates on resolved spans

The UI needed `book`/`chapter`/`verse` on resolved spans to load a cross-chapter follower without tokenizing the ref.

Decision: `ResolvedSpan` carries `book`/`chapter`/`verse` (with `ref`, `seq`, `part`). The resolver DTO stays ref+part; the API resolver port fills the structured fields by parsing the single-verse ref it emits (server-side parsing is allowed).

Applied in: server §7.2, §8.1.

### Discrete jump-menu navigation targets

The UI must never parse ranges, but jump entries exposed only range-form refs, and the lower-bound derivation was unowned.

Decision: the API deals in discrete verses for navigation. `DeltaEntry` and `MisalignmentEntry` carry a discrete `navigation_ref` plus structured `navigation` (a `NavRef`), derived server-side as the from-scheme lower bound of a range (single-verse refs pass through). The range-form `source_ref` / `base_ref` remain opaque display-only labels the UI renders but never parses.

Applied in: server §7.2 (`NavRef`, DTO fields), §7.9; UI §6.6, §9.2, §12.

### Partial-verse derivation

The server and resolver disagreed on whether the part is embedded in `source_ref` or held separately.

Decision: `source_ref` stays plain BCV; the part is stored in a dedicated nullable `mapping_record.part` column and matched by `(source_ref, part)`. No re-reading of the ingredient at resolve time.

Applied in: requirements A3, derivation table, ER model; resolver §5, §7.1; server §6.1.5, §6.3.

### Delta/misalignment categorization ownership

Ownership of the category assignment rules was unassigned.

Decision: categorization is owned by the ETL/API derivation layer (heuristics plus a small known-divergence table), not the pure coordinate resolver.

Applied in: server §7.9, §11; resolver §11; requirements TBD table.

### Composite (`complex`) many-to-many alignments

Alignments can compose across the pivot (e.g. a split toward the base combined with a split/merge from the other side), forming a connected graph of verses that the previous single-relation model could not represent.

Decision: a new resolve-time-only relation value `complex` is added to the vocabulary. When composition yields a many-to-many connected component, resolve returns the complete hull — all participating source and target spans — plus explicit connector `edges` (source-index to target-index pairs), each edge carrying its own relation. Intermediate pivot spans are not returned to the caller but are logged on the backend under a controllable diagnostics setting. The UI renders the hull as a graph with per-edge coloring/labels.

Applied in: requirements A2, A9, A24 (new), resolve contract, algorithm; resolver §3.1 (`ResolutionEdgeDTO`, `edges`), §3.3, §6.1, §6.5, §6.8 (new), §10, §11; server §5.6 (`RESOLVE_TRACE_PIVOTS`), §5.2, §6.2, §7.2 (`ResolveEdge`, `edges`), §7.8, §8.1; UI §7.6, §8.1, §8.2, §8.4, §9.2, §11.3, §13.

### Overlay toggle scope

The server capability table tied the overlay toggle to the chapter-wide deltas endpoint, contradicting the locked UI decision.

Decision: the overlay toggle draws the current `ResolveResult` only; other-verse mappings surface through the jump menu.

Applied in: server §2.3 capability row 8; UI §2.3 row 8, §9.2.

### Resolve error-status precedence

The server both mapped all resolver `LookupError`s to `409` and separately required `404` for missing translations, and `409` for "no shared ancestor" was semantically wrong.

Decision: the API pre-checks translation existence (`404`) and the selected scheme (`409`) before calling the resolver; a `ReferenceError` maps to `400`; any residual `LookupError` (no shared ancestor / missing intermediate preferred scheme) maps to `422`.

Applied in: server §7.8, §8.1; resolver §3.1, §9.

### `source_format` on project ingest

The column is not-null but the ingest form had no `source_format` field.

Decision: `source_format` is inferred from the zip and set server-side — USX present yields `usx`; USFM-only converted yields `usfm`; when both USX and USFM are present, `usx`.

Applied in: server §6.1.1, §7.7.1.

### Prototype naming (non-authoritative)

The prototype `contracts.ts` uses a single `based_on` field and a `ResolvedSpan` without structured coordinates.

Decision: left as a porting note. The prototype and `research/` are untouched; when the real UI is built, its types mirror the reconciled server §7.2 (`based_on_name` / `based_on_id`, structured `ResolvedSpan`, `edges`, `navigation`). UI prose that said `based_on` loosely now says `based_on_name`.

Applied in: UI §6.5, §9.2 (prose only); prototype code intentionally unchanged.

---

## Addendum: preferred versification & per-request selection

A later change request renamed the `active` versification flag to **`preferred`** and separated the translation's default scheme (CRUD-managed) from a per-request versification selection (side-by-side viewer). The decisions below were applied across all four specs.

### Rename `active` → `preferred`

The `translation_versification.active` flag becomes `preferred`, along with its endpoint, DTO field, partial unique index, and all prose. Semantics of "at most one per translation" are unchanged.

Applied in: server §2.3, §3.2, §5(consolidated assumptions), §6.1.4, §7.6, §7.7.1, §7.8, §8.1, §10.3, error table; resolver §1.1, §3.1, §5, §6.1–6.2, §8.5, §9, §12.2, §13; requirements Overview, A1, A10, A15, ER, Path A, algorithm; UI §2.3, §3.2, §6.5, §7.1–7.3, §7.6, §9.2, §9.3, §11.3, §12.

### Preferred is the ingested default and is not deletable (rules 2–4)

The scheme ingested with a translation is `preferred` by default. The preferred scheme is changed via `PUT /api/translations/{id}/versifications/{scheme_id}/preferred` (selecting another already-associated scheme). A `DELETE` of the preferred association returns `409`; the caller must first make another association preferred. A translation therefore always keeps exactly one preferred scheme once it has any association.

Applied in: requirements A15, A25; server §6.1.4, §7.6, §7.7.1; UI §2.3 row 14, §3.2, §6.5.

### Per-request versification selection (rules 5, 7, 8)

Decision (resolver placement = API-owns-default): coordinate endpoints — `GET /api/resolve` (`from_versification` / `to_versification`), `/api/resolve/deltas`, `/api/resolve/misalignments` (both `*_versification`), and `GET /api/translations/{id}/navigation` (`versification`) — accept an optional versification id per side. The API resolves the override (when supplied) or the translation's preferred scheme into a concrete scheme and passes it to the resolver. The resolver's `resolve()` additionally accepts optional `*_scheme` plus `*_translation` ids and, when a scheme is omitted, loads that translation's preferred scheme itself (so both layers "support optional versification IDs"). A per-request selection never mutates `preferred`. In the side-by-side UI, each column stores its selection in a URL param (`lvers` / `rvers`) and sends it with every relevant request; clearing it falls back to preferred. `/verses` is unaffected (seq-ordered, versification-independent).

Applied in: requirements A10, A26; server §2.3 row 9b, §3.2, §7.8, §7.9, §8.1; resolver §3.1, §6.1; UI §2.3 row 9, §3.2, §6.5, §7.1, §7.3, §7.6, §9.3.

### Invalid override & missing preferred status codes (rules 8, 9)

Decision: an explicit `*_versification` that names a non-existent scheme returns `404`; one that exists but is not associated with the translation returns `409`. When no override is supplied and the translation has no preferred scheme, the request returns `409` (`no_preferred_scheme`).

Applied in: requirements A26, A27; server §5.4 status table, §7.8, §7.9, §8.1, §10.3; resolver §9.
