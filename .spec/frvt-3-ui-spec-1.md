# Versification Viewer: UI Design Specification

**Status:** Draft for review and reconciliation
**Audience:** The developer implementing the React frontend; and the developers writing the server, resolver, and ETL specifications that this document is reconciled against.
**Scope of this document:** The React single-page application under `frvt/web/`: screens, client state, SVG overlay rendering, and API consumption conventions. It does not specify the HTTP API shapes, the mapping resolver, or ETL/ingest internals. Those are owned by separate specifications and appear here only as consumption contracts and reconciliation items.

> **Modification policy.** The normative body of this specification (numbered sections before **Addenda**) is frozen after initial reconciliation and is **never edited**. All post-reconciliation changes are recorded only in **Addenda** at the end of this file.
>
> - **Subsections** (`### ADD-*-NNN`) represent logical spec extensions or modifications — one subsection per issue discovery or requirements change. A subsection may list multiple modification rows. The subsection **title** and **Purpose** describe the extension at a **capability or logical level** (what the spec must support); they do not list field names, section ids, or other implementation detail.
> - **Modification rows** (within a subsection table) are the atomic changes: each row has its own id, cites the section identifier(s) being changed, states an **Action** (`ADD`, `CLARIFY`, `REPLACE`, `REMOVE`), and provides the **effective text**. Detail lives here, not in the Purpose paragraph. Rows with `REPLACE` or `REMOVE` supersede or void the cited main-body text **logically** when computing the effective specification; they do **not** authorize editing the main body.
> - **Effective specification:** Start from the frozen main body, then apply addendum subsections in order; within each subsection, apply modification rows in listed order. Later rows override earlier ones for the same target. The on-disk main body always remains unchanged.

---

## 1. Overview

This specification describes the frontend for the versification viewer proof-of-concept (POC). The POC displays two Bible translations side by side and aligns them across differing versifications, as described in [research/frvt-versification-viewer-poc-1.md](../research/frvt-versification-viewer-poc-1.md). The HTTP API this UI consumes is defined in [frvt-3-server-and-api-spec-1.md](frvt-3-server-and-api-spec-1.md).

The frontend has four responsibilities:

1. Render a desktop two-column scripture viewer with per-column navigation, jump menus, and versification switching.
2. Draw outlines and connector lines for the **current** alignment only, using an SVG overlay driven by denormalized resolve results.
3. Provide manage screens (separate routes) and focused modals for uploading, renaming, associating, and deleting translations and versifications.
4. Consume the FRVT-3 API with same-origin `fetch`, native HTTP Basic authentication, and the uniform error envelope.

The frontend does not compute mappings. It requests resolved spans from the API and draws what it receives.

### 1.1 Operational conventions

The UI is a React + TypeScript SPA. Vite emits built assets to `frvt/web/dist/`; FastAPI mounts that directory at `/` with `StaticFiles(html=True)` (see server §5.5 and §9, and the mount-path ask in [§9.2](#92-required-api-reconciliation)). Access is gated by the browser's native HTTP Basic prompt; there is no custom login form. The layout is desktop-only. Styling uses semantic CSS tokens for a dark, understated, VS Code–like appearance. This is provisional direction, not a pixel-accurate reproduction of Codex/Aquilla. Vite is the build tool for producing static assets; this document does not prescribe a Vite development-proxy workflow.

---

## 2. Scope and non-goals

### 2.1 In scope

- Route map for the viewer and manage screens.
- Two-column viewer: translation selectors, BCV selectors, jump menus, scheme switcher, mapping toggle, verse list by `seq`.
- SVG overlay: outlines, connector topologies, relation-colored visual language, connector-to-void for exclusions.
- Empty state that requires project upload when no translations exist.
- Manage screens for translations and versifications; modals for upload, rename, associate, remove association, and delete confirmation.
- Typed API client conventions, error handling, and URL-owned viewer session state.
- Module layout under `frvt/web/`.
- Contract-level UI tests.

### 2.2 Non-goals (owned by other specifications)

- **HTTP API, database, and server bootstrap.** Defined in [frvt-3-server-and-api-spec-1.md](frvt-3-server-and-api-spec-1.md). This document consumes those endpoints and flags reconciliation items only.
- **Resolver internals.** Mapping pivot and relation classification are specified elsewhere. The UI consumes `ResolveResult` and its `relation` field (values from the `relation_type` vocabulary) as given.
- **ETL/ingest internals.** Parsing and ingredient derivation are specified elsewhere. The UI only posts files and displays validation errors from the envelope.
- **Versification detection.** No sniffer UI. Detection remains external.
- **Editing scripture text.** The viewer is read-only for content.
- **Mobile / responsive layout.** Desktop only for the POC.
- **Production auth, multi-tenant, and scaling concerns.** Native Basic gate only.
- **Vite / local-proxy developer workflow.** Build output and static mount are enough for this spec.

### 2.3 Capability traceability

Every POC capability the UI owns traces to a screen or component and the API surface it consumes. API shapes remain defined by the server spec; this table does not redefine them.

| # | POC capability | UI surface | API surface (server) | Notes |
| --- | --- | --- | --- | --- |
| 1 | Side-by-side display of two translations | `ViewerPage` / `ScriptureColumn` | `GET /api/translations`, `GET /api/translations/{id}/spans` | Spans rendered by `seq`. |
| 2 | Navigation in one column drives alignment in the other | `ViewerSession` resolve cycle | `GET /api/resolve` | Drive→from / follower→to ([§7.6](#76-resolve-request-mapping)); follower may load a new chapter before scroll ([§6.4](#64-viewer-workflow)). |
| 3 | Per-column book/chapter/verse selector | `ColumnChrome` / BCV selectors | `GET /api/translations/{id}/navigation`, spans | Books rendered in API order (USX Bible order). Verse options from loaded chapter spans when navigation omits verse lists. |
| 4 | Per-column jump menu | `JumpMenu` | `GET /api/resolve/deltas`, `/misalignments`, `/navigation` | Unblocked: server provides discrete `navigation_ref` / `navigation` ([§9.2](#92-required-api-reconciliation) #1). |
| 5 | Outlines around mapped verses and partial spans | `MappingOverlay` | `GET /api/resolve` (`part`) | Partial outlines the part node only. |
| 6 | Connector lines between mapped spans | `OverlayController` | `GET /api/resolve` (`seq`) | Topology by `relation` value; edges follow drive/follower, not left/right ([§8.4](#84-overlay-redraw-pipeline)). |
| 7 | Always-on highlight of current verse and its lines | `VerseSpan` CSS + overlay | `GET /api/resolve` | Text highlight stays on; connectors follow toggle. |
| 8 | Toggle for mapping overlays | `ViewerToolbar` `map` URL param | Current `ResolveResult` only | **Not** chapter-wide deltas. Server §2.3 row 8 reworded to match ([§9.2](#92-required-api-reconciliation) #5). |
| 9 | Per-column on-the-fly versification selection (viewer) | `ColumnChrome` scheme select | optional `*_versification` param on resolve / deltas / misalignments / navigation | Local per-request selection sent with all relevant calls; **does not** change the preferred scheme ([§6.5](#65-switching-versifications)). |
| 10 | Ingest translation plus `custom.vrs` from a zipped project | Empty state + upload modal | `POST /api/ingest/project` | Synchronous; UI blocks on the request. |
| 11 | Direct upload of VRS and Copenhagen/Burrito files | Manage versifications modal | `POST /api/versifications/upload` | Then associate separately. |
| 12 | Association of an uploaded versification with a translation | Associate modal; remove association action | `POST` / `DELETE .../versifications/{scheme_id}` | Confirm-delete modal for remove. |
| 13 | CRUD for translations | `/manage/translations` | Server §7.3 | |
| 14 | CRUD for associated versifications, incl. changing the **preferred** scheme | `/manage/versifications` + associations | Server §§7.5–7.6 | `PUT .../versifications/{scheme_id}/preferred` sets the default; the preferred association cannot be deleted (server §7.6). |

---

## 3. Basis and assumptions

### 3.1 Sources

- Architecture and capabilities: [research/frvt-versification-viewer-poc-1.md](../research/frvt-versification-viewer-poc-1.md).
- Domain background: [research/frvt-versification-standards-and-tooling-1.md](../research/frvt-versification-standards-and-tooling-1.md).
- API, auth, error envelope, static mount, and DTOs: [frvt-3-server-and-api-spec-1.md](frvt-3-server-and-api-spec-1.md).
- Relation vocabulary: server §6.2.
- Locked product decisions from FRVT-3 UI design review (this document's §3.2).

### 3.2 Assumptions and locked decisions

These are UI decisions at boundaries shared with sibling specifications. They are collected again in [Section 12](#12-open-questions-and-reconciliation-items).

- **Preferred scheme vs. per-request selection.** Each translation has one **preferred** scheme (its default), managed only through the CRUD screens (`PUT .../preferred`, server §7.6); the ingested scheme is preferred by default and the preferred association cannot be deleted. In the side-by-side viewer, each column independently **selects** a versification (from that translation's associated schemes) that is passed as an optional `*_versification` override on every relevant request; this selection is per-request UI state and **never** changes the preferred scheme. When a column makes no selection, requests omit the param and the server falls back to that translation's preferred scheme. Changing a column's selection invalidates that column's affected mapping data. The two columns select independently and need not share a scheme.
- **BCV grammar.** Use the server grammar, including verse `0`. A sub-verse part is sent as a separate `part` param, never embedded in the `ref` (server §3.2). `GET /api/resolve` receives one concrete verse `ref` plus an optional `part`. Range-based jump entries carry a server-provided discrete `navigation_ref` / structured `navigation`; the frontend never parses a BCV range.
- **Resolve denormalization.** Require individual source and target spans suitable for DOM anchoring. Splits return one-to-many, merges include all source siblings, exclusions return an empty target list, and partial mappings carry part identifiers. `seq` remains the stable rendered anchor.
- **Mapping toggle.** Toggles drawing of the **current** alignment only. It does not load or draw all mappings in the chapter.
- **Exclude presentation.** Connector-to-void: a dashed connector from the source toward a void terminator in the inter-column gutter. No invented target span.
- **Visual language.** Relation-colored outlines, branch/converge topology, line patterns, and textual labels form the v1 baseline. Iteration after the first usable build is expected and allowed.
- **Desktop only.** Target usable layout at approximately 1280px and above. No mobile collapse.
- **Manage IA.** Separate routes away from the viewer. Modals only for upload, rename, associate, remove association, and confirm-delete.
- **Empty state.** When no translations exist, require project upload through an explanatory empty state. Bootstrapped canonical numbering-space anchors (`org`, `eng`, ...) are excluded server-side from `GET /api/translations` (server §5.7), so a clean install still reports `total === 0` and shows the empty state; the UI needs no client-side anchor filtering. Seeded fixtures are appropriate for development, automated tests, and demonstrations only — not as default production content.
- **Auth.** Rely on the browser's native HTTP Basic prompt.
- **Verse 0 display.** Show both `Title` and `0` (for example `Title (0)`). Machine/API value remains `0`.
- **Styling.** Dark, understated, VS Code–like via semantic tokens. Not described as pixel-accurate Codex/Aquilla reproduction.

---

## 4. Technology stack

| Concern | Choice | Rationale |
| --- | --- | --- |
| Language | TypeScript | Matches typed API DTOs; catches ref/relation mistakes at compile time. |
| UI library | React 18+ | Stateful interactive viewer; efficient overlay invalidation. |
| Routing | React Router 6+ | Separate viewer and manage routes; SPA fallback via server `StaticFiles(html=True)`. |
| Build | Vite (build only) | Emits static assets for FastAPI to serve. Dev-proxy workflow is out of scope for this spec. |
| Styling | CSS variables (semantic tokens) + plain CSS | Dark VS Code–like chrome without a design-system package. |
| HTTP | `fetch` with `credentials: "same-origin"` | Same-origin static+API mount; native Basic supplies credentials after challenge. |
| State | URL search params + one `ViewerSession` context | Bookmarkable viewer session without Redux/Zustand/React Query. |
| Overlay | SVG + imperative controller (rAF-batched) | Matches POC; geometry is DOM-driven and redraw-heavy. |
| Tests | Vitest + Testing Library (or equivalent) | Contract tests for labels, DrawPlan topologies, ApiError mapping, empty state. |

### 4.1 Dependencies

Pin majors at implementation time. Expected packages:

```text
react
react-dom
react-router-dom
typescript
vite
```

Dev/test (illustrative): `vitest`, `@testing-library/react`, `msw` (optional for API contract tests).

Do not introduce a global state library, a component library, or OpenAPI codegen for the POC unless reconciliation later requires it.

---

## 5. UI architecture

```mermaid
flowchart TD
  subgraph shell [AppShell]
    nav["Top nav: Viewer · Manage"]
    router["React Router"]
  end
  subgraph viewer [ViewerPage]
    session["ViewerSession: URL sync + caches"]
    toolbar["Toolbar: pair context, map toggle"]
    workspace["ViewerWorkspace"]
    colL["ScriptureColumn left"]
    colR["ScriptureColumn right"]
    overlay["MappingOverlay + OverlayController"]
  end
  subgraph manage [Manage routes]
    tManage["/manage/translations"]
    vManage["/manage/versifications"]
    modals["Modals: upload / rename / associate / remove / delete"]
  end
  subgraph api [api client]
    client["fetch + ApiError"]
  end

  shell --> router
  router --> viewer
  router --> manage
  session --> client
  manage --> client
  workspace --> colL
  workspace --> colR
  workspace --> overlay
  session --> overlay
```

### 5.1 Layer boundaries

| Module | Owns | Must not own |
| --- | --- | --- |
| `api/` | HTTP, error envelope unwrap, resource helpers | UI state, overlay geometry |
| `viewer/ViewerSession` | URL sync, span/nav/association caches, latest `ResolveResult`, scroll-lock | Drawing |
| `viewer/overlay/` | Measure anchors, build DrawPlan, paint SVG | Fetch, BCV range parsing, CRUD |
| `VerseSpan` | DOM anchors (`data-seq`, `data-ref`, `data-part`), click → set current ref | Drawing |
| Manage pages | Lists, detail actions, modal host | Overlay geometry |
| `lib/formatRef` / `lib/bcv` | Display helpers and **building** single-verse refs from structured fields | Parsing ranges |

### 5.2 Authentication

The server gates API and static assets with HTTP Basic (server §5.3). The UI:

1. Issues same-origin requests without a custom Authorization header on first load.
2. Relies on the browser to present the native Basic prompt when it receives `401` + `WWW-Authenticate`.
3. Relies on the browser to attach credentials on subsequent same-origin requests.
4. Shows a simple “Authentication required — reload and sign in” banner only if repeated requests fail after the challenge.

There is no login route and no credential form.

### 5.3 Desktop layout

Minimum comfortable width approximately 1280px. Two columns share horizontal space evenly inside `ViewerWorkspace`. The overlay is an absolutely positioned SVG sibling covering the workspace. Independent vertical scroll per column. No responsive breakpoint that stacks columns.

---

## 6. Screens, routes, and workflows

### 6.1 Route map

| Path | Screen | Purpose |
| --- | --- | --- |
| `/` | `ViewerPage` | Main POC surface. Empty state when `translations.total === 0`. One-translation state when `total === 1` ([§6.3](#63-empty-and-one-translation-states)). |
| `/manage/translations` | `TranslationsManagePage` | List, rename, delete, associate, remove association; project upload. |
| `/manage/versifications` | `VersificationsManagePage` | List, rename, delete; standalone versification upload. |

Shell chrome on all routes: product name, link to Viewer, link to Manage (Translations / Versifications).

Deep links work because the server mounts static files with `html=True` (server §5.5).

### 6.2 Modals (allowed)

Modals are local UI state on manage screens (or on the empty-state CTA). They are never routes.

| Modal | Trigger | API |
| --- | --- | --- |
| Upload project | Empty state CTA; manage translations | `POST /api/ingest/project` |
| Upload versification | Manage versifications | `POST /api/versifications/upload` |
| Rename | Row action | `PATCH` translation or versification |
| Associate scheme | Translation row / detail action | `POST /api/translations/{id}/versifications` |
| Confirm delete (resource) | Row action on translation or versification | `DELETE` translation or versification |
| Confirm remove association | Association row action | `DELETE /api/translations/{id}/versifications/{scheme_id}` |

### 6.3 Empty and one-translation states

When `GET /api/translations` returns `total === 0`:

- Replace the viewer workspace with an explanatory empty state.
- Explain that a Paratext-style project zip (USX + `custom.vrs`) must be uploaded before side-by-side viewing is possible.
- Primary CTA opens the upload-project modal.
- Secondary link to `/manage/versifications` is optional and secondary.

When `total === 1`:

- Render the single selected translation in the left column (or the column that has a translation id).
- Leave the other column on an “Select a second translation” placeholder (or after a second upload, enable the selector).
- Disable resolve, overlay drawing, the map toggle, and jump menus that require a counterpart until both `left` and `right` are set.
- Keep manage / upload available so the user can ingest a second project.

Fixtures under `web/src/fixtures/` (or equivalent) may seed demo/test environments only. Production empty path never assumes seeded content.

### 6.4 Viewer workflow

```mermaid
sequenceDiagram
  actor User
  participant URL as URL params
  participant Sess as ViewerSession
  participant API as /api
  participant Ov as OverlayController

  User->>URL: Set left/right translations and BCV
  URL->>Sess: Sync session
  Sess->>API: GET spans + navigation
  API-->>Sess: Chapter spans by seq
  User->>Sess: Change driving column verse / jump
  Sess->>API: GET /api/resolve (from/to/ref per §7.6)
  API-->>Sess: ResolveResult
  Sess->>Sess: If follower chapter differs, load it and update URL
  Sess->>Sess: Highlight; scroll follower by seq
  Sess->>Ov: Resolve + map toggle + drive side
  Ov->>Ov: Measure, DrawPlan, paint SVG
```

After a successful resolve:

1. Read the primary target's `book` / `chapter` / `verse` / `part` from the structured fields on `ResolvedSpan` ([§9.2](#92-required-api-reconciliation) #6). Do not tokenize `ref`.
2. If the follower's loaded `(book, chapter)` differs from that target, fetch that chapter's spans, update the follower's URL BCV params (`rb/rc/rv/rp` or left equivalents), then proceed.
3. Under scroll-lock, scroll the follower so the primary target `seq` is visible.
4. For `exclude`, do not invent a scroll target.

Follower **scroll offset** is derived, not stored in the URL. Follower **book/chapter/verse** after a cross-chapter resolve **are** written to the URL so refresh stays consistent.

### 6.5 Selecting a versification (viewer)

The viewer's scheme control performs a **per-request selection**, not a preferred-scheme change. Changing the preferred (default) scheme is a CRUD-only action on `/manage/versifications` (`PUT .../preferred`, server §7.6) and is out of the viewer flow.

1. User selects one of the column translation's associated schemes in that column's scheme control (or "Preferred (default)" to clear the selection).
2. Scheme option labels: baseline is `GET /api/translations/{id}/versifications` joined to `GET /api/versifications` by `scheme_id` to obtain `name` / `canonical` / `based_on_name`, with the preferred association marked. If the server later enriches `AssociationOut` ([§9.2](#92-required-api-reconciliation) optional), use the enriched fields and skip the join.
3. The UI stores the selected `scheme_id` in that column's URL param (`lvers` / `rvers`) — **no PUT**. The selection is sent as the `*_versification` override on every subsequent resolve / deltas / misalignments / navigation request for that side; clearing it omits the param so the server uses the preferred scheme.
4. Session invalidates resolve (and delta/misalignment/navigation caches) for that column.
5. Re-resolve the current driving ref; redraw overlay.
6. Column text order remains `seq` order; only connectors and highlights change.

Because the selection is per column and per request, the two columns select independently; the preferred scheme is untouched, so refreshing without the param reverts to the default.

Removing an association is a CRUD action (confirm-remove-association modal, `DELETE /api/translations/{id}/versifications/{scheme_id}`). The **preferred** association cannot be removed (server returns `409`); the manage UI disables its remove control and directs the user to first make another association preferred. If a column's selected (non-preferred) scheme is removed elsewhere, the UI clears that column's `*vers` param and falls back to preferred.

### 6.6 Jump menu

**Unblocked:** the server provides discrete `navigation_ref` / structured `navigation` on jump entries (server §7.9). The UI never parses range-form `source_ref`; it navigates using `navigation` (preferred) or `navigation_ref`, and renders `source_ref` / `base_ref` only as display labels.

Each column provides:

1. **Mapped deltas** — `GET /api/resolve/deltas`. Display `source_ref` / `base_ref` as labels. Navigate using `navigation` (preferred) or `navigation_ref`.
2. **Misalignment categories** — `GET /api/resolve/misalignments` with categories `psalm_title`, `chapter_boundary`, `chapter_count`, `lxx_psalm`, `synodal`, `nt_omission`, `other` (human labels owned by the UI). Same navigation rule.
3. **Arbitrary verses** — book/chapter from `GET .../navigation`; verse from loaded spans (or navigation verse lists if the server adds them later).

Selecting a jump entry sets that column's structured BCV from the structured `navigation` object. The UI must not parse range strings.

Lists reflect server-side cancel filtering and source-starting-BCV order; the UI does not apply a second client-side cancel or sort pass. Identity-locus `partial` entries remain after cancel filtering (the part annotation is the meaningful delta).

---

## 7. State model

### 7.1 URL parameters (viewer source of truth)

| Param | Meaning |
| --- | --- |
| `left`, `right` | Translation UUIDs |
| `lb`, `lc`, `lv`, `lp` | Left book, chapter, verse, part (`lp` empty if none) |
| `rb`, `rc`, `rv`, `rp` | Right book, chapter, verse, part |
| `lvers`, `rvers` | Per-column selected versification scheme UUID (the `*_versification` override); empty/absent means use that translation's preferred scheme |
| `drive` | `left` \| `right` — which column last drove navigation (resolve direction) |
| `map` | `1` \| `0` — overlay connectors on/off for the current alignment |

Defaults when data exists but params are missing: first two translations (or one + unset second), first book/chapter/verse from navigation/spans, `lvers`/`rvers` empty (preferred scheme), `drive=left`, `map=1`.

Follower **scroll offset** is derived from resolve, not stored in the URL. After a cross-chapter resolve, the follower's book/chapter/verse **are** written to the URL ([§6.4](#64-viewer-workflow)).

### 7.2 React state / `ViewerSession`

| State | Location |
| --- | --- |
| Cached spans per `(translationId, book, chapter)` | Session — versification-independent (spans render by `seq`, server §6.1.2) |
| Cached associations per translation | Session |
| Cached navigation per `(translationId, selectedSchemeId ?? "preferred")` | Session — navigation varies by selected versification, so the key includes it |
| Latest `ResolveResult` for the current alignment, keyed by `(from, to, ref, part, fromVers, toVers)` | Session — the selected `*_versification` overrides are part of the key, so switching a column's selection does not reuse a stale result |
| Loading flags and `ApiError` banners | Session |
| Scroll-lock (suppress resolve loops during programmatic scroll) | Session |
| Modal open + draft fields | Local to manage / empty-state hosts |

### 7.3 Derived (never source of truth)

- Highlight set = union of current `source_spans` and `target_spans`.
- DrawPlan = visual-language table × measured anchor rects × `relation`.
- Empty viewer = `translations.total === 0`.
- One-translation viewer = `total === 1` or only one of `left`/`right` set ([§6.3](#63-empty-and-one-translation-states)).
- Can select scheme = associations length > 0 for that translation.
- Selected scheme per column = `lvers`/`rvers` when set (and still associated), else the translation's preferred scheme (resolved server-side).
- Resolve enabled = both translation ids set and each has at least one associated scheme (a per-column selection is optional; the server falls back to preferred).

### 7.4 Building resolve args

The client builds the resolve `ref` and `part` only from structured column fields it already holds. The **part is never concatenated into the `ref`** — it is sent as a separate `part` query param (server §3.2, §7.8):

```ts
// Returns the single-verse `ref` (no part) and the part separately, matching the
// GET /api/resolve `ref` + optional `part` params (§7.6).
function toResolveArgs(
  book: string, chapter: number, verse: number, part: string | null,
): { ref: string; part: string | null } {
  return { ref: `${book} ${chapter}:${verse}`, part };
}
```

Examples: `{ ref: "PSA 3:0", part: null }`, `{ ref: "GEN 1:1", part: null }`, `{ ref: "SIR 36:13", part: "a" }`. Never embed a part in the ref, and never parse a range such as `PSA 3:0-8` on the client.

### 7.5 Verse 0 labeling

| Context | Display |
| --- | --- |
| Verse gutter / selector option | `Title (0)` |
| API / `data-verse` / resolve `ref` | `0` |

### 7.6 Resolve request mapping

`GET /api/resolve` requires `from_translation`, `to_translation`, a single-verse `ref`, and an optional separate `part` (server §7.8), plus the optional per-column `from_versification` / `to_versification` overrides. Derive them from URL state as follows:

| Condition | `from_translation` | `to_translation` | `ref` + `part` | `from_versification` | `to_versification` |
| --- | --- | --- | --- | --- | --- |
| `drive=left` | `left` | `right` | `toResolveArgs` of left BCV (`lb/lc/lv/lp`) | `lvers` if set | `rvers` if set |
| `drive=right` | `right` | `left` | `toResolveArgs` of right BCV (`rb/rc/rv/rp`) | `rvers` if set | `lvers` if set |

Send a `*_versification` param only when the corresponding column has a selection; omit it to let the server use that translation's preferred scheme. The same `*_versification` (or single `versification`) params are attached to the column's deltas, misalignments, and navigation requests so every relevant call reflects the current selection.

Do not call resolve when either translation id is missing, or when either side has no associated scheme (expect `409 no_preferred_scheme` if called anyway). The driving column owns `source_spans`; the follower owns `target_spans`. A `complex` result returns the full source/target hull with `edges`; the driving column owns all `source_spans`, the follower all `target_spans`, and connectors follow `edges` (§8).

---

## 8. Visual language and overlay pipeline

### 8.1 Semantic tokens

Provisional dark VS Code–like tokens (exact values may iterate after first usable build):

| Token | Role | Suggested value |
| --- | --- | --- |
| `--bg` | Page background | `#1e1e1e` |
| `--bg-elevated` | Panels, chrome | `#252526` |
| `--fg` | Primary text | `#cccccc` |
| `--fg-muted` | Secondary text | `#858585` |
| `--border` | Hairlines | `#3c3c3c` |
| `--accent` | Focus / selection | `#3794ff` |
| `--rel-one` | `one_to_one` | `#4ec9b0` |
| `--rel-shift` | `shift` | `#dcdcaa` |
| `--rel-renumber` | `renumber` | `#ce9178` |
| `--rel-split` | `split` | `#c586c0` |
| `--rel-merge` | `merge` | `#569cd6` |
| `--rel-partial` | `partial` | `#9cdcfe` |
| `--rel-exclude` | `exclude` | `#f44747` |
| `--rel-complex` | `complex` (hull fallback when an edge has no color) | `#d7ba7d` |
| `--void` | Void terminator | `#6a6a6a` |

### 8.2 Relation visual language (v1 baseline)

This table is the implementable baseline. Topology rules (branch, converge, to-void) stay stable; colors, dash arrays, corner radii, and label copy may iterate after the first usable build without changing the overlay contract.

| `relation` | Outline | Line pattern | Topology | Label (near connector mid / hub) |
| --- | --- | --- | --- | --- |
| `one_to_one` | `--rel-one`, solid | solid 1.5px | direct 1→1 | omit or `1:1` |
| `shift` | `--rel-shift`, solid | solid 1.5px | direct 1→1 | `shift` |
| `renumber` | `--rel-renumber`, solid | solid 1.5px | direct 1→1 | `renumber` |
| `split` | `--rel-split`; source emphasis, thinner targets | solid 2px | **branch** 1→N | `split` |
| `merge` | `--rel-merge`; target emphasis, thinner sources | solid 2px | **converge** N→1 | `merge` |
| `partial` | `--rel-partial`; outline the part box only | dashed 1.5px | direct (or parent cardinality) | `part {id}` |
| `exclude` | `--rel-exclude`; source only | dashed 1.5px | **connector-to-void** | `absent` |
| `complex` | per-edge relation color (fallback `--rel-complex`); outline every hull span on both sides | per-edge pattern | **graph**: one connector per `ResolveResult.edges` entry (M↔N) | `complex` at hub; each edge may carry its own relation label |

**Toggle (`map`):** when `0`, clear connector/outline SVG for the alignment. Current-verse **text** highlight may remain via CSS. When `1`, draw the current `ResolveResult` only — never fan out chapter deltas into the overlay.

### 8.3 DOM anchor contract

Each rendered span:

```html
<div
  data-side="left"
  data-seq="42"
  data-ref="PSA 3:0"
  data-verse="0"
  data-part=""
>
  <span class="verse-num">Title (0)</span>
  <span class="verse-text">...</span>
</div>
```

Prefer `data-seq` for overlay lookup when `ResolvedSpan.seq` is present. Fall back to `data-ref` (+ part) when `seq` is null. When a part-bearing resolve has no part-specific DOM node (typical for USX whole-verse rows), fall back to the whole-verse node. Partial mappings outline the part-bearing node only when one exists.

### 8.4 Overlay redraw pipeline

```mermaid
flowchart TD
  trig["Trigger: resolve change / scroll / resize / map toggle / scheme switch / spans re-render"]
  trig --> raf["scheduleRedraw via rAF coalesce"]
  raf --> gate{"map===1 and ResolveResult?"}
  gate -->|no| clear["Clear SVG"]
  gate -->|yes| meas["Measure anchor rects by seq within each column root"]
  meas --> plan["Build DrawPlan from relation visual language"]
  plan --> paint["Paint SVG: outlines, connectors, void stub, labels"]
```

**Algorithm:**

1. Overlay root is `position: absolute; inset: 0` over `ViewerWorkspace`. Columns scroll independently underneath.
2. Identify the **drive column** and **follower column** from URL `drive` (not from assuming source=left). `ResolveResult.source_spans` attach to the drive column; `target_spans` attach to the follower.
3. Anchor lookup: within each column root, `querySelector('[data-seq="…"]')`, with `data-ref` fallback. Skip endpoints whose chapter is not yet loaded (session must load the follower chapter first per §6.4).
4. Convert `getBoundingClientRect()` into overlay-local coordinates.
5. Outlines: rounded rects for each participating span (part-clipped when `part` is set).
6. Connector edge attachment (critical for bidirectional drive):
   - From a span in the **left** column, exit at mid-**right** of its box.
   - From a span in the **right** column, exit at mid-**left** of its box.
   - Therefore when `drive=left`, paths run left→right; when `drive=right`, paths run right→left. Never hard-code “source is left.”
7. Connectors by topology (endpoints are drive/follower spans, edges per step 6):
   - **direct:** drive span → follower span (straight or shallow cubic).
   - **split (branch):** one drive hub → N follower targets.
   - **merge (converge):** N drive sources → one follower hub.
   - **complex (graph):** draw one connector per `ResolveResult.edges` entry, linking `source_spans[edge.source_index]` (drive) to `target_spans[edge.target_index]` (follower); color and label each connector by `edge.relation` (fallback `--rel-complex`). Outline every participating hull span on both sides.
   - **to-void:** dashed line from the drive span toward the inter-column gutter, ending at a void terminator (open circle or bar using `--void`). No fake target outline.
8. Labels: short badge near midpoint or hub per §8.2.
9. Coalesce triggers into one `requestAnimationFrame`. Attach scroll listeners on both column scrollports and a `ResizeObserver` on the workspace. Cancel on unmount.
10. Scroll behavior after resolve is owned by `ViewerSession` ([§6.4](#64-viewer-workflow)), not by the overlay painter.

### 8.5 Exclude = connector-to-void

When `relation === "exclude"` and `target_spans` is empty:

- Outline the drive-column span(s) only.
- Draw a dashed connector into a synthetic void slot in the gutter between columns (toward the follower side).
- Label `absent`.
- Never fabricate a counterpart verse or scroll the follower to an unrelated span.

---

## 9. API consumption boundary

The UI consumes the contract in server [§7](frvt-3-server-and-api-spec-1.md#7-api-contract). This section defines client conventions and reconciliation asks only. It does not redefine DTO fields except where a required gap is called out in §9.2.

### 9.1 Client conventions

```text
frvt/web/src/api/
  client.ts       # apiGet / apiSend / apiUpload; credentials: "same-origin"
  errors.ts       # ApiError { status, detail, code, errors? }
  types.ts        # mirrors server §7.2 (ResolvedSpan coords, ResolveEdge/edges, NavRef, navigation)
  translations.ts
  spans.ts
  versifications.ts
  associations.ts
  resolve.ts
  navigation.ts
  ingest.ts
  health.ts
```

- Paths are relative `/api/...`.
- Non-2xx responses parse the server §5.4 envelope into `ApiError`.
- UI mapping:
  - `400` → toast / inline “invalid request”
  - `401` → banner / reload
  - `404` → toast
  - `409` → actionable message (for example no preferred scheme, or an override not associated with the translation)
  - `413` / `422` → show `errors[]` inside the open modal
  - `500` / unknown → generic error banner with `detail` when present
  - `503` → “database unavailable”
- Uploads use `FormData` via `apiUpload`.
- Resolve sends `from_translation`, `to_translation`, and a single-verse (or single partial) `ref` per [§7.6](#76-resolve-request-mapping).
- Abort in-flight resolve when the driving ref changes (`AbortController`).

### 9.2 Required API reconciliation

All of the required/reword items below are **resolved** in the reconciled server spec; this table now records the landed contract the UI codes against.

| # | Ask | Status |
| --- | --- | --- |
| **1** | `DeltaEntry` / `MisalignmentEntry` carry `navigation_ref: str` and `navigation: NavRef { book, chapter, verse, part }` (range lower-bound derivation; single-verse `source_ref` passes through; legal as a resolve `ref`). `source_ref` / `base_ref` stay range-form display-only labels. | **Resolved** (server §7.2, §7.9). Capability 4 unblocked. |
| **2** | Resolve denormalization to individual spans, including `merge` siblings and the `complex` hull with `edges`. | Confirmed (server §7.2 / §7.8 / §8.1). |
| **3** | Single **preferred** scheme (CRUD-managed via `PUT .../preferred`, previous cleared; preferred not deletable) plus an optional per-request `*_versification` override on coordinate endpoints that defaults to preferred and never mutates it. | Confirmed (server §6.1.4, §7.6, §7.8). |
| **4** | BCV grammar with verse `0`; the sub-verse **part is a separate `part` param**, never embedded in `ref`. | **Resolved** (server §3.2, §7.8). `toResolveArgs` sends `ref` + `part` ([§7.4](#74-building-resolve-args)). |
| **5** | Server §2.3 capability row 8 reworded: overlay toggle uses the current `ResolveResult` only; other-verse mappings surface via the jump menu. | **Resolved** (server §2.3 row 8). |
| **6** | `ResolvedSpan` carries `book`, `chapter`, `verse` (with `ref`, `seq`, `part`) so the UI loads a cross-chapter follower without tokenizing `ref`. | **Resolved** (server §7.2). |
| **7** | FastAPI `StaticFiles(html=True)` mounts `frvt/web/dist/` (Vite build output), not `frvt/web/`. | Confirmed (server §5.5, §9). |

Additional landed items the UI relies on: the `complex` relation type (many-to-many hull + `edges`, server §6.2 / §7.2) — the overlay must render it ([§8.2](#82-relation-visual-language-v1-baseline)); bootstrapped canonical anchors are excluded from `GET /api/translations`, so the empty state stays upload-first (server §5.7, [§6.3](#63-empty-and-one-translation-states)).

Optional niceties (not blockers): enrich `AssociationOut` with `scheme_name` / `canonical` / `based_on_name` to avoid the versification-list join for the scheme switcher ([§6.5](#65-switching-versifications)); include verse number lists on `NavBook` if arbitrary jump must work before spans load.

### 9.3 Endpoint usage by screen

| Screen / feature | Endpoints |
| --- | --- |
| Empty / one-translation / upload project | `GET /api/translations`, `POST /api/ingest/project` |
| Viewer columns | `GET /api/translations`, `.../spans`, `.../navigation`, `.../versifications`, `GET /api/versifications` (scheme labels) |
| Resolve + overlay | `GET /api/resolve` |
| Jump menus | `GET /api/resolve/deltas`, `GET /api/resolve/misalignments` (after §9.2 #1) |
| Viewer per-column versification selection | `*_versification` override on resolve / deltas / misalignments / navigation (no write) |
| Set preferred scheme / remove association (CRUD) | `PUT .../versifications/{scheme_id}/preferred`, `DELETE .../versifications/{scheme_id}` (preferred not deletable) |
| Manage translations | Server §7.3 + ingest + associations |
| Manage versifications | Server §§7.5–7.7 |

---

## 10. Module and file layout

```text
frvt/web/
  index.html
  package.json
  tsconfig.json
  vite.config.ts                 # build only; outDir = dist/
  src/
    main.tsx
    App.tsx                      # router + AppShell
    styles/
      tokens.css                 # semantic + relation tokens
      app.css
    api/                         # §9.1
    lib/
      formatRef.ts               # Title (0) display; no range parser
      bcv.ts                     # toResolveArgs (ref + separate part) from structured fields only
    routes/
      ViewerPage.tsx
      TranslationsManagePage.tsx
      VersificationsManagePage.tsx
    viewer/
      ViewerSession.tsx          # URL sync + caches + resolve mapping (§7.6)
      ViewerToolbar.tsx
      ViewerWorkspace.tsx
      ScriptureColumn.tsx
      ColumnChrome.tsx
      VerseList.tsx
      VerseSpan.tsx
      JumpMenu.tsx
      EmptyStateUpload.tsx
      overlay/
        OverlayController.ts     # measure + DrawPlan + rAF; drive/follower edges
        MappingOverlay.tsx       # SVG host
        visualLanguage.ts        # relation → stroke / topology / label
        drawPlan.ts              # pure builders (unit-tested)
    manage/
      ResourceTable.tsx
      modals/
        UploadProjectModal.tsx
        UploadVersificationModal.tsx
        RenameModal.tsx
        AssociateModal.tsx
        DeleteConfirmModal.tsx    # resource delete and association remove
    fixtures/                    # test and demo only
  dist/                          # Vite build output; FastAPI mounts this directory
```

Ownership: this specification owns `frvt/web/`. The server mounts **`frvt/web/dist/`** at `/` ([§9.2](#92-required-api-reconciliation) #7).

---

## 11. Cross-cutting conventions

### 11.1 Orienting comments

Every new exported function, non-trivial component prop, and module-level type carries a short orienting comment explaining why it exists and when to use it. Overlay topology helpers document the relation cases they cover.

### 11.2 Logging

Browser `console` is sufficient for the POC. Log resolve failures and overlay measure misses at a level useful for debugging. Do not log credentials.

### 11.3 Testing

Cover contract behavior, not boilerplate:

- `formatRef` / verse-0 label: `Title (0)` display with machine `0`.
- Jump handling: uses structured `navigation` / `navigation_ref`; never invokes a range parser.
- `drawPlan` / `visualLanguage`: fixtures for each `relation` value — direct, split branch counts, merge converge counts, exclude → void stub with zero target outlines, partial part outline, and `complex` (one connector per `edges` entry, per-edge relation coloring, all hull spans outlined); plus `drive=right` edge direction.
- Toggle off → empty SVG scene.
- `ApiError` maps the §5.4 envelope including `400` and `500`.
- Empty translations → empty-state CTA; one translation → resolve disabled (integration).
- Select a column versification → sets `*vers`, sends `*_versification` override on subsequent calls, invalidates that column's caches, and re-resolves; clearing it falls back to preferred (integration / MSW).
- Resolve mapping: `drive=left` vs `drive=right` swaps from/to; `toResolveArgs` sends the part as a separate `part` (never embedded in `ref`) ([§7.6](#76-resolve-request-mapping)).
- Cross-chapter resolve → follower chapter fetch before scroll (integration).

Do not snapshot entire pages for pixel layout. Do not test thin fetch wrappers that only forward arguments.

### 11.4 Size and reuse

Keep files within project size guidance. Shared concerns live once: `api/client`, `ApiError`, `ViewerSession`, `visualLanguage`, tokens. Manage pages reuse modal primitives rather than forking upload/rename/delete.

### 11.5 Accessibility (POC floor)

- Controls have visible labels (translation, book, chapter, verse, scheme, toggle).
- Keyboard can reach selectors and jump menu entries.
- Contrast follows the dark token set reasonably; full a11y audit is out of scope.

---

## 12. Open questions and reconciliation items

### 12.1 Answers to server §11 UI items

| Server §11 item | UI answer |
| --- | --- |
| Single preferred scheme | Accepted. One preferred (default) scheme per translation, CRUD-managed and not deletable. The viewer additionally makes a per-column, per-request versification selection (the `*_versification` override) that defaults to preferred and never mutates it; the two columns select independently. Changing a column's selection invalidates that column's affected mapping data. |
| BCV grammar | Use the server grammar, including verse `0`. The sub-verse part is sent as a separate `part` param, never embedded in the `ref`. `/api/resolve` receives one concrete verse `ref` plus optional `part`. Range jump entries use server `navigation_ref` / structured `navigation`. The frontend does not parse BCV ranges. |
| Resolve denormalization | Require individual source and target spans for DOM anchoring. Splits are one-to-many; merges include all source siblings; exclusions return an empty target list; partials carry `part`. `seq` is the stable rendered anchor. |

### 12.2 UI → server asks

Authoritative detail lives in [§9.2](#92-required-api-reconciliation). All required/reword asks are **resolved** in the reconciled server spec. Summary:

1. **`navigation_ref` + structured `navigation`** on jump entries, range lower-bound derivation — resolved (server §7.2, §7.9); capability 4 unblocked.
2. **Server §2.3 row 8 reworded** — overlay toggle is current `ResolveResult` only — resolved.
3. **`ResolvedSpan` book/chapter/verse** — resolved (server §7.2).
4. **Separate `part` param** (not embedded in `ref`) — resolved (server §3.2, §7.8).
5. **`complex` relation** (many-to-many hull + `edges`) — the overlay renders it ([§8](#8-visual-language-and-overlay-pipeline)).
6. **Static mount is `frvt/web/dist/`** — confirmed (server §5.5).
7. Optional: enrich `AssociationOut`; optional: verse lists on `NavBook`.

### 12.3 Explicitly deferred (iterate after first usable build)

- Exact stroke widths, dash arrays, corner radii, animation easing.
- Jump-menu chrome density and grouping.
- Whether versification detail pages pretty-print the full ingredient JSON.
- Keyboard shortcuts beyond basic focus order.
- Optional VRS-incompleteness warning badge if ingest later exposes a source-format flag.

---

## 13. Glossary

- **Versification scheme:** a system that assigns book, chapter, and verse numbers to spans of text.
- **Versification mapping:** a relation between spans in one scheme and the spans holding the same text in another, usually a canonical base.
- **Ingredient:** the Copenhagen/Scripture Burrito JSON document describing a scheme.
- **`org`:** the original-language (Hebrew/Greek) numbering, the default canonical base.
- **Span:** an addressable unit of scripture text (`verse_span`), possibly a Psalm title (`verse 0`) or a sub-verse part.
- **Partial verse:** a mapping that covers only part of a verse, represented by a `part` component.
- **Relation type (`relation_type`):** the shared vocabulary of mapping classifications (`one_to_one`, `shift`, `renumber`, `split`, `merge`, `exclude`, `partial`, and the resolve-time-only `complex`). The DTO field that carries a value from this vocabulary is `relation`.
- **Complex hull:** a many-to-many resolved alignment; `ResolveResult` returns all participating source and target spans plus `edges` (index pairs, each with its own relation) that the overlay draws as a graph.
- **Drive column / follower column:** the column named by URL `drive` vs the other; resolve `from_translation`/`source_spans` belong to drive, `to_translation`/`target_spans` to follower.
- **Current alignment:** the `ResolveResult` for the driving column's current single-verse ref; the only mapping the overlay draws.
- **Connector-to-void:** exclude presentation: dashed connector from the drive span to a gutter void terminator with no target span.
- **DrawPlan:** pure overlay description (outlines, paths, labels) produced from measured anchors and the `relation` value.
- **`navigation_ref`:** server-provided single-verse (or single-partial) BCV used as a jump target so the UI never parses ranges; accompanied by structured `navigation` when reconciled.
- **`seq`:** stable document-order index for rendered spans; overlay and scroll anchors prefer it over BCV labels.

---

## Addenda

Post-reconciliation modifications. Apply subsections in order (`ADD-*-001`, then `ADD-*-002`, …). Each subsection is one logical extension; modification rows within it are applied in listed order to compute the **effective** specification. The main body above is never edited.

### ADD-U-001 — Visual alignment and category test coverage

**Purpose:** Clarifications required to generate visual tests of all alignment relation types and jump-menu misalignment categories in the viewer overlay and jump menu.

| Mod id | Target | Action | Effective text |
| --- | --- | --- | --- |
| ADD-U-001a | §11.3 | ADD | Manual overlay QA for relation topologies and jump-menu categories is documented in [`.test/visual-demo-walkthrough.md`](../.test/visual-demo-walkthrough.md) (`C-*`, `CAT-*` case ids) and [`.test/multihop-chain-walkthrough.md`](../.test/multihop-chain-walkthrough.md) (`P-*` parity ids). Automated contract tests for resolve/overlay inputs remain in pytest; walkthroughs are not CI-gated initially. |
| ADD-U-001b | §6.6 | ADD | Category filter labels map 1:1 to server §7.9 vocabulary: `psalm_title`, `chapter_boundary`, `chapter_count`, `lxx_psalm`, `synodal`, `nt_omission`, `other` (see [`JumpMenu.tsx`](../frvt/web/src/viewer/JumpMenu.tsx)). |

### ADD-U-002 — Mapping visibility modes

**Purpose:** Three-mode mapping overlay visibility — hidden, current alignment only, and chapter-wide unique alignments with the drive verse emphasized and others dimmed. In chapter mode, the user sees alignments among currently displayed verses without opening the jump menu.

| Mod id | Target | Action | Effective text |
| --- | --- | --- | --- |
| ADD-U-002a | §1 (overview resp. 2) | REPLACE | Draw outlines and connector lines for mapping overlays in three modes: **hidden** clears SVG connectors/outlines; **current** paints one `ResolveResult` at full opacity; **chapter** paints unique alignments for currently displayed drive-column verses via `GET /api/resolve/chapter`, with non-current alignments dimmed. Chapter mode does not require the jump menu. |
| ADD-U-002b | §2.1 | CLARIFY | Mapping visibility is a three-option native `<select>` labeled **Mapping** (`Hidden` / `Current` / `All (dimmed)`), not a boolean checkbox. |
| ADD-U-002c | §2.3 row 8 | REPLACE | Three-mode Mapping control. `current` uses `GET /api/resolve`; `chapter` uses `GET /api/resolve/chapter` with dimming so the user views in-column alignments without the jump menu. Disabled when `!canResolve`. |
| ADD-U-002d | §3.2 (Mapping toggle) | REPLACE | **`off`:** clear overlay SVG. **`current`:** draw the current alignment only. **`chapter`:** draw unique alignments for verses currently displayed in the drive column (from stored `verse_span` rows via the chapter API; not jump-menu deltas). Verse text highlight stays on in all modes. The jump menu is optional for chapter-mode viewing. |
| ADD-U-002e | §7.1 `map` | REPLACE | `map` is `0` \| `1` \| `all`. Absent or unrecognized ⇒ `1` (`current`). Always serialize as `map=0`, `map=1`, or `map=all`. |
| ADD-U-002f | §7.2 | ADD | Session caches chapter resolve: `chapterResolveItems: ResolveResult[] \| null`, `chapterResolveLoading: boolean`. Fetch when `mapMode === "chapter"` and `canResolve`; abort in-flight requests on mode, drive BCV, translation pair, or scheme change. |
| ADD-U-002g | §7.6 | ADD | Chapter fetch uses the same drive→from / follower→to mapping as single resolve: drive column → `from_translation`, follower → `to_translation`; `book` and `chapter` are the drive column's current BCV. |
| ADD-U-002h | §8.2 (toggle paragraph) | REPLACE | **Mapping modes:** `off` clears connector/outline SVG (text highlight may remain). `current` draws the current `ResolveResult` only. `chapter` draws unique alignments visible among currently displayed drive-column verses; emphasize the alignment whose `source_spans` contain the drive `(book, chapter, verse)` (+ `part` when set — membership, not first span index). Non-current outlines, connectors, labels, and void marks use SVG opacity `0.25`; paint dimmed plans first, emphasized last. No duplicate hull paint after server emit-once. Highlights are independent of map mode. No jump-menu interaction is required for chapter mode. |
| ADD-U-002i | §8.4 | REPLACE | Redraw gate covers three map modes (`off`, `current`, `chapter`). Chapter mode builds one `DrawPlan` per chapter item, merges with `mergeDrawPlans`, and paints. Triggers include Mapping select change, resolve change, scroll, resize, scheme switch, and spans re-render. |
| ADD-U-002j | §9.2 row 5 | REPLACE | **`map=1` stays current-only.** **`map=all` (chapter mode)** lets the user view alignments among currently displayed verses without the jump menu, via `GET /api/resolve/chapter` (not deltas). The jump menu remains for cross-chapter navigation and discovery outside chapter overlay mode. |
| ADD-U-002k | §9.3 (Resolve + overlay) | REPLACE | `GET /api/resolve`, `GET /api/resolve/chapter`. |
| ADD-U-002l | §11.3 | ADD | Contract tests: `MapMode` URL round-trip; `mergeDrawPlans` and `indexOfDriveAlignment` (including drive verse in a non-first `source_spans` slot); three-mode overlay behavior. Do not test thin fetch wrappers that only forward arguments. |
| ADD-U-002m | §13 (glossary **Current alignment**) | CLARIFY | In `chapter` mode, "current" is the emphasized alignment whose `source_spans` contain the drive BCV (+ `part` when set), not necessarily the only painted alignment. |
| ADD-U-002n | §6.3, §6.4, §10 layout | CLARIFY | Replace "map toggle" / checkbox wording with Mapping `<select>`. Disable the select when `!canResolve`. |

### ADD-U-003 — Book jump-difference indicators

**Purpose:** Per-book indicators on each column's native book selector for translation-pair jump differences, plus a visible legend, so users see which books have jump-menu deltas or misalignments before opening Jump.

| Mod id | Target | Action | Effective text |
| --- | --- | --- | --- |
| ADD-U-003a | §2.3 row 3 | REPLACE | Per-column book/chapter/verse selector: book options show a unicode suffix on books that have jump-relevant mapping differences for the current pair and schemes (via `GET /api/resolve/jump-books` for that column's from→to direction). Always-visible legend: `● Book has mapping differences`. |
| ADD-U-003b | §10 layout (`ColumnChrome`) | ADD | Native book `<select>`: option **display text** suffixes ` ●` (U+25CF) when the book is in the jump-books set for that column; `value` stays the bare USFM code. Legend visible whenever the Book select is enabled (translation selected). Markers only when `canResolve` and summary data has loaded; unmarked labels while loading or when `!canResolve`. Prefer one visible legend element with an `id` and `aria-describedby` on the Book `<select>`. |
| ADD-U-003c | §7.2 | ADD | Session caches per-side jump-books: e.g. `jumpBooksFor(side): ReadonlySet<string>`. Fetch when `canResolve`; one request per column direction (left-as-from, right-as-from) with `AbortController`; clear cache on translation or versification change before new data arrives. Prefetch independently of Jump panel open state; do not block BCV selection. |
| ADD-U-003d | §9.3 | ADD | `GET /api/resolve/jump-books` per column when both translations are resolvable. |
| ADD-U-003e | §11.3 | ADD | Contract tests: option label suffix when book is flagged; legend visible; bare `value` preserved on selection (no marker leaked into URL book params). Do not test thin fetch wrappers. |
| ADD-U-003f | §6.6 | CLARIFY | Jump-books indicators use the same cancel-filtered row set as Mapped deltas and Misalignments; they are a translation-level summary, not a replacement for the jump menu. |
