# Chart marks inside the charts, and the donut key beside the pie

**Document:** `frvt-7-chart-key-placement-execution-plan-1`
**Status:** Implemented. The phases below are the record of that work. Do not apply them again. Checking the dialog added four rules: each chart mark stays on one line, the empty slice sentence has no top margin, that sentence wraps in the pie's width, and the first slice-name group starts at the pie's top edge.
**Audience:** The agent implementing these changes, and the owner reviewing them
**Scope:** Where the divergence dialog shows its chart marks and its donut slice names. Files are `ChartKey.tsx`, `ChartKey.test.tsx`, `DonutKey.tsx`, `DonutKey.test.tsx`, `DivergenceDialog.tsx`, `frvt/web/src/styles/divergence.css`, and three notes under `doc/`. No backend change. No edit under `.spec/completed/`. Do not edit `.spec/frvt-7-count-dot-legend-execution-plan-1.md`. That work is already in the tree.

Never commit or push. The owner reviews all changes. Do not edit this plan.

---

## How to use this document

The phases are the order the work was done in. Each phase lists its files, its work, its tests, and the gate that passed. The "Locked decisions" section is the contract that was implemented. Do not invent a second version of it.

> **Rule 12.** Phase numbers and other identifiers in this plan must never appear in source code, comments, test names, CSS class names, runtime strings, or `doc/`. Name things for what they do.

**Web gate**, after each of Phases 1, 2, and 3:

```bash
cd frvt/web && export PATH=$HOME/.local/node/bin:$PATH && npx vitest run src/divergence && npm run typecheck && npx eslint src/divergence
```

eslint must report 0 errors and no new warnings under `src/divergence`. Typecheck and eslint are how a missed prop or an unused import is caught. Fix those. Do not suppress them. If full `npm run lint` fails, it fails on files this plan does not touch. Leave those files alone.

## Rules for every phase

- Every new or changed function, component, interface, interface field, and module constant gets an orienting doc comment: why it exists, when to use it, and what it returns or throws. Where a snippet in this plan already has doc comments, copy them as written. Update any existing doc comment that the change makes wrong.
- Files stay under 600 lines. Functions take at most 6 named parameters. Keep `SeverityKey` in `ChartKey.tsx`. Do not add a file.
- Tests cover the contract: which marks each list shows, their order, and that the donut slice names are visible without opening anything. Do not test CSS class names, pixel positions, or `position` for their own sake. Phase 4 checks placement in the browser.
- This work changes no backend method, so the backend logging rule has nothing to apply to.
- Run `npx prettier --write` on each file under `frvt/web` that the phase edits. Do not run prettier on `doc/` or on this plan.
- Do not add a `title` attribute anywhere inside the dialog.
- Do not edit anything under `.spec/completed/`.

---

## Findings that shape this plan

1. **One list currently holds every mark.** [ChartKey.tsx](../frvt/web/src/divergence/ChartKey.tsx) renders Same, the deviance scale, `Event severity 1 to 4`, `Deviances:`, `Single-sided chapters`, Approximate, and Data warning. `showRibbons` adds Chapter move, Cross-book move, and Order inversion. [DivergenceDialog.tsx](../frvt/web/src/divergence/DivergenceDialog.tsx) renders that list under the layer toggles on every tab, with `showRibbons={tab === "radial"}`.
2. **The dark chart area is `.dv-stage`.** Its background is `var(--bg)` (`#0a0f15`). Details adds `is-detail`, which uses `var(--surface-raised)` (`#141d28`), a lighter fill. The stage is `overflow: auto` but has no height limit. `.dv-layout` is `align-items: start`, so the stage grows with the chart. The element that actually scrolls is `.modal-fullscreen .modal-body`. A `position: sticky` bar inside `.dv-stage` sticks to the stage, and the stage does not scroll, so the bar scrolls away with the dialog. Do not use `position: sticky`.
3. **A grid row sizes to its content unless the row is bounded.** Giving `.dv-stage` `overflow: auto` and `min-height: 0` is not enough. The default grid row is `auto`, so the matrix's content height becomes the row height, the layout grows, and `overflow: hidden` on the dialog body clips the chart with no scrollbar. The layout needs one row of `minmax(0, 1fr)`, and both the stage and the selection column need `min-height: 0`. The loaded comparison is a fragment, so `.dv-layout` is already a flex child of `.dv-root`. Do not wrap that fragment in a new element. If you do, the wrapper must be `display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden`, or the layout never receives a height.
4. **The fullscreen modal is only this dialog.** `size="fullscreen"` is passed only from `DivergenceDialog`. Changing `.modal.modal-fullscreen` does not change the manage modals.
5. **Arrow keys are on the stage.** The stage `div` has `tabIndex={0}` and an `onKeyDown` that moves the Overview pin. That handler must stay on the outer stage. Do not move it onto the scrolling child. On Overview, Escape in that handler calls `stopPropagation`, clears the pin, and does not close the dialog, even when nothing is pinned. Escape closes the dialog only when focus is outside that stage and nothing is pinned. Do not change that. Arrow keys are not the way to scroll the chart.
6. **The radial chart measures its own host.** `RadialView` sets its size from `host.clientWidth` on the `div` inside `.dv-radial`. Do not give that host a width. A block box inside a full-width scroll child still measures the chart column.
7. **The donut size is CSS.** `.dv-donut` is `11.18rem` by `11.18rem`. The comment above it says that side is 20% less area than an older `12.5rem` chart. The SVG `viewBox` stays `0 0 220 220`. Half the side is `5.59rem`. Do not change `viewBox` or the ring radii in [Donut.tsx](../frvt/web/src/divergence/Donut.tsx). Do not edit `Donut.tsx`.
8. **The slice names are a closed disclosure.** [DonutKey.tsx](../frvt/web/src/divergence/DonutKey.tsx) is a `<details className="dv-key">` whose summary is the word `Key`. It starts closed. Inside are the headings `Inner ring: layers` and `Outer ring: types`, a swatch, the slice label, and an info control per slice. An empty chart says `No slices in this chart.` Info tips are portaled to `document.body`, so a scrolling column does not clip them.
9. **The selection column is `19.8rem`.** `.dv-summary` centers the heading and the donut in a column. The heading component already centers its title. Do not widen the column. `.dv-donut-host` is `align-self: center`. After the pie and the names share a row, that rule vertically centers the pie against the name column. Override it so the pie stays at the top of the row.
10. **Slice labels are flex items.** `.dv-key-row` does not let the label shrink. A long label's minimum width would widen the `19.8rem` column. The label needs `min-width: 0` so it wraps inside the column. The info control stays `flex-shrink: 0` through the existing `.dv-key-row .dv-tip` rule.
11. **Count dots and the hatch label are already settled.** `Deviances:` with `2–4` and `5+`, and the label `Single-sided chapters`, stay as they are. Do not change `countDotRadius`, the swatch fills, or when a dot or hatch is drawn. `Books on one side only` is a layer toggle, not a chart mark. Leave it next to the tabs.

---

## Locked decisions

- **Severity stays put, and it is centered.** `Event severity 1 to 4` is the only mark under the layer toggles. It is centered in that row. It is shown on Overview, Radial, and Details whenever the tabs are shown. It is not shown on the loading or error states, which do not show the key today.
- **The other marks move into the dark chart.** Same, `Less → more chapter deviance`, `Deviances:`, `Single-sided chapters`, Approximate, and Data warning render at the top of `.dv-stage` on Overview and Radial. They are one centered line that wraps between items, using the existing `.dv-chart-key` type size and the existing 14px marks. Details does not render them at all.
- **Ribbons join that line, on Radial only.** Chapter move, Cross-book move, and Order inversion are on the centered line inside the Radial chart, after Data warning. They are absent on Overview and Details.
- **That line stays while the chart scrolls.** The dark stage is a column. The mark line is the header and does not scroll. The chart is a child that scrolls, both vertically and horizontally. The header is not `position: sticky`. The fullscreen dialog fills the viewport so the chart child has a height to scroll inside. The selection column scrolls on its own so the event list and the scope actions stay reachable.
- **The pie is half as wide and half as tall.** `.dv-donut` becomes `5.59rem` by `5.59rem`. The graphic scales with the box. The ring geometry in `Donut.tsx` is unchanged.
- **Slice names sit to the right of the pie.** They are a left-aligned column, top-aligned with the pie graphic, not with the scope heading. The heading stays centered above the pie and the column together. Keep the headings `Inner ring: layers` and `Outer ring: types`, the swatches, the labels, and the info controls. Remove the `Key` disclosure entirely. An empty pie still says `No slices in this chart.` in that column. The donut's own `No differences in …` sentence stays where the pie was.
- **Out of scope.** Do not edit `Donut.tsx`, `MatrixView.tsx`, `RadialView.tsx`, `colors.ts`, `taxonomy.ts`, `help.ts`, or `model/index.ts`. Do not change a mark's words, a swatch's drawing, layer toggles, or what a click pins.

---

## Phase 1: Two lists, still under the toggles

**Files:** [ChartKey.tsx](../frvt/web/src/divergence/ChartKey.tsx), [ChartKey.test.tsx](../frvt/web/src/divergence/ChartKey.test.tsx), [DivergenceDialog.tsx](../frvt/web/src/divergence/DivergenceDialog.tsx), [divergence.css](../frvt/web/src/styles/divergence.css).

**Work in `ChartKey.tsx`:**

1. Add `SeverityKey` above `ChartKey`. Move the existing severity `<li>` into it. Copy this comment and component:

```tsx
/**
 * Event-severity scale for every tab.
 * It sits centered under the layer toggles on Overview, Radial, and Details.
 */
export function SeverityKey() {
  return (
    <ul className="dv-chart-key" aria-label="Event severity">
      <li>
        <span className="dv-key-severities" aria-hidden="true">
          {[1, 2, 3, 4].map((severity) => (
            <Square key={severity} color={severityColor(severity)} />
          ))}
        </span>
        Event severity 1 to 4
      </li>
    </ul>
  );
}
```

2. Replace the `ChartKey` doc comment with:

```tsx
/**
 * Marks other than event severity.
 * Move items appear only when showRibbons is set, because only the radial
 * chart draws those arrows.
 */
```

Phase 2 replaces this comment once the list actually sits on the chart. Do not claim that placement in this phase. The dialog still renders this list under the toggles, including on Details.

3. Delete the severity `<li>` from `ChartKey`. Leave the other items in this order: Same, `Less → more chapter deviance`, the `Deviances:` item, `Single-sided chapters`, Approximate, Data warning, then the ribbon items when `showRibbons` is true. Do not change the `Deviances:` markup, the swatches, or `countDotRadiusForKey`.

4. `ChartKeyProps` stays `{ index, showRibbons }`. Update its field comments only if they still say the severity list lives here. `index` is still required because the ribbon swatches read severity from it.

**Work in `DivergenceDialog.tsx`:** Import `SeverityKey` from `./ChartKey`. Replace the single `<ChartKey … />` under the toggles with both, severity first:

```tsx
<SeverityKey />
<ChartKey index={index} showRibbons={tab === "radial"} />
```

Do not move either list into the stage in this phase. Leave the dialog's doc comment for Phase 2, when the placement is true.

**Work in `divergence.css`:** Add `justify-content: center;` to the existing `.dv-chart-key` rule. Do not change its `gap`, `font-size`, `margin`, or `padding`. Do not change `.dv-key-mark`, `.dv-key-swatch`, `.dv-key-scale`, or `.dv-key-ribbon`.

**Tests in `ChartKey.test.tsx`:**

- Import `SeverityKey` beside `ChartKey`.
- Remove `Event severity 1 to 4` from `ITEMS`.
- The existing "names the chart marks" test still renders `ChartKey` with `showRibbons={false}` and still expects each remaining `ITEMS` entry, and still expects `Cross-book move` to be absent. Also expect `Event severity 1 to 4` to be absent.
- Rename the count-dot test so it no longer says the dots sit between severity and the hatch. Assert this order in that one list: the item containing `Less → more chapter deviance`, then the item containing `Deviances:`, then the item containing `Single-sided chapters`. Keep the `small dot` / `large dot` text, the `2–4` and `5+` strings, the two circle radii, `COUNT_DOT`, and `MUTED`. Keep the assertion that `Chapter on one side only` is absent.
- The ribbon test still expects Chapter move immediately after Data warning, and still expects `Deviances:` and `Single-sided chapters`. Also expect `Event severity 1 to 4` to be absent.
- Add a `SeverityKey` test that renders it, expects `Event severity 1 to 4`, and expects `Same`, `Deviances:`, `Single-sided chapters`, and `Chapter move` to be absent.

**Gate:** The web gate. `SeverityKey` shows only the severity item. `ChartKey` shows the other marks and, only when `showRibbons` is set, the three ribbons after Data warning. Both lists are still under the toggles. Stop if a test only passes by querying a CSS class.

---

## Phase 2: Marks at the top of the chart, and the chart scrolls under them

**Files:** [ChartKey.tsx](../frvt/web/src/divergence/ChartKey.tsx), [DivergenceDialog.tsx](../frvt/web/src/divergence/DivergenceDialog.tsx), [divergence.css](../frvt/web/src/styles/divergence.css), [doc/ux-spec.md](../doc/ux-spec.md), [doc/ui-style-guide.md](../doc/ui-style-guide.md), [doc/divergence-dialog.md](../doc/divergence-dialog.md).

**Work in `DivergenceDialog.tsx` and `ChartKey.tsx`:**

1. Under the toggles, leave `<SeverityKey />` and delete the `<ChartKey … />` that Phase 1 placed there. The Radial buttons (`Chapters as slices`, `Chapters as rings`) stay where they are, between that severity list and `.dv-layout`. Do not wrap the loaded comparison in a new element. `.dv-layout` must stay a direct flex child of `.dv-root`.

2. In `ChartKey.tsx`, replace the `ChartKey` doc comment with:

```tsx
/**
 * Marks for the matrix and the radial chart.
 * Overview and Radial render it at the top of the chart. Details does not.
 * Move items appear only while the radial chart is showing, because that
 * is where the arrows are drawn.
 */
```

Replace the `ChartKeyProps` comment `Props for the chart key shown on every tab.` with `Props for the marks at the top of Overview and Radial.` Leave the two field comments. `showRibbons` is still how Radial adds the move items.

In the dialog doc comment, replace these two lines:

```text
 * names the colors currently drawn, and a chart key under the toggles explains
 * the marks used in every view. An info control beside the title holds the
```

with:

```text
 * names the colors currently drawn. Event severity is centered under the toggles,
 * and the other marks are centered at the top of the Overview and Radial charts.
 * An info control beside the title holds the
```

Leave the rest of that comment, including `A key under the chart`. Phase 3 changes that phrase.

3. Keep `tabIndex={0}`, the `is-detail` class, and the existing `onKeyDown` on the outer `.dv-stage`. Inside it, add a header only when the tab is not Details, then wrap the three view conditionals in a scroll child. The views themselves stay as they are, including their props:

```tsx
{(tab === "overview" || tab === "radial") && (
  <div className="dv-stage-key">
    <ChartKey index={index} showRibbons={tab === "radial"} />
  </div>
)}
<div className="dv-stage-scroll">
  {/* the existing overview, radial, and detail conditionals move here, unchanged */}
</div>
```

Do not render `ChartKey` when `tab === "detail"`. Do not put `tabIndex` or `onKeyDown` on `.dv-stage-scroll`.

**Work in `divergence.css`.** The fullscreen dialog must fill the viewport, and the chart column must be the piece that scrolls. Apply these changes. Leave every other rule in the file as it is.

- On `.modal.modal-fullscreen`, set `height: calc(100vh - 2rem);` and keep the existing `max-height`. Keep `overflow: hidden` and the flex column.
- On `.modal-fullscreen .modal-body`, set `flex: 1`, `display: flex`, `flex-direction: column`, and `overflow: hidden`. Keep `min-width: 0` and `min-height: 0`.
- On `.dv-root`, add `flex: 1`, `min-height: 0`, and `overflow: hidden`. Keep the existing flex column, gap, color, and font.
- On `.dv-layout`, add `flex: 1`, `min-height: 0`, and `grid-template-rows: minmax(0, 1fr)`. Change `align-items` from `start` to `stretch`. Keep the two column tracks and the gap. The `19.8rem` column width stays. The row bound is what gives the stage a height shorter than the matrix. Without it, the inner scroll never appears and the dialog clips the chart.
- Replace the `.dv-stage` overflow rule. The stage is a column that does not scroll. The comment must say why: the mark line stays at the top of the dark area, and the chart scrolls under it.

```css
.dv-stage {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--bg);
}

/* Mark line for Overview and Radial. It is not sticky: the chart scrolls below it. */
.dv-stage-key {
  flex-shrink: 0;
  min-width: 0;
  padding: 0.5rem 0.75rem;
  background: var(--bg);
}

/* Vertical and horizontal scroll for a tall or wide chart. */
.dv-stage-scroll {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: auto;
}
```

- Keep `.dv-stage.is-detail { background: var(--surface-raised); }`. Do not paint `--bg` on `.dv-stage-scroll`. Details has no `.dv-stage-key`, so the lighter background shows through the transparent scroll child.
- Add a column rule so the event list remains reachable now that the dialog body does not scroll:

```css
.dv-column {
  min-width: 0;
  min-height: 0;
  overflow: auto;
}
```

Do not add `position: sticky` or a `z-index` on the mark line. A sticky child of the old stage sticks to a box that grows with the chart, and the dialog body is what used to scroll. Do not set a width on `.dv-stage-scroll` or `.dv-radial`. They stay block boxes filling the column, so `RadialView` still measures that width. Do not change `.dv-table-wrap`. The detail event table keeps its own scroll inside the stage scroll.

**Docs.** Replace only the sentences below. Do not rewrite the surrounding paragraphs. The donut is still the collapsed key until Phase 3. Leave those donut sentences alone in this phase.

In [doc/ux-spec.md](../doc/ux-spec.md), replace the chart-key layout bullet with:

```markdown
- Event severity sits centered under the toggles on every tab, including Details. Overview and Radial show the other marks on one centered line at the top of the chart area. The line can wrap. The marks are Same, the chapter-deviance scale, the two count dots (2–4 and 5 or more; fewer than 2 draws no dot), Single-sided chapters, Approximate, and Data warning. That line stays in place while the chart scrolls. Details does not show those marks. Move ribbons are on that line only on the Radial tab. The donut does not draw the count dots or the hatch.
```

In [doc/ui-style-guide.md](../doc/ui-style-guide.md), replace `Tabs and layer toggles run across the top, with the chart key under them.` with `Tabs and layer toggles run across the top. Event severity is centered under them. The other chart marks are centered at the top of the Overview and Radial chart areas.`

Replace `The dialog's marks follow these rules on every tab, and the chart key under the toggles names them:` with `The dialog's marks follow these rules:`

The bullet list that follows includes event severity and selection, which are not both on the mark line. Do not add a sentence that says every bullet is named at the top of the chart. The paragraph edited above already says where the names sit.

Replace `Ribbon items appear in the chart key only on the radial tab, because that is the only view that draws them.` with `Ribbon items appear on that centered line only on the radial tab, because that is the only view that draws them.`

In the count-dot bullet, replace `The chart key draws both` with `The mark line at the top of the chart draws both`.

In [doc/divergence-dialog.md](../doc/divergence-dialog.md), replace the `ChartKey` sentence in "From wire rows to marks" with:

```markdown
`SeverityKey` is the event-severity scale centered under the layer toggles on every tab. `ChartKey` names the other marks at the top of the Overview and Radial charts: Same, deviance, the two count-dot sizes, single-sided chapters (the hatch), approximate, data warning, and, on the radial tab, the ribbons. That line stays put while the chart scrolls. Details does not render `ChartKey`. `DonutKey` is the collapsed key for the donut colors currently drawn. `summarySentence` is the comparison sentence in the info control beside the title. None of these change the pin.
```

In the component table, replace the `ChartKey` cell with `Marks at the top of Overview and Radial. Ribbon items only on the radial tab. Details does not render it. It does not change the pin.` Insert this row immediately before the `ChartKey` row:

```markdown
| `SeverityKey` | Event severity, centered under the toggles on every tab. It does not change the pin |
```

**Gate:** The web gate. Under the toggles, only `Event severity 1 to 4` remains. Overview and Radial render the other marks inside `.dv-stage`, above the scrolling child. Details renders neither those marks nor the ribbons. `onKeyDown` is still on the outer stage. `.dv-layout` has `grid-template-rows: minmax(0, 1fr)`. No rule uses `position: sticky`. The matrix scrolls inside the stage. The dialog body does not grow with the matrix, and it does not clip the chart without a scrollbar. Stop if the only way to keep the marks visible is to pin them over the scrolling chart.

---

## Phase 3: Half-size pie, slice names beside it

**Files:** [DonutKey.tsx](../frvt/web/src/divergence/DonutKey.tsx), [DonutKey.test.tsx](../frvt/web/src/divergence/DonutKey.test.tsx), [DivergenceDialog.tsx](../frvt/web/src/divergence/DivergenceDialog.tsx), [divergence.css](../frvt/web/src/styles/divergence.css), [doc/ux-spec.md](../doc/ux-spec.md), [doc/ui-style-guide.md](../doc/ui-style-guide.md), [doc/divergence-dialog.md](../doc/divergence-dialog.md).

**Work in `divergence.css`:**

1. Replace the `.dv-donut` size. The comment must say this side is half of the previous `11.18rem`, and that the `viewBox` is unchanged so the rings scale with the box.

```css
.dv-donut {
  display: block;
  width: 5.59rem;
  height: 5.59rem;
}
```

2. Add the row that places the pie and the slice names. The heading stays a separate child above this row, centered by the existing heading styles.

```css
.dv-donut-row {
  display: flex;
  align-items: flex-start;
  align-self: stretch;
  gap: 0.75rem;
  min-width: 0;
}

.dv-donut-key {
  flex: 1;
  min-width: 0;
  text-align: left;
}

/* The host is align-self: center for the old stacked figure. In this row that
   vertically centers the pie against the names. Keep the pie at the top. */
.dv-donut-row .dv-donut-host {
  align-self: flex-start;
}

.dv-donut-key .dv-key-row > span:not(.dv-swatch) {
  min-width: 0;
}
```

Do not remove `.dv-donut-host { align-self: center; }`. The more specific rule above overrides it only inside the row. Do not remove `.dv-key-row .dv-tip { flex-shrink: 0; }`. The label is the span that is not the swatch. `min-width: 0` lets that label wrap. The tip matches the same selector and stays at the icon size because it does not shrink.

3. Delete `.dv-key` and `.dv-key summary`. Keep `.dv-key-group`, `.dv-key-group ul`, `.dv-key-group h3`, `.dv-key-row`, and `.dv-swatch`.

**Work in `DonutKey.tsx`:** Remove the `<details>` and the `<summary>Key</summary>`. The root is `<div className="dv-donut-key">`. Keep the empty branch and both `SliceGroup` calls, including the headings, swatches, labels, and info controls. Replace the component doc comment with:

```tsx
/**
 * Slice names beside the donut.
 * Layers are the inner ring and types are the outer ring. An empty chart
 * says so in this column. Each known slice opens its explanation from the info control.
 */
```

Replace the `DonutKeyProps` comment with `Props for the slice names beside the donut.` Leave the two field comments. Do not change `SliceGroup`.

**Work in `DivergenceDialog.tsx`:** Put the donut and `DonutKey` in one row under the scope heading. Delete the `DonutKey` that sits as a sibling after the figure.

```tsx
<figure className="dv-summary">
  <ScopeHeading title={heading.title} subtitle={heading.subtitle} />
  <div className="dv-donut-row">
    <Donut
      layers={chart.layers}
      types={chart.types}
      scope={pinScopeLabel(pin)}
    />
    <DonutKey layers={chart.layers} types={chart.types} />
  </div>
</figure>
```

Do not edit `Donut.tsx`. When both rings are empty, `Donut` still renders `No differences in {scope}.` and `DonutKey` still renders `No slices in this chart.` beside it.

In the dialog doc comment, replace these two lines:

```text
 * pinned. A key under the chart
 * names the colors currently drawn.
```

with:

```text
 * pinned. Slice names beside the donut
 * name the colors currently drawn.
```

The line break is required. After Phase 2 those words are not on one line, so a single-line search will not match.

**Tests in `DonutKey.test.tsx`:** The slices, the headings, the info controls, and the empty sentence are visible without a click. Delete every `getByText("Key")`, every `closest("details")`, and every click that only existed to open the disclosure.

- The first test expects `Numbering`, `Renumbered run`, `Inner ring: layers`, and `Outer ring: types` on first render. Keep the info-control clicks and the assertions that the tooltip is portaled to `document.body` and that the layer tip and the type tip have their existing text. Keep the assertion that `Bridges and omissions` is absent.
- The "every layer and every divergence type" test expects one explanation button per layer plus one per type, with no click before that count.
- The unrecognized-slice test expects `Note` and no explanation button, with no click before that.
- The empty test expects `No slices in this chart.` on first render. Drop `userEvent` from that test if nothing clicks. Do not leave an unused import.

**Docs.** Replace only these sentences.

In [doc/ux-spec.md](../doc/ux-spec.md), replace `the donut key (collapsed until opened)` in the selection-column bullet with `the slice names in a column to the right of the donut`. Then add this sentence at the end of that same bullet: `The donut is 5.59rem on each side. The slice names start at the top of the donut, not the heading, and stay left-aligned. There is no collapsed key.`

In [doc/ui-style-guide.md](../doc/ui-style-guide.md), in the dialog paragraph, replace `the donut, its key,` with `the donut, the slice names beside it,`.

In [doc/divergence-dialog.md](../doc/divergence-dialog.md), replace `` `DonutKey` is the collapsed key for the donut colors currently drawn. `` with `` `DonutKey` lists the donut colors in a column to the right of the chart, starting at the top of the chart. ``

**Gate:** The web gate. Nothing in `src/divergence` renders the word `Key` as a disclosure summary. `.dv-donut` is `5.59rem` by `5.59rem`. `Donut.tsx` is unchanged. The slice names are in `.dv-donut-row` after `ScopeHeading`, not below the figure. Stop if the labels are centered, if the column starts at the heading, or if the disclosure is only hidden with CSS.

---

## Phase 4: Check the dialog in the browser

**Files:** none, unless a check fails. A failure goes back to the phase that owns it. Do not patch around it in a test.

If the running app serves `frvt/web/dist`, run `npm run build` in `frvt/web` before looking. Start the app the way [README.md](../README.md) describes, including local Basic auth. Open a comparison that has count dots, a hatch, and more than one donut slice. The visual-demo English and Septuagint pair is enough if it is loaded.

Check these. A screenshot of the closed dialog is not the check.

1. **Overview.** Under the toggles, the centered row is only `Event severity 1 to 4`. Inside the dark chart, one centered wrapping line shows Same, the deviance scale, `Deviances:` with both dot sizes, `Single-sided chapters`, Approximate, and Data warning. Chapter move, Cross-book move, and Order inversion are absent. Scroll the matrix with the wheel or the scrollbar. The mark line stays at the top of the dark area and the squares move under it. If the matrix does not scroll and the bottom of the chart is clipped, the grid row is still sizing to the matrix. Scroll sideways if the matrix is wider than the column. The mark line stays full width and the squares move sideways under it. The radial chart, after you open that tab, fills the column width rather than drawing a 700px chart in a narrower column.
2. **Radial.** The same severity row is under the toggles. `Chapters as slices` and `Chapters as rings` stay above the dark area. The centered line inside the dark area includes the Overview marks plus Chapter move, Cross-book move, and Order inversion, in that order, after Data warning. Scrolling the radial chart leaves the line in place. Switching slices and rings still redraws the chart.
3. **Details.** The severity row is still under the toggles. The lighter chart area does not show Same, the deviance scale, `Deviances:`, `Single-sided chapters`, Approximate, Data warning, or any ribbon item. The book ladder still scrolls if it is taller than the area.
4. **Arrow keys.** Tab until the Overview chart stage is focused, then press ArrowRight. The pin moves. Do not use the arrow keys to scroll. Scroll the matrix with the wheel or the scrollbar. Escape while that stage is focused clears the pin and leaves the dialog open, including when nothing was pinned. Escape while focus is outside the stage and nothing is pinned still closes the dialog.
5. **Donut.** The pie's box is `5.59rem` wide and `5.59rem` tall. The scope heading is above the pie, centered across the pie and the name column. The name column is to the right of the pie, left-aligned, and the top of the pie lines up with the top of that column, not with the heading and not with the vertical middle of the names. `Inner ring: layers` and `Outer ring: types` are visible without a click. There is no `Key` summary. An info control still opens its explanation. The event list and the scope actions are still reachable by scrolling the selection column. The detail event table still has its own scrollbar when it is long.
6. **Empty pie.** Pin a book that has no differences. The pie's place says there are no differences, and the column beside it says `No slices in this chart.`, top-aligned with that sentence. Do not turn a disabled layer toggle off. A layer with no events cannot be toggled.
7. **Narrow width.** Narrow the window until the mark line wraps onto a second line. The wrap is between items. The `Deviances:` item, including both squares and both ranges, stays on one line. The slice names wrap inside the selection column and do not widen it or cover the chart.

**Gate:** All seven checks hold. If the mark line scrolls away, the stage is not the scroll container described in Phase 2. If the pie is about 7.91rem, the size was halved by area instead of by side. Fix the owning phase and run the web gate again.
