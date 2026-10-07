# Selection names and dot-plot axis bars: phased execution plan

**Document:** `frvt-7-inspector-names-and-dot-ticks-execution-plan-1`
**Status:** Implemented
**Audience:** The agent implementing these changes, and the owner reviewing them
**Scope:** The selection panel's translation names and flag chips, and the one-sided bars on the Details dot plot, in `frvt/web/src/divergence/`.

Never commit or push. The owner reviews all changes.

---

## How to use this document

Do the phases in order. Each phase lists its work, its tests, and a gate. Do not start a phase until the previous gate passes. The "Locked decisions" section is the contract. Do not invent alternatives.

> **Rule 12.** Phase numbers and other identifiers in this plan must never appear in source code, comments, test names, CSS class names, or runtime strings. Name things for what they do.

`npm run lint` already reports one error outside this work, in `src/viewer/columnScroll.ts` (`@typescript-eslint/no-empty-object-type`). Leave that file alone. Each phase gate below is the lint check for this work.

Code standards for every phase:

- Every new or changed function, component, interface field, and module constant gets an orienting doc comment: why it exists, when to use it, and what it returns. Match the comment style in `model/detail.ts`.
- Keep each source file under 600 lines.
- Keep functions to 6 or fewer named parameters.
- Test happy paths and essential failures only. Do not test CSS with computed styles; jsdom will not prove an ellipsis. Do not test boilerplate.
- This work changes only the web client. There are no backend methods, so the backend logging rule has nothing to apply to.

---

## Locked decisions

- **Name column.** Half of the reference row, not half of the viewport. `.dv-refs` changes from `auto minmax(0, 1fr)` to `minmax(0, 1fr) minmax(0, 1fr)`. Do not use `50% 50%`: the existing `0.625rem` column gap would make the row wider than the panel. The translation name, `org`, `Verses`, and a `Segments` label each get the same half, so the references stay aligned. Remove the `9rem` cap. Add `min-width: 0` on `dt`. Without it, a nowrap grid item refuses to shrink below the full name. Keep overflow, ellipsis, and nowrap on `dt`. Leave `.dv-refs dd` as it is, including `overflow-wrap: anywhere`, so a long reference may wrap. Only the names are forbidden to wrap.
- **Name tip.** `HoverTip` gains an optional `className` on its wrapper span. The two translation names pass `dv-ref-name`: block, `max-width: 100%`, `min-width: 0`, overflow hidden, ellipsis, nowrap. Do not add `transform`, `filter`, or `contain` on that span. Those would trap the fixed-position tip inside the clipped name. Do not add a native `title`. Show the tip for every translation name, including a short one. Do not measure whether the name is truncated. `org`, `Verses`, and `Segments` stay plain text. `Donut` uses `HoverTipBody` only and does not change.
- **Chips.** Skip only `missingInA`, `missingInB`, `bridgeInA`, and `bridgeInB` when the selection panel builds chips. A missing side is already an em dash. A bridge is already the type line, the `(bridge)` count, and a wider reference on one side. Keep `approximate`, `data warning` (its click still shows the source notes), `from .vrs supplement`, and `text omission`. Filter in the panel only. Do not change `flagText` or `FLAG_HELP`. The event-table Flags column still prints every flag.
- **Axis bars.** The prototype `drawDot` (pad `14`) draws a bar only when a run is missing one side. Bottom bar, side A only: `y = size - 11`, height `6`. Left bar, side B only: `x = 2`, width `6`. `dotPlotLayout` already uses those numbers, and that branch does not read `magnify`. A book with no one-sided run draws no bars. That is the straight diagonal. The pink mark on the prototype plot is one of these bars. Do not add chapter ticks, a second set of marks, or a change to `.dv-dot`. The 6px bar in the 14px gutter matches the prototype, including its border radius.

---

## Files

- [frvt/web/src/divergence/HoverTip.tsx](../frvt/web/src/divergence/HoverTip.tsx)
- [frvt/web/src/divergence/Inspector.tsx](../frvt/web/src/divergence/Inspector.tsx), [Inspector.test.tsx](../frvt/web/src/divergence/Inspector.test.tsx)
- [frvt/web/src/styles/divergence-events.css](../frvt/web/src/styles/divergence-events.css)
- [frvt/web/src/divergence/model/dotPlot.test.ts](../frvt/web/src/divergence/model/dotPlot.test.ts)
- [frvt/web/src/divergence/model/dotPlot.ts](../frvt/web/src/divergence/model/dotPlot.ts) only if a tick assertion fails

---

## Phase 1: Name column

**Work:**

- `divergence-events.css`: set the `.dv-refs` columns and the `dt` rules from the locked decision. Add `.dv-ref-name` with the ellipsis rules. Do not change `.dv-refs dd`.
- `HoverTip.tsx`: add the optional `className` prop and put it on the wrapper span. Say in the prop comment and the component comment that the class truncates the visible name and the tip stays fixed so the clip does not hide it.
- `Inspector.tsx`: pass `className="dv-ref-name"` on the side A and side B `HoverTip`s only.

**Tests:** The existing test "shows a long side name in full in a hover tip" must still pass. Do not add a computed-style test. Do not create a `HoverTip` test file.

**Gate,** from `frvt/web`:

```bash
npx vitest run src/divergence/Inspector.test.tsx && npm run typecheck && npx eslint src/divergence/Inspector.tsx src/divergence/HoverTip.tsx
```

---

## Phase 2: Side chips

**Work:**

- In `Inspector.tsx`, a private helper decides which flags become chips. Comment that the four side flags repeat the reference rows and the table still prints them. An event whose flags are only those four renders no chip wrapper. An event that also has `dataWarning` still renders that chip.
- Do not change `eventFormat.ts`, `help.ts`, or `EventTable.tsx`.

**Tests:** In `Inspector.test.tsx`:

- `bridgeInB` together with `dataWarning` shows "data warning" and does not show "bridged in".
- `missingInA` alone renders no `.dv-flag`.
- The existing "data warning" chip test still passes.

**Gate,** from `frvt/web`:

```bash
npx vitest run src/divergence/Inspector.test.tsx src/divergence/eventFormat.test.ts && npm run typecheck && npx eslint src/divergence/Inspector.tsx
```

---

## Phase 3: Tick geometry

**Work:**

- Extend `dotPlot.test.ts`. For a side-A-only run (`b` null), assert the drawn rect's y is `size - 11` and its height is `6`. For a side-B-only run (`a` null), assert the drawn rect's x is `2` and its width is `6`. Assert each drawn rect lies inside the canvas (`x >= 0`, `y >= 0`, `x + width <= size`, `y + height <= size`) and that the center of the drawn rect lies inside that tick's hit rect. Call `dotPlotLayout` with `magnify` false.
- If those assertions pass, do not edit `dotPlot.ts`. If one fails, change only the matching rect numbers in `dotPlotLayout` to the formulas in the locked decisions, and keep the hit rect covering the drawn rect.

**Gate,** from `frvt/web`:

```bash
npx vitest run src/divergence/model/dotPlot.test.ts && npm run typecheck && npx eslint src/divergence/model/dotPlot.ts src/divergence/model/dotPlot.test.ts
```
