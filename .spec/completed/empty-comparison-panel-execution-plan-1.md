# Empty comparison selection panel

**Document:** `empty-comparison-panel-execution-plan-1`
**Status:** Implemented. The phases below are the record of that work. Do not apply them again. The style guide and the dialog overview were updated with the notes. A CSS comment was updated so it no longer says the empty sentence belongs only to a pin.
**Audience:** The agent implementing these changes, and the owner reviewing them
**Scope:** The selection column in the divergence dialog when nothing is pinned and both donut rings are empty. Files are `DivergenceDialog.tsx`, `DivergenceDialog.test.tsx`, two new test files beside them, `doc/ux-spec.md`, and `doc/divergence-dialog.md`. No backend change. No CSS change. No edit under `.spec/completed/`. Do not edit this plan.

Never commit or push. The owner reviews all changes.

---

## How to use this document

Do the phases in order. Each phase lists its files, its work, its tests, and a gate. Do not start a phase until the previous gate passes. The "Locked decisions" section is the contract. Do not invent a second version of it. When this plan gives exact text in quotes, or a code block, use that text.

> **Rule 12.** Phase numbers and other identifiers in this plan must never appear in source code, comments, test names, CSS class names, runtime strings, or `doc/`. Name things for what they do.

**Web gate**, after phase 1 and again after phase 2. Run it from `frvt/web`:

```bash
cd frvt/web && export PATH=$HOME/.local/node/bin:$PATH && npm test && npm run typecheck && npx eslint src/divergence
```

`npm test` is the unit suite. It does not run the browser suite. eslint must report 0 errors and no new warnings under `src/divergence`. Typecheck and eslint catch a missed import. Fix those. Do not suppress them. If `npm run lint` fails on a file this plan does not touch, leave that file alone.

Do not start Postgres, the API, or a browser for this change. The tests lock the words, the missing chart, the missing buttons, and the return from a pin.

## Rules for every phase

- Every new or changed function gets an orienting doc comment: why it exists, when to use it, and what it returns. Where a snippet below already has that comment, copy it. Update any existing comment that the change makes wrong. The component comment on `DivergenceDialog` is one of those.
- Files stay under 600 lines. `DivergenceDialog.tsx` is about 490 lines. This change adds a few lines. Do not split it. Functions take at most 6 named parameters. Do not add a prop to `Inspector`. It already has 6.
- Tests cover the contract: the sentence, the title, the missing chart, the missing buttons, and the pin that must still win. Do not test a CSS class except the one assertion this plan names, which locks the sentence to the chapter empty sentence's class.
- This work changes no backend method, so the backend logging rule has nothing to apply to.
- Run `npx prettier --write` on each file under `frvt/web` that the phase edits, then re-run the web gate. Do not run prettier on `doc/`.
- Do not add a `title` attribute anywhere inside the dialog.
- Do not edit anything under `.spec/completed/`.

---

## Findings that shape this plan

1. **The two empty pictures are different components.** With nothing pinned, [DivergenceDialog.tsx](../frvt/web/src/divergence/DivergenceDialog.tsx) still mounts the donut row. [Donut.tsx](../frvt/web/src/divergence/Donut.tsx) then renders `No differences in {scope}.`, and `pinScopeLabel(null)` makes that `No differences in this comparison.` [DonutKey.tsx](../frvt/web/src/divergence/DonutKey.tsx) renders `No slices in this chart.` beside it. [Inspector.tsx](../frvt/web/src/divergence/Inspector.tsx) returns null when `selection` is null, so the column has no centered sentence and no event list.
2. **A pinned empty chapter already has the layout this change copies.** `hidePinnedChart` hides the donut row when something is pinned and both rings are empty. `Inspector` then renders `No deviances in this chapter.` or `No deviances in this book.` in a `p` with class `dv-inspector-empty`. That class, in [divergence-events.css](../frvt/web/src/styles/divergence-events.css), is `text-align: center` with a small top margin. The paragraph sits in `.dv-column-scroll`, under the heading in `.dv-summary`. [ScopeActions.tsx](../frvt/web/src/divergence/ScopeActions.tsx) draws `Open GEN in book detail` and `Clear selection` for that pin.
3. **Both rings empty is the condition, not the title.** `breakdown` omits a switched-off layer from the rings and still counts it in `layerStats`. `comparisonTitle(comparisonTotal(chart.layerStats))` therefore stays `All Deviances (1)` after the only layer is turned off, and `All Deviances (None)` only when the report has no events. Do not change [counts.ts](../frvt/web/src/divergence/counts.ts).
4. **The transparent rects are hit targets, in chapter order.** In [MatrixView.tsx](../frvt/web/src/divergence/MatrixView.tsx), every chapter gets a `rect` with `fill="transparent"`, after the colored cells are drawn. Genesis is the only book in the dialog fixture, so the first of those rects is Genesis 1 and the second is Genesis 2. Turning a layer off does not remove them and does not change that order. The book-summary cell is a different rect. It is not `fill="transparent"`. Do not click it.
5. **The existing dialog fixture must stay put.** [DivergenceDialog.test.tsx](../frvt/web/src/divergence/DivergenceDialog.test.tsx) mocks one report: one scheme event in Genesis 1, and Genesis chapter lengths `[31, 25]` on both sides. The Numbering checkbox is `Numbering: 1 (100%)`. Verse segments, Bridges & omissions, and Single-sided books are `None (0%)` and disabled. Clicking a disabled checkbox does nothing. The accessible name does not change when Numbering is unchecked, because `layerStats` still counts that layer.
6. **A second test file cannot see that mock.** `vi.mock` is per file. A zero-event report and a two-layer report each get their own file. Do not add a mutable holder to the existing test, and do not change its `report` object.
7. **The column is outside the tab switch.** Overview, Radial, and Details all render the same `aside`. The sentence belongs there. The Details event table has its own empty sentence, `No divergences in the visible layers.` Leave that sentence alone. The info control on the dialog title still says `These versifications agree verse for verse.` when `comparison.events.length === 0`. That control is not the selection column.

---

## Locked decisions

- **Unpinned and both rings empty.** The selection column shows the existing comparison title and one sentence, `No differences in this comparison.` The donut is not mounted. `No slices in this chart.` is not shown. The column shows no button: no Open, no Clear selection, and no other button. `ScopeActions` already returns null when `bookCode` is null. Do not edit it.
- **Two ways to get there, one sentence.** A report with no events titles the column `All Deviances (None)`. A report that still has events, with every layer that has events switched off, keeps `All Deviances (N)`. Both show the same sentence.
- **One layer of several stays a chart.** If any visible slice remains, the donut row stays and the sentence stays absent. The title is unchanged.
- **A pin wins.** A pinned chapter or book with no visible events keeps `No deviances in this chapter.` or `No deviances in this book.`, the Open button (except on the Details tab, where it is already hidden), and Clear selection. Do not show `No differences in this comparison.` while `pin` is not null. Clearing the pin, while the rings are still empty, brings the comparison sentence back and removes the buttons.
- **Same element, same place.** The sentence is a `p` with class `dv-inspector-empty`, in `.dv-column-scroll`, as the next sibling of `Inspector`. It is not inside `.dv-summary`, not inside `.dv-donut-row`, and not inside `Inspector`. Do not add a CSS rule. Do not add a component.
- **Leave the chart components.** Do not edit `Donut.tsx`, `DonutKey.tsx`, `Inspector.tsx`, `ScopeHeading.tsx`, `ScopeActions.tsx`, or `counts.ts`. `Donut`'s empty paragraph and `DonutKey`'s empty sentence stay for direct use. The dialog stops mounting that row.
- **Title info control.** Do not change `These versifications agree verse for verse.` The column title for the whole comparison already has no info control. Do not add one.
- **Out of scope.** No backend change. Do not bump `ENGINE_VERSION` or reorder `TYPE_IDS`. Do not change what a click pins, which layers start on, or the event-table empty sentence.

---

## Phase 1: Hide the empty chart and show the sentence

**Files:** [DivergenceDialog.tsx](../frvt/web/src/divergence/DivergenceDialog.tsx), [DivergenceDialog.test.tsx](../frvt/web/src/divergence/DivergenceDialog.test.tsx).

### Work in `DivergenceDialog.tsx`

In the component comment, replace this sentence:

```text
A pinned chapter or book with no events in the visible layers omits the donut and those names.
```

with:

```text
A pinned chapter or book with no events in the visible layers omits the donut and those names and says there are no deviances there. When nothing is pinned and both rings are empty, the column omits the donut and those names and says there are no differences in this comparison, with no buttons.
```

Delete `hidePinnedChart`. Put this in its place:

```tsx
/**
 * Whether this render has no donut to draw.
 * Both rings are empty when the visible layers have no events in the current
 * scope. Nothing pinned uses the whole comparison: the column then centers
 * "No differences in this comparison." under the heading and draws no buttons.
 * A pinned chapter or book keeps its own empty sentence and its buttons.
 * Pass the slices `breakdown` returned for this render.
 */
function chartIsEmpty(layers: readonly Slice[], types: readonly Slice[]): boolean {
  return layers.length === 0 && types.length === 0;
}
```

`chart` is computed in the component body and is null before the report loads. Compute this once, in that body, immediately after the `heading` const. Do not put a `const` inside the JSX fragment. That is a syntax error.

```tsx
const chartHidden = chart !== null && chartIsEmpty(chart.layers, chart.types);
```

Use `chartHidden` in both places. The row:

```tsx
{!chartHidden && (
  <div className="dv-donut-row">
    <Donut layers={chart.layers} types={chart.types} scope={pinScopeLabel(pin)} />
    <DonutKey layers={chart.layers} types={chart.types} />
  </div>
)}
```

The sentence, in `.dv-column-scroll`, immediately after `Inspector` and before `ScopeActions`:

```tsx
<Inspector
  index={index}
  selection={pin}
  layersOn={layerSet}
  notes={report.eventNotes}
  sideNames={{ a: comparison.a, b: comparison.b }}
/>
{pin === null && chartHidden && (
  <p className="dv-inspector-empty">No differences in this comparison.</p>
)}
```

Leave `ScopeActions` where it is. Leave `pinScopeLabel` where it is. If `Slice` is still the type of the two parameters, keep the import. Do not leave an unused import.

### Tests in the existing file

Do not change the mocked `report`. Stay on `fireEvent`, which this file already uses. Headings are level 2. The first `rect[fill='transparent']` is Genesis 1. The second is Genesis 2.

In `keeps the column on the comparison until a chapter is clicked`, after the level-2 heading assertion and before the click, add:

```tsx
expect(screen.queryByText("No differences in this comparison.")).not.toBeInTheDocument();
```

After the click, next to the existing donut assertion, add the same line again.

In `hides the donut for a chapter with no deviances`, keep the current assertions and add:

```tsx
expect(screen.queryByText("No differences in this comparison.")).not.toBeInTheDocument();
expect(screen.getByRole("button", { name: "Open GEN in book detail" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: "Clear selection" })).toBeInTheDocument();
```

Add one test, `centers the comparison sentence when every layer is off`. Render the dialog the same way the other tests do, and `waitFor` the first transparent matrix rect before touching a control.

Walk this order in that one test:

1. The level-2 heading is `All Deviances (1)`. `No differences in this comparison.` is absent. `.dv-donut` is present.
2. Click the checkbox whose name matches `/^Numbering/`. Do not click the disabled checkboxes. The heading is still `All Deviances (1)`. `getAllByText("No differences in this comparison.")` has length 1. That node's `className` contains `dv-inspector-empty`. `No slices in this chart.` is absent. `.dv-donut` is null. No button named `/^Open /`. No button named `Clear selection`.
3. Click the `Radial` button, then the `Details` button. After each, the heading is still `All Deviances (1)`, the comparison sentence is still the only node with that text, and those two buttons are still absent. On Details, `No divergences in the visible layers.` is present. That is the book table. Leave it.
4. Click `Overview`. The matrix is drawn in an effect, so `waitFor` the first `rect[fill='transparent']` again, then click it. The level-2 heading is `Genesis 1`. The column says `No deviances in this chapter.` and does not say `No differences in this comparison.` `Open GEN in book detail` and `Clear selection` are present. `.dv-donut` is null.
5. Click `Clear selection`. The heading is `All Deviances (1)` again. The comparison sentence is back, once. Both buttons are absent. `.dv-donut` is still null, because Numbering is still off.
6. Click the Numbering checkbox again. The comparison sentence is absent. `.dv-donut` is present. The heading is still `All Deviances (1)`.

**Gate:** prettier on the two files, then the web gate.

---

## Phase 2: No events, and one layer of two

**Files:** new [DivergenceDialog.empty.test.tsx](../frvt/web/src/divergence/DivergenceDialog.empty.test.tsx) and new [DivergenceDialog.layers.test.tsx](../frvt/web/src/divergence/DivergenceDialog.layers.test.tsx). No production edit if phase 1 is correct.

If a test in this phase fails, the condition in the dialog is wrong. Fix that condition. Do not special-case a checkbox, and do not treat a zero total as the only empty chart. Do not change the mock in `DivergenceDialog.test.tsx`.

Each new file has its own `vi.mock("./useDivergenceReport", ...)` and its own report. Copy the render props from the existing dialog test: `fromTranslationId="from"`, `toTranslationId="to"`, both scheme ids null, `onClose` a no-op. Copy the rest of the report shell from that test (`eventNotes`, `org`, `catalog`, `sides`, `engineVersion`, `computedAt`, the warnings object, `runs: []`). The book is Genesis, `section: "OT"`, `a: [31, 25]`, `b: [31, 25]`.

`buildIndex` reads `report.types[eventTypeIndex]`. The type index on an event must be a real index into that file's `types` array.

### No events

`events: []`. `types` can be the one scheme row from the existing fixture. `waitFor` a transparent matrix rect, then:

- The level-2 heading is `All Deviances (None)`.
- `getAllByText("No differences in this comparison.")` has length 1, and that node's `className` contains `dv-inspector-empty`.
- `No slices in this chart.` is absent. `.dv-donut` is null. No `/^Open /` button. No `Clear selection` button.
- Click the first transparent rect. The heading is `Genesis 1`. The column says `No deviances in this chapter.` The comparison sentence is absent. `Open GEN in book detail` and `Clear selection` are present.
- Click `Clear selection`. The heading is `All Deviances (None)`. The comparison sentence is back, once. Both buttons are absent.

### One layer of two

Use these `types` and `events`. Both events are in Genesis 1.

```tsx
types: [
  { id: "RENUMBER", severity: 2, layer: "scheme" },
  { id: "BRIDGE", severity: 1, layer: "text" },
],
events: [
  [0, ["GEN", 1, 1, 1, 2], ["GEN", 1, 1, 1, 2], ["GEN", 1, 1, 1, 2], 2, "renumber", []],
  [1, ["GEN", 1, 1, 1, 1], ["GEN", 1, 1, 1, 1], ["GEN", 1, 1, 1, 1], 1, "bridge", []],
],
```

`waitFor` the matrix, then:

- The level-2 heading is `All Deviances (2)`. The comparison sentence is absent. `.dv-donut` is present. The Numbering checkbox name matches `/^Numbering: 1 \(50%\)/`. The Bridges checkbox name matches `/^Bridges & omissions: 1 \(50%\)/`.
- Uncheck Numbering only. The heading is still `All Deviances (2)`. The comparison sentence is absent. `.dv-donut` is present. `No slices in this chart.` is absent.
- Uncheck Bridges & omissions as well. The heading is still `All Deviances (2)`. The comparison sentence is present once. `.dv-donut` is null. No `/^Open /` button. No `Clear selection` button.
- Click the first transparent rect. The heading is `Genesis 1`. The column says `No deviances in this chapter.` The comparison sentence is absent. Both buttons are present.

**Gate:** prettier on the two new files, then the web gate.

---

## Phase 3: Notes

**Files:** [doc/ux-spec.md](../doc/ux-spec.md), [doc/divergence-dialog.md](../doc/divergence-dialog.md). Do not edit code. Do not run prettier on `doc/`.

In `doc/ux-spec.md`, in the layout bullet, this sentence stays, and the quoted text is inserted immediately after it:

```text
A pinned chapter or book with no deviances in the visible layers hides the donut and the slice names.
```

Insert:

```text
When nothing is pinned and both rings are empty, the column hides the donut and the slice names and centers "No differences in this comparison." under the heading, with no buttons. Switching off every layer that has events is that same empty chart, and the heading keeps its count.
```

In the selection bullet, replace:

```text
With nothing pinned, or when the book is missing, the list is empty.
```

with:

```text
With nothing pinned and at least one visible slice, the event list is empty. With nothing pinned and no visible slices, the column centers "No differences in this comparison." under the heading and shows no buttons. A missing book leaves the list empty.
```

Leave the chapter sentence, the book sentence, and the Open and Clear rules in that bullet as they are. Leave `These versifications agree verse for verse.` as it is.

In `doc/divergence-dialog.md`, find `The no-deviances sentence is centered under the scope heading.` Leave that sentence, and insert this immediately after it:

```text
When nothing is pinned and both rings are empty, the column hides the donut and the slice names and centers `No differences in this comparison.` under the heading, with no buttons. A comparison with no events does this, and so does every layer switched off while events still exist. The heading stays `comparisonTitle`.
```

Do not rewrite the rest of that paragraph.

**Gate:** Search both notes for `No differences in this comparison.` Each file has it. `doc/ux-spec.md` still has `These versifications agree verse for verse.`, `No deviances in this chapter.`, and `No deviances in this book.` `doc/divergence-dialog.md` still has `The no-deviances sentence is centered under the scope heading.` No web gate is required in this phase. Do not edit a source file to satisfy this search.
