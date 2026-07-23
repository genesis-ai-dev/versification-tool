# FRVT-3 Test Plan — Viewer & Overlay

**Document:** `frvt-3-test-plan-viewer-and-overlay-1`
**Parent index:** [frvt-3-test-plan-1.md](./frvt-3-test-plan-1.md)
**Areas:** viewer UI session (`UI`), SVG overlay (`OVERLAY`)

Shared setup, fixtures, and the traceability matrix live in the [parent index](./frvt-3-test-plan-1.md). Overlay unit cases use the DrawPlan fixtures described there.

---

## Viewer UI session (`UI`)

### TC-UI-001 — Empty state explains the required upload

- **Level:** e2e · **Category:** functional · **Traces:** REQ-120
- **Preconditions:**
  - A seeded database with no user translations (`total === 0`).
- **Steps:**
  1. Open `/` in the authenticated UI.
- **Expected result:**
  - An empty state explains that a project zip containing USX + `.vrs` is required.
  - A call-to-action opens the project upload flow.

### TC-UI-002 — Two-column session state lives in the URL

- **Level:** e2e · **Category:** functional · **Traces:** REQ-121
- **Preconditions:**
  - At least two user translations exist.
- **Steps:**
  1. Select translations, BCV positions, drive side, and map toggle in the viewer.
  2. Inspect the browser URL.
- **Expected result:**
  - The URL owns `left`/`right`, the BCV parts for each column, `lvers`/`rvers`, `drive`, and `map`.
  - Reloading the URL restores the same session.

### TC-UI-003 — Spans render in seq order regardless of scheme

- **Level:** e2e · **Category:** functional · **Traces:** REQ-122
- **Preconditions:**
  - A translation ingested from a project.
- **Steps:**
  1. Change the selected scheme for a column.
- **Expected result:**
  - The verse rendering order (by `seq`) is unchanged; scheme selection does not reorder verses.

### TC-UI-004 — Verse 0 renders as a title label

- **Level:** unit/e2e · **Category:** ui-visual · **Traces:** REQ-123, REQ-086
- **Preconditions:**
  - A Psalm-title span at verse 0.
- **Steps:**
  1. Render the chapter containing the verse-0 span.
- **Expected result:**
  - The verse-0 span displays as `Title (0)`; the underlying verse value is `0`.

### TC-UI-005 — Drive side controls resolve direction and overlay attachment

- **Level:** integration · **Category:** functional · **Traces:** REQ-124
- **Preconditions:**
  - Two columns ready to resolve.
- **Steps:**
  1. Toggle `drive` between left and right.
- **Expected result:**
  - Resolve "from"/"to" follow the drive side.
  - Overlay source attachment follows the drive side (not hard-coded to the left column).

### TC-UI-006 — Column scheme selection is per-request only

- **Level:** e2e · **Category:** functional · **Traces:** REQ-125, REQ-091
- **Preconditions:**
  - A translation with a non-preferred but associated scheme.
- **Steps:**
  1. Change the column's scheme selector.
  2. Inspect network calls and the stored preferred association.
- **Expected result:**
  - The URL `*vers` param is set and resolve re-runs with the override.
  - No `PUT .../preferred` call is made; the stored preferred is unchanged.

### TC-UI-007 — Follower column loads target chapter and scrolls

- **Level:** e2e · **Category:** functional · **Traces:** REQ-126
- **Preconditions:**
  - A cross-chapter mapping between the two translations.
- **Steps:**
  1. Drive a resolve that lands in a different chapter in the follower column.
  2. Separately, drive an `exclude` result.
- **Expected result:**
  - The follower loads the target chapter, its URL BCV updates, and it scrolls to the target `seq`.
  - An `exclude` result invents no scroll target (nothing to scroll to).

### TC-UI-008 — Verse DOM nodes expose data-* anchors

- **Level:** e2e/unit · **Category:** ui-visual · **Traces:** REQ-127
- **Preconditions:**
  - The viewer loaded with spans.
- **Steps:**
  1. Inspect verse DOM nodes.
- **Expected result:**
  - Each carries `data-side`, `data-seq`, `data-ref`, `data-verse`, and `data-part` attributes.

### TC-UI-009 — Viewer and manage routes render with cross-links

- **Level:** e2e · **Category:** functional · **Traces:** REQ-128
- **Preconditions:**
  - Authenticated session.
- **Steps:**
  1. Visit `/`, `/manage/translations`, and `/manage/versifications`.
- **Expected result:**
  - Each page renders and provides Viewer↔Manage navigation links.

### TC-UI-010 — Error UX mapping matches UI §9.1

- **Level:** unit/e2e · **Category:** error-handling · **Traces:** REQ-129
- **Preconditions:**
  - Ability to provoke each API error class from the UI.
- **Steps:**
  1. Provoke `400`, `401`, `404`, `409`, `413`, `422`, `500`, `503` from user actions.
- **Expected result:**
  - `400` → toast; `401` → auth banner; `404` → toast; `409` → actionable message; `413`/`422` → surfaced in the relevant modal; `500` → generic error; `503` → database-unavailable message.

### TC-UI-020 — Single-translation placeholder disables second column

- **Level:** e2e · **Category:** functional · **Traces:** REQ-130
- **Preconditions:**
  - Exactly one user translation exists (`total === 1`).
- **Steps:**
  1. Open the viewer.
- **Expected result:**
  - The second column shows a placeholder; resolve, overlay, map toggle, and counterpart jumps are disabled.

### TC-UI-021 — In-flight resolve is aborted when the driving ref changes

- **Level:** integration · **Category:** concurrency · **Traces:** REQ-131
- **Preconditions:**
  - A slow resolve (throttled network or large response).
- **Steps:**
  1. Change the driving ref again before the first resolve completes.
- **Expected result:**
  - The prior resolve request is aborted (AbortController); only the latest result is applied.

### TC-UI-022 — Deleted scheme clears the column override

- **Level:** e2e · **Category:** error-handling · **Traces:** REQ-132
- **Preconditions:**
  - A column with `lvers`/`rvers` set to a scheme that is then deleted elsewhere.
- **Steps:**
  1. Refresh or poll so the UI observes the deletion.
- **Expected result:**
  - The `*vers` override is cleared and the column falls back to the preferred scheme.

### TC-UI-023 — No resolve without associated schemes

- **Level:** integration · **Category:** error-handling · **Traces:** REQ-133
- **Preconditions:**
  - A translation with no associated schemes.
- **Steps:**
  1. Attempt to drive a resolve.
- **Expected result:**
  - No resolve request is issued.

### TC-UI-024 — Desktop two-column layout

- **Level:** manual · **Category:** ui-visual · **Traces:** REQ-134
- **Preconditions:**
  - A desktop viewport (~1280px+) and a narrower window.
- **Steps:**
  1. Resize the window across widths.
- **Expected result:**
  - Two columns render side-by-side at desktop widths; no responsive/stacking breakpoint is claimed (mobile layout is out of scope).

### TC-UI-025 — Accessibility floor

- **Level:** manual · **Category:** nfr · **Traces:** REQ-135, REQ-165
- **Preconditions:**
  - Viewer and manage pages loaded.
- **Steps:**
  1. Tab through selectors and jump menus; inspect labels.
- **Expected result:**
  - Controls have visible labels and are keyboard reachable (floor only; a full a11y audit is out of scope).

### TC-UI-026 — Credentials are never logged

- **Level:** unit/manual · **Category:** permissions-auth · **Traces:** REQ-136
- **Preconditions:**
  - Access to UI logging/console output.
- **Steps:**
  1. Exercise auth and API flows while inspecting log/console calls.
- **Expected result:**
  - No password or Basic `Authorization` header value is logged.

### TC-UI-027 — Independent per-column scrolling keeps the overlay aligned

- **Level:** manual · **Category:** ui-visual · **Traces:** REQ-188
- **Preconditions:**
  - Two columns with long chapters.
- **Steps:**
  1. Scroll one column while the other stays put.
- **Expected result:**
  - Columns scroll independently; overlay connectors stay aligned to their anchors; no stacking occurs.

### TC-UI-030 — Per-column BCV selectors

- **Level:** e2e · **Category:** functional · **Traces:** REQ-180
- **Preconditions:**
  - A column with chapter spans loaded and navigation data available.
- **Steps:**
  1. Change book, then chapter, then verse in a column's BCV selectors.
- **Expected result:**
  - Book/chapter options come from navigation; verse options come from navigation and fall back to the loaded chapter spans when navigation omits verses.
  - Each change updates that column's URL BCV.

### TC-UI-031 — Clicking a verse sets the column's current ref

- **Level:** e2e · **Category:** functional · **Traces:** REQ-181
- **Preconditions:**
  - The viewer with spans rendered.
- **Steps:**
  1. Click a `VerseSpan` in the drive column.
- **Expected result:**
  - That column's current ref is set to the clicked verse and a drive resolve is triggered.

### TC-UI-032 — URL defaults applied when params are missing

- **Level:** e2e · **Category:** functional · **Traces:** REQ-182
- **Preconditions:**
  - At least two translations; open `/` with no viewer params.
- **Steps:**
  1. Load the viewer.
- **Expected result:**
  - Defaults are applied: first two translations, first BCV from navigation/spans, empty `lvers`/`rvers`, `drive=left`, `map=1`.

### TC-UI-033 — Cache keying prevents stale reuse

- **Level:** integration · **Category:** functional · **Traces:** REQ-183
- **Preconditions:**
  - Two schemes associated per side.
- **Steps:**
  1. Switch a column's scheme and navigate around.
  2. Inspect cache keys/behavior.
- **Expected result:**
  - The span cache is versification-independent (keyed by `(translationId, book, chapter)`).
  - The navigation cache is keyed by the selected scheme.
  - The ResolveResult cache key includes `fromVers`/`toVers`, so switching scheme does not reuse a stale resolve.

### TC-UI-034 — Scroll-lock suppresses resolve loops

- **Level:** integration · **Category:** concurrency · **Traces:** REQ-184
- **Preconditions:**
  - A cross-chapter resolve that triggers a programmatic scroll in the follower.
- **Steps:**
  1. Drive the resolve and observe the follower's programmatic scroll.
- **Expected result:**
  - The programmatic scroll (under scroll-lock) does not re-trigger a resolve cycle.

### TC-UI-035 — Scheme control options and "Preferred (default)" clear

- **Level:** e2e · **Category:** functional · **Traces:** REQ-185
- **Preconditions:**
  - A translation with at least two associated schemes.
- **Steps:**
  1. Open a column's scheme control and inspect the options.
  2. Select the "Preferred (default)" option.
- **Expected result:**
  - Options are built from associations joined with versifications (showing name / canonical / based_on), with the preferred scheme marked.
  - Selecting "Preferred (default)" clears the `*vers` override.

### TC-UI-036 — Column override applies to all side calls

- **Level:** integration · **Category:** functional · **Traces:** REQ-186
- **Preconditions:**
  - A column with a scheme override selected.
- **Steps:**
  1. Trigger resolve, deltas, misalignments, and navigation for that side.
  2. Inspect the outgoing requests.
- **Expected result:**
  - The `*_versification` override is attached to every relevant request.
  - No `PUT .../preferred` call is made.

### TC-UI-037 — Client libs build single-verse refs only

- **Level:** unit · **Category:** functional · **Traces:** REQ-187
- **Preconditions:**
  - Access to `lib/bcv`, `lib/formatRef`, and the jump handler.
- **Steps:**
  1. Feed a range-form label `PSA 3:0-8` through `toResolveArgs` and the jump handler.
- **Expected result:**
  - `toResolveArgs` builds a single-verse ref only; no range parser is invoked.
  - The jump path uses the structured `navigation` object rather than parsing the label.

---

## Overlay (`OVERLAY`)

### TC-OVERLAY-001 — Map toggle draws the current result only

- **Level:** unit/e2e · **Category:** functional · **Traces:** REQ-140
- **Preconditions:**
  - A current `ResolveResult` for the selected verse.
- **Steps:**
  1. Set `map=0`, then `map=1`.
- **Expected result:**
  - Connectors clear when `map=0`, then draw for the **current** resolve result only when `map=1` (never chapter-wide).

### TC-OVERLAY-002 — Topologies for one-to-one, split, and merge

- **Level:** unit · **Category:** ui-visual · **Traces:** REQ-141
- **Preconditions:**
  - DrawPlan fixtures for each relation.
- **Steps:**
  1. Build the draw plan for each fixture.
- **Expected result:**
  - Correct topology per relation, with edge exits on the correct side per the drive side.

### TC-OVERLAY-003 — Complex edges, one connector each

- **Level:** unit · **Category:** ui-visual · **Traces:** REQ-142
- **Preconditions:**
  - A complex `ResolveResult`.
- **Steps:**
  1. Build the draw plan.
- **Expected result:**
  - One connector is drawn per `edges` entry, with per-edge colors.

### TC-OVERLAY-004 — Exclude draws a connector to void

- **Level:** unit · **Category:** ui-visual · **Traces:** REQ-143
- **Preconditions:**
  - An exclude `ResolveResult`.
- **Steps:**
  1. Build the draw plan.
- **Expected result:**
  - The drive node is outlined; a dashed connector terminates at a void marker (`absent`); no fabricated target node is drawn.

### TC-OVERLAY-005 — Partial outline and label

- **Level:** unit · **Category:** ui-visual · **Traces:** REQ-144
- **Preconditions:**
  - A partial `ResolveResult`.
- **Steps:**
  1. Build the draw plan.
- **Expected result:**
  - The part-bearing node is outlined and labeled `part {id}`.

### TC-OVERLAY-006 — Text highlight is independent of map connectors

- **Level:** e2e · **Category:** functional · **Traces:** REQ-145
- **Preconditions:**
  - A ready resolve result.
- **Steps:**
  1. Toggle the map on and off.
- **Expected result:**
  - Highlight spans remain on regardless of `map`; only the connectors follow the map toggle.

### TC-OVERLAY-007 — Redraw coalescing and listener cleanup

- **Level:** unit · **Category:** nfr · **Traces:** REQ-146
- **Preconditions:**
  - The overlay hook mounted.
- **Steps:**
  1. Generate scroll/resize/resolve storms.
  2. Unmount the component.
- **Expected result:**
  - Redraws are `requestAnimationFrame`-batched; listeners are cleaned up on unmount.

### TC-OVERLAY-010 — Anchor lookup falls back when seq is missing

- **Level:** unit · **Category:** functional · **Traces:** REQ-147
- **Preconditions:**
  - A span without a `seq`.
- **Steps:**
  1. Perform an anchor lookup for that span.
- **Expected result:**
  - The lookup falls back to `data-ref` + `part`.

### TC-OVERLAY-011 — drive=right attachment mirrors exits

- **Level:** unit · **Category:** functional · **Traces:** REQ-148
- **Preconditions:**
  - A `drive=right` fixture.
- **Steps:**
  1. Build the draw plan.
- **Expected result:**
  - The source is on the right column and edge exits are mirrored accordingly.

### TC-OVERLAY-012 — Chapter-wide overlay is absent (POC behavior superseded)

- **Level:** e2e/out-of-scope-confirmation · **Category:** out-of-scope-confirmation · **Traces:** REQ-140, REQ-160
- **Preconditions:**
  - A chapter with many deltas.
- **Steps:**
  1. Enable `map` without changing the current verse.
- **Expected result:**
  - Only the current alignment's connectors are drawn — not all chapter deltas (the POC chapter-wide toggle is out of scope).
