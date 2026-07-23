# FRVT-3 Test Plan — Viewer & Overlay

**Document:** `frvt-3-test-plan-viewer-and-overlay-1`
**Parent index:** [frvt-3-test-plan-1.md](./frvt-3-test-plan-1.md)
**Areas:** viewer UI session (`UI`), SVG overlay (`OVERLAY`)

Shared setup, fixtures, and the traceability matrix live in the [parent index](./frvt-3-test-plan-1.md). **Required** cases observe what a user can see or do in the browser (URL, columns, overlays, modals, labels). Network/devtools, DrawPlan builders, `lib/*` helpers, and cache-key probes are **Optional (CI/CD / Automation candidate)** or rewritten away. DOM `data-*` attribute inspection was dropped (see REQ-127).

---

## Viewer UI session (`UI`)

### TC-UI-001 — Empty state explains the required upload

- **Level:** e2e · **Priority:** Required · **Category:** functional · **Traces:** REQ-120
- **Preconditions:**
  - A seeded database with no user translations (`total === 0`).
- **Steps:**
  1. Open `/` in the authenticated UI.
- **Expected result:**
  - An empty state explains that a project zip containing USX + `.vrs` is required.
  - A call-to-action opens the project upload flow.

### TC-UI-002 — Two-column session state lives in the URL

- **Level:** e2e · **Priority:** Required · **Category:** functional · **Traces:** REQ-121
- **Preconditions:**
  - At least two user translations exist.
- **Steps:**
  1. Select translations, BCV positions, drive side, and map toggle in the viewer.
  2. Inspect the browser URL.
- **Expected result:**
  - The URL owns `left`/`right`, the BCV parts for each column, `lvers`/`rvers`, `drive`, and `map`.
  - Reloading the URL restores the same session.

### TC-UI-003 — Spans render in seq order regardless of scheme

- **Level:** e2e · **Priority:** Required · **Category:** functional · **Traces:** REQ-122
- **Preconditions:**
  - A translation ingested from a project.
- **Steps:**
  1. Change the selected scheme for a column.
- **Expected result:**
  - The verse rendering order (by `seq`) is unchanged; scheme selection does not reorder verses.

### TC-UI-004 — Verse 0 renders as a title label

- **Level:** e2e · **Priority:** Required · **Category:** ui-visual · **Traces:** REQ-123, REQ-086
- **Preconditions:**
  - A Psalm-title span at verse 0.
- **Steps:**
  1. Render the chapter containing the verse-0 span.
- **Expected result:**
  - The verse-0 span displays as `Title (0)`; the underlying verse value is `0`.

### TC-UI-005 — Drive side controls resolve direction and overlay attachment

- **Level:** e2e · **Priority:** Required · **Category:** functional · **Traces:** REQ-124
- **Preconditions:**
  - Two columns ready to resolve with map enabled and a non-identity alignment available.
- **Steps:**
  1. Set `drive=left`, select a verse, observe the overlay.
  2. Toggle `drive=right` for the same verse (or a verse with a clear counterpart).
- **Expected result:**
  - With drive left, connectors originate from the left column; with drive right, from the right.
  - The follower column (non-drive) updates its chapter/highlight to the resolved counterpart.

### TC-UI-006 — Column scheme selection is per-request only

- **Level:** e2e · **Priority:** Required · **Category:** functional · **Traces:** REQ-125, REQ-091
- **Preconditions:**
  - A translation with a non-preferred but associated scheme; Manage page available to check preferred.
- **Steps:**
  1. In the viewer, change the column's scheme selector to the non-preferred scheme.
  2. Note the URL and that alignment/highlight updates.
  3. Open Manage and confirm which scheme is still marked preferred for that translation.
- **Expected result:**
  - The URL `*vers` param is set for that column; the viewer re-aligns using the selected scheme.
  - The stored preferred scheme in Manage is unchanged (viewer selection did not permanently switch preferred).

### TC-UI-007 — Follower column loads target chapter and scrolls

- **Level:** e2e · **Priority:** Required · **Category:** functional · **Traces:** REQ-126
- **Preconditions:**
  - A cross-chapter mapping between the two translations.
- **Steps:**
  1. Drive a resolve that lands in a different chapter in the follower column.
  2. Separately, drive an `exclude` result.
- **Expected result:**
  - The follower loads the target chapter, its URL BCV updates, and it scrolls so the counterpart verse is in view/highlighted.
  - An `exclude` result invents no scroll target (nothing to scroll to).

### TC-UI-009 — Viewer and manage routes render with cross-links

- **Level:** e2e · **Priority:** Required · **Category:** functional · **Traces:** REQ-128
- **Preconditions:**
  - Authenticated session.
- **Steps:**
  1. Visit `/`, `/manage/translations`, and `/manage/versifications`.
- **Expected result:**
  - Each page renders and provides Viewer↔Manage navigation links.

### TC-UI-010 — Error UX mapping matches UI §9.1

- **Level:** e2e · **Priority:** Required · **Category:** error-handling · **Traces:** REQ-129
- **Preconditions:**
  - Ability to provoke each API error class from the UI.
- **Steps:**
  1. Provoke `400`, `401`, `404`, `409`, `413`, `422`, `500`, `503` from user actions.
- **Expected result:**
  - `400` → toast; `401` → auth banner; `404` → toast; `409` → actionable message; `413`/`422` → surfaced in the relevant modal; `500` → generic error; `503` → database-unavailable message.

### TC-UI-020 — Single-translation placeholder disables second column

- **Level:** e2e · **Priority:** Required · **Category:** functional · **Traces:** REQ-130
- **Preconditions:**
  - Exactly one user translation exists (`total === 1`).
- **Steps:**
  1. Open the viewer.
- **Expected result:**
  - The second column shows a placeholder; resolve, overlay, map toggle, and counterpart jumps are disabled.

### TC-UI-021 — In-flight resolve is superseded when the driving ref changes

- **Level:** e2e · **Priority:** Required · **Category:** concurrency · **Traces:** REQ-131
- **Preconditions:**
  - A slow resolve (throttled network or large response).
- **Steps:**
  1. Change the driving ref again before the first resolve completes.
- **Expected result:**
  - Only the latest resolve result is applied in the UI (stale in-flight results do not overwrite the newer selection).

### TC-UI-022 — Deleted scheme clears the column override

- **Level:** e2e · **Priority:** Required · **Category:** error-handling · **Traces:** REQ-132
- **Preconditions:**
  - A column with `lvers`/`rvers` set to a scheme that is then deleted elsewhere.
- **Steps:**
  1. Refresh or poll so the UI observes the deletion.
- **Expected result:**
  - The `*vers` override is cleared and the column falls back to the preferred scheme.

### TC-UI-023 — No resolve without associated schemes

- **Level:** e2e · **Priority:** Required · **Category:** error-handling · **Traces:** REQ-133
- **Preconditions:**
  - A translation with no associated schemes selected in a column (or only such a translation available).
- **Steps:**
  1. Attempt to drive a resolve (change verse / enable map) with that column as drive.
- **Expected result:**
  - No alignment/overlay result appears for a successful resolve; the UI stays in a non-resolved state (disabled controls and/or an actionable error), rather than drawing connectors as if a scheme were selected.

### TC-UI-024 — Desktop two-column layout

- **Level:** manual · **Priority:** Required · **Category:** ui-visual · **Traces:** REQ-134
- **Preconditions:**
  - A desktop viewport (~1280px+) and a narrower window.
- **Steps:**
  1. Resize the window across widths.
- **Expected result:**
  - Two columns render side-by-side at desktop widths; no responsive/stacking breakpoint is claimed (mobile layout is out of scope).

### TC-UI-025 — Accessibility floor

- **Level:** manual · **Priority:** Required · **Category:** nfr · **Traces:** REQ-135, REQ-165
- **Preconditions:**
  - Viewer and manage pages loaded.
- **Steps:**
  1. Tab through selectors and jump menus; inspect labels.
- **Expected result:**
  - Controls have visible labels and are keyboard reachable (floor only; a full a11y audit is out of scope).

### TC-UI-026 — Credentials are never logged

- **Level:** manual · **Priority:** Optional (CI/CD / Automation candidate) · **Category:** permissions-auth · **Traces:** REQ-136
- **Preconditions:**
  - Access to UI logging/console output or log aggregation used in CI.
- **Steps:**
  1. Exercise auth and API flows while inspecting log/console calls.
- **Expected result:**
  - No password or Basic `Authorization` header value is logged.

> Not a user-visible product flow; keep as an automation/security-review candidate. Observable auth UX remains Covered by TC-AUTH-* Required cases.

### TC-UI-027 — Independent per-column scrolling keeps the overlay aligned

- **Level:** manual · **Priority:** Required · **Category:** ui-visual · **Traces:** REQ-188
- **Preconditions:**
  - Two columns with long chapters.
- **Steps:**
  1. Scroll one column while the other stays put.
- **Expected result:**
  - Columns scroll independently; overlay connectors stay aligned to their anchors; no stacking occurs.

### TC-UI-030 — Per-column BCV selectors

- **Level:** e2e · **Priority:** Required · **Category:** functional · **Traces:** REQ-180
- **Preconditions:**
  - A column with chapter spans loaded and navigation data available.
- **Steps:**
  1. Change book, then chapter, then verse in a column's BCV selectors.
- **Expected result:**
  - Book/chapter options come from navigation; verse options come from navigation and fall back to the loaded chapter spans when navigation omits verses.
  - Each change updates that column's URL BCV.

### TC-UI-031 — Clicking a verse sets the column's current ref

- **Level:** e2e · **Priority:** Required · **Category:** functional · **Traces:** REQ-181
- **Preconditions:**
  - The viewer with spans rendered; map on.
- **Steps:**
  1. Click a verse in the drive column.
- **Expected result:**
  - That column's selectors/URL update to the clicked verse.
  - The follower highlights/aligns to the resolved counterpart (drive resolve runs).

### TC-UI-032 — URL defaults applied when params are missing

- **Level:** e2e · **Priority:** Required · **Category:** functional · **Traces:** REQ-182
- **Preconditions:**
  - At least two translations; open `/` with no viewer params.
- **Steps:**
  1. Load the viewer.
- **Expected result:**
  - Defaults are applied: first two translations, first BCV from navigation/spans, empty `lvers`/`rvers`, `drive=left`, `map=1`.

### TC-UI-033 — Scheme switch does not show a stale alignment

- **Level:** e2e · **Priority:** Required · **Category:** functional · **Traces:** REQ-183
- **Preconditions:**
  - Two schemes associated on at least one column; a verse whose mapping differs between those schemes (or yields a visibly different follower position).
- **Steps:**
  1. Select scheme A, drive a resolve, note the follower highlight/chapter.
  2. Switch the column to scheme B (or clear to preferred if that changes the mapping) without leaving the viewer.
  3. Optionally navigate to another chapter and back.
- **Expected result:**
  - After the scheme change, the viewer shows the alignment for the **newly selected** scheme (not the previous scheme's connectors/highlight).
  - Verse text in the column remains in the same `seq` order (scheme change does not reorder spans).

> Optional automation may additionally assert cache-key shapes (`(translationId,book,chapter)` for spans; scheme in nav keys; `fromVers`/`toVers` in resolve keys). That is not required for human verification.

### TC-UI-034 — Follower auto-scroll does not loop resolve

- **Level:** e2e · **Priority:** Required · **Category:** concurrency · **Traces:** REQ-184
- **Preconditions:**
  - A cross-chapter mapping that causes the follower to scroll to a target verse after resolve.
- **Steps:**
  1. Drive a resolve that lands in a different chapter in the follower.
  2. Watch the follower settle (scroll + highlight) for a few seconds.
- **Expected result:**
  - The follower scrolls once to the target and the alignment settles.
  - The UI does not enter a visible loop (repeated chapter reloads, flickering highlights, or oscillating BCV).

### TC-UI-035 — Scheme control options and "Preferred (default)" clear

- **Level:** e2e · **Priority:** Required · **Category:** functional · **Traces:** REQ-185
- **Preconditions:**
  - A translation with at least two associated schemes.
- **Steps:**
  1. Open a column's scheme control and inspect the options.
  2. Select the "Preferred (default)" option.
- **Expected result:**
  - Options are built from associations joined with versifications (showing name / canonical / based_on), with the preferred scheme marked.
  - Selecting "Preferred (default)" clears the `*vers` override.

### TC-UI-036 — Column scheme override affects resolve, jumps, and navigation

- **Level:** e2e · **Priority:** Required · **Category:** functional · **Traces:** REQ-186
- **Preconditions:**
  - A column with a non-preferred scheme selected (`*vers` set); jump menu and BCV selectors available.
- **Steps:**
  1. Drive a resolve and note the alignment.
  2. Open that column's jump menu (deltas / misalignments / arbitrary verses) and pick an entry.
  3. Change book/chapter via the column's BCV selectors.
  4. Check Manage: preferred scheme for the translation is still the original preferred.
- **Expected result:**
  - Resolve, jump targets, and navigation options behave consistently with the **selected override** scheme (not silently falling back to a different scheme mid-session).
  - Preferred in Manage remains unchanged.

### TC-UI-037 — Client libs build single-verse refs only

- **Level:** unit · **Priority:** Optional (CI/CD / Automation candidate) · **Category:** functional · **Traces:** REQ-187
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

- **Level:** e2e · **Priority:** Required · **Category:** functional · **Traces:** REQ-140
- **Preconditions:**
  - Viewer with a current alignment for the selected verse.
- **Steps:**
  1. Set `map=0`, then `map=1`.
- **Expected result:**
  - Connectors clear when `map=0`, then draw for the **current** resolve result only when `map=1` (never chapter-wide).

### TC-OVERLAY-002 — Topologies for one-to-one, split, and merge

- **Level:** e2e/manual · **Priority:** Required · **Category:** ui-visual · **Traces:** REQ-141
- **Preconditions:**
  - Viewer with map on; fixtures/translations that produce one-to-one, split, and merge alignments (see index fixtures).
- **Steps:**
  1. For each relation type, select a verse that resolves that way and observe the overlay.
- **Expected result:**
  - One-to-one: a single connector between the matching verses.
  - Split: connectors from one drive verse to multiple follower verses.
  - Merge: connectors from multiple drive-side verses into one follower verse.
  - Connector exits attach on the drive side of each column pair.

> Optional automation may assert the same topologies via DrawPlan unit fixtures.

### TC-OVERLAY-003 — Complex edges, one connector each

- **Level:** e2e/manual · **Priority:** Required · **Category:** ui-visual · **Traces:** REQ-142
- **Preconditions:**
  - Viewer with map on; a complex (split∘merge) alignment available.
- **Steps:**
  1. Select the complex verse and observe the overlay.
- **Expected result:**
  - Multiple distinct connectors are visible for the complex result (one per edge relationship), not a single ambiguous blob; colors distinguish edges when the visual language specifies that.

### TC-OVERLAY-004 — Exclude draws a connector to void

- **Level:** e2e/manual · **Priority:** Required · **Category:** ui-visual · **Traces:** REQ-143
- **Preconditions:**
  - Viewer with map on; an exclude alignment available.
- **Steps:**
  1. Select the excluded verse on the drive side.
- **Expected result:**
  - The drive verse is outlined; a dashed connector ends in a void/absent terminator in the gutter (no fabricated target verse in the follower).

### TC-OVERLAY-005 — Partial outline and label

- **Level:** e2e/manual · **Priority:** Required · **Category:** ui-visual · **Traces:** REQ-144
- **Preconditions:**
  - Viewer with map on; a partial-verse alignment available.
- **Steps:**
  1. Select the partial mapping and observe the overlay/labels.
- **Expected result:**
  - The part-bearing verse is outlined and shows a visible part label (e.g. `part a`).

### TC-OVERLAY-006 — Text highlight is independent of map connectors

- **Level:** e2e · **Priority:** Required · **Category:** functional · **Traces:** REQ-145
- **Preconditions:**
  - A ready resolve result.
- **Steps:**
  1. Toggle the map on and off.
- **Expected result:**
  - Highlight spans remain on regardless of `map`; only the connectors follow the map toggle.

### TC-OVERLAY-007 — Redraw coalescing and listener cleanup

- **Level:** unit · **Priority:** Optional (CI/CD / Automation candidate) · **Category:** nfr · **Traces:** REQ-146
- **Preconditions:**
  - The overlay hook mounted.
- **Steps:**
  1. Generate scroll/resize/resolve storms.
  2. Unmount the component.
- **Expected result:**
  - Redraws are `requestAnimationFrame`-batched; listeners are cleaned up on unmount.

### TC-OVERLAY-010 — Anchor lookup falls back when seq is missing

- **Level:** unit · **Priority:** Optional (CI/CD / Automation candidate) · **Category:** functional · **Traces:** REQ-147
- **Preconditions:**
  - A span without a `seq`.
- **Steps:**
  1. Perform an anchor lookup for that span.
- **Expected result:**
  - The lookup falls back to `data-ref` + `part`.

### TC-OVERLAY-011 — drive=right attachment mirrors exits

- **Level:** e2e · **Priority:** Required · **Category:** functional · **Traces:** REQ-148
- **Preconditions:**
  - Two columns with map on and a clear non-identity alignment.
- **Steps:**
  1. Set `drive=right`, select a verse in the right column, observe connectors.
- **Expected result:**
  - Connectors originate from the right (drive) column and terminate on the left follower; exits are mirrored vs `drive=left` (covered in TC-UI-005).

### TC-OVERLAY-012 — Chapter-wide overlay is absent (POC behavior superseded)

- **Level:** e2e/out-of-scope-confirmation · **Priority:** Required · **Category:** out-of-scope-confirmation · **Traces:** REQ-140, REQ-160
- **Preconditions:**
  - A chapter with many deltas.
- **Steps:**
  1. Enable `map` without changing the current verse.
- **Expected result:**
  - Only the current alignment's connectors are drawn — not all chapter deltas (the POC chapter-wide toggle is out of scope).
