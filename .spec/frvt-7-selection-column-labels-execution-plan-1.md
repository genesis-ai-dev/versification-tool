# Selection column: labels, severity line, and pie size

**Document:** `frvt-7-selection-column-labels-execution-plan-1`
**Status:** Implemented. The phases below are the record of that work. Do not apply them again. The donut-label test looks up `ONE_SIDED` and `BOOK_ONE_SIDED` in the fixture, because those type indexes are 10 and 11.
**Audience:** The agent implementing these changes, and the owner reviewing them
**Scope:** Layer and donut labels, where the event-severity line sits, and the pie's size and slice-name size. Files are `taxonomy.ts`, `breakdown.ts`, `breakdown.test.ts`, `eventFormat.test.ts`, `DonutKey.test.tsx`, `Inspector.tsx`, `Inspector.test.tsx`, `DivergenceDialog.tsx`, `ChartKey.tsx`, `frvt/web/src/styles/divergence.css`, and three notes under `doc/`. No backend change. No edit under `.spec/completed/`. Do not edit the other plans in `.spec/`.

Never commit or push. The owner reviews all changes. Do not edit this plan.

---

## How to use this document

The phases are the order the work was done in. Each phase lists its files, its work, its tests, and the gate that passed. The "Locked decisions" section is the contract that was implemented. Do not invent a second version of it.

> **Rule 12.** Phase numbers and other identifiers in this plan must never appear in source code, comments, test names, CSS class names, runtime strings, or `doc/`. Name things for what they do.

**Web gate**, after each phase:

```bash
cd frvt/web && export PATH=$HOME/.local/node/bin:$PATH && npm test && npm run typecheck && npx eslint src/divergence
```

`npm test` is the unit suite. It does not run the browser suite. eslint must report 0 errors and no new warnings under `src/divergence`. Typecheck and eslint catch a missed import. Fix those. Do not suppress them. If `npm run lint` fails on a file this plan does not touch, leave that file alone.

## Rules for every phase

- Every new or changed function, component, interface, and interface field gets an orienting doc comment: why it exists, when to use it, and what it returns. Where a snippet below already has that comment, copy it. Update any existing comment that the change makes wrong.
- Files stay under 600 lines. Functions take at most 6 named parameters. Do not add a source file. Keep `SeverityKey` in `ChartKey.tsx`.
- Tests cover the contract: the new words, the words that must stay, and when the severity line is present. Do not test a CSS class name for its own sake.
- This work changes no backend method, so the backend logging rule has nothing to apply to.
- Run `npx prettier --write` on each file under `frvt/web` that the phase edits. Do not run prettier on `doc/`.
- Do not add a `title` attribute anywhere inside the dialog.
- Do not edit anything under `.spec/completed/`.

---

## Findings that shape this plan

1. **Two layer names are one string each.** `LAYER_LABELS.text` and `LAYER_LABELS.canon` in [taxonomy.ts](../frvt/web/src/divergence/taxonomy.ts) are `Bridges and omissions` and `Books on one side only`. [breakdown.ts](../frvt/web/src/divergence/breakdown.ts) puts those strings on the checkbox (`layerStats.label`) and on the donut's inner-ring slice. Changing the two strings changes both surfaces. `LAYER_SHORT` (`bridge or omission`, `one-sided book`) is a different map, used in the comparison sentence. Leave it.
2. **The verse type has two audiences.** `TYPE_LABELS` says `Present on one side only` for `ONE_SIDED` and `Book on one side only` for `BOOK_ONE_SIDED`. `typeLabel` in [eventFormat.ts](../frvt/web/src/divergence/eventFormat.ts) reads `TYPE_LABELS`. The event list (`Inspector`), the book-detail table (`EventTable`), and a selected event's title (`ScopeHeading`) all call `typeLabel`. The donut does not. It copies `TYPE_LABELS` into the slice in `breakdown`. A donut-only name has to be chosen there. Do not change `TYPE_LABELS`, or the list, the table, and the title change too.
3. **The slice tip uses the slice label.** `Donut` builds each hover tip from `slice.label`. After the breakdown change, an `ONE_SIDED` slice's tip says `Single-sided verse`. That is the donut, not the event list. Help text stays keyed by id in `help.ts`. Do not edit `help.ts`.
4. **`DonutKey` prints the label it is given.** The test that renders every type passes `TYPE_LABELS` in directly, so it still shows `Present on one side only`. That test is not the production path. The production path is `breakdown`. Do not remap the name inside `DonutKey`.
5. **The severity line is a separate list.** `SeverityKey` in [ChartKey.tsx](../frvt/web/src/divergence/ChartKey.tsx) is one centered `.dv-chart-key` list. [DivergenceDialog.tsx](../frvt/web/src/divergence/DivergenceDialog.tsx) renders it under the toggles, on every tab, including when the column has no events. The event list is `Inspector`. It already knows the filtered events: a pinned event is one row, a book or chapter uses `bookEvents` or `cellState`, and `layersOn` is a set (`cellEvents` keeps an event only when `layersOn.has(event.layer)`). An empty set shows `Same numbering on both sides in the visible layers.` Nothing pinned, or an unknown book, shows `Click a chapter, book, or event. Arrow keys move through the matrix.`
6. **The list and the severity line both have no margin.** `.dv-events` is `margin: 0`. `.dv-chart-key` is `margin: 0`. Dropping `SeverityKey` in above the list with no extra margin glues it to the pie and to the first event. The chart-mark line at the top of Overview also uses `.dv-chart-key`. Add the gap only for the list inside `.dv-inspector`. Do not change the chart-mark line, and do not use `position: sticky`.
7. **The pie is a fixed box beside the names.** `.dv-donut` is `5.59rem` by `5.59rem`. `.dv-donut-row` is a flex row with a `0.75rem` gap. The selection column is the `19.8rem` grid track. Half of that track is the pie; the gap has to come out of the name column or the row overflows by `0.75rem`. The SVG `viewBox` stays `0 0 220 220`. Do not edit [Donut.tsx](../frvt/web/src/divergence/Donut.tsx). The empty sentence `No differences in {scope}.` is a `.dv-empty` paragraph in the pie's place, currently `flex: 0 0 5.59rem`. It has to take the same half-width track. `No slices in this chart.` is the other column.
8. **Slice names inherit 14px.** `body` in `app.css` is `14px`. `.dv-key-row` sets no font size. `.dv-key-group h3` is `0.8rem`. `.dv-info-icon` is `13px`. `.dv-swatch` is `0.75rem`. A `0.7em` size on the row shrinks the name and leaves the icon, the swatch, and the headings alone. Set that size on `.dv-donut-key .dv-key-row` and on `.dv-donut-key > p`, not on `.dv-key-row` alone and not on `.dv-empty`.

---

## Locked decisions

- **Checkboxes and donut layers.** `Bridges & omissions` replaces `Bridges and omissions`. `Single-sided books` replaces `Books on one side only`. Both the checkbox and the inner-ring slice use the new words. The ampersand is the `&` character. `LAYER_SHORT` stays `bridge or omission` and `one-sided book`.
- **Donut verse type.** The donut slice for `ONE_SIDED` says `Single-sided verse`. `TYPE_LABELS`, `typeLabel("ONE_SIDED")`, the event list, the book-detail table, and the scope heading keep `Present on one side only`. `Book on one side only` stays everywhere, including the donut.
- **Severity line.** Remove it from under the toggles. Render `SeverityKey` as the first thing inside the non-empty event branch of `Inspector`, above the `<ol>`. Show it only when that list has at least one event. A single pinned event counts. A list that shows 60 rows and then `more in the book detail table` counts. Hide it for the selection prompt, an unknown book, and the same-numbering sentence. The column is shared, so the line appears on Overview, Radial, and Details whenever the list is non-empty. It does not change the pin. Do not put it in the detail table or on the chart.
- **Gap.** `.dv-inspector > .dv-chart-key` gets `margin: 0.75rem 0`. The chart-mark line keeps `margin: 0`.
- **Pie.** The row is a grid: `50%` and `calc(50% - 0.75rem)`, with `column-gap: 0.75rem`. The pie's width is the first track. Its height matches that width (`aspect-ratio: 1`). Do not write `9.9rem`. The empty "No differences" sentence fills that same first track and wraps. The name column stays left-aligned and starts at the top of the pie.
- **Name size.** Slice-name rows and `No slices in this chart.` are `font-size: 0.7em` (30% smaller than the 14px column text). Ring headings stay `0.8rem`. The info icon stays `13px`. The swatch stays `0.75rem`.
- **Out of scope.** Do not edit `Donut.tsx`, `help.ts`, `eventFormat.ts`, `EventTable.tsx`, `ScopeHeading.tsx`, `MatrixView.tsx`, `RadialView.tsx`, or the count-dot and hatch code. Do not change `TYPE_IDS`, when a dot or hatch is drawn, what a click pins, or which element scrolls. Do not reorder the dialog's flex children. `.dv-layout` stays a direct child of `.dv-root`.

---

## Phase 1: Rename the two layer labels

**Files:** [taxonomy.ts](../frvt/web/src/divergence/taxonomy.ts), [breakdown.test.ts](../frvt/web/src/divergence/breakdown.test.ts), [eventFormat.test.ts](../frvt/web/src/divergence/eventFormat.test.ts), [DonutKey.test.tsx](../frvt/web/src/divergence/DonutKey.test.tsx).

**Work in `taxonomy.ts`:** Change only these two strings.

```ts
  text: "Bridges & omissions",
  canon: "Single-sided books",
```

Leave `LAYER_SHORT`, `TYPE_IDS`, and `TYPE_LABELS` as they are.

**Tests:** In the existing `counts every layer when nothing is pinned` test, after the current expects, add:

```ts
    expect(chart.layerStats.map((item) => item.label)).toEqual([
      "Numbering",
      "Verse segments",
      "Bridges & omissions",
      "Single-sided books",
    ]);
```

In `typeLabel`'s test, add:

```ts
    expect(typeLabel("ONE_SIDED")).toBe("Present on one side only");
    expect(typeLabel("BOOK_ONE_SIDED")).toBe("Book on one side only");
```

Import `LAYER_SHORT` in `breakdown.test.ts` and add this expect beside the layer-label expect:

```ts
    expect(LAYER_SHORT.text).toBe("bridge or omission");
    expect(LAYER_SHORT.canon).toBe("one-sided book");
```

In `DonutKey.test.tsx`, change the absent-text expect from `Bridges and omissions` to `Bridges & omissions`. The sample still does not include that layer. Do not add a click.

**Docs:** None. Those two old strings are not in `doc/`.

**Gate:** The web gate. The checkboxes and the inner-ring slices both read the new strings, because both read `LAYER_LABELS`. `Present on one side only` is unchanged.

---

## Phase 2: Name the donut's one-sided verse

**Files:** [taxonomy.ts](../frvt/web/src/divergence/taxonomy.ts), [breakdown.ts](../frvt/web/src/divergence/breakdown.ts), [breakdown.test.ts](../frvt/web/src/divergence/breakdown.test.ts).

**Work in `taxonomy.ts`:** Add this function directly below `TYPE_LABELS`. Do not change the array.

```ts
/**
 * Name of one type slice on the donut.
 * The event list, the book-detail table, and the scope heading keep typeLabel.
 * ONE_SIDED is the exception: the donut says "Single-sided verse", and those
 * other surfaces keep "Present on one side only". Every other index uses TYPE_LABELS.
 * An index outside the catalog returns an empty string.
 */
export function donutTypeLabel(index: number): string {
  if (TYPE_IDS[index] === "ONE_SIDED") {
    return "Single-sided verse";
  }
  return TYPE_LABELS[index] ?? "";
}
```

**Work in `breakdown.ts`:** Import `donutTypeLabel`. Replace the `types:` expression so the unused label argument is `_`, and the slice is named with `donutTypeLabel`. Leave the filter's condition as it is.

```ts
    types: TYPE_LABELS.map((_, index) => ({ index }))
      .filter((item) => {
        const layer = report.types[item.index]?.layer;
        return layersOn[layer] !== false && rings[item.index] > 0;
      })
      .map((item) =>
        slice(
          `type-${item.index}`,
          donutTypeLabel(item.index),
          rings[item.index],
          visible,
        ),
      ),
```

Do not change the layer slices. They already use `LAYER_LABELS`.

**Tests:** Add one test in `describe("breakdown")`. `event` and `withEvents` are already in the file. Type index 11 is `ONE_SIDED`. Type index 12 is `BOOK_ONE_SIDED`.

```ts
  it("names a one-sided verse on the donut and keeps the book type's catalog name", () => {
    const chart = breakdown(
      withEvents([event(11, "GEN", 1), event(12, "GEN", 1)]),
      bookPin("GEN"),
      allOn,
    );
    expect(chart.types.map((item) => item.label)).toEqual([
      "Single-sided verse",
      "Book on one side only",
    ]);
  });
```

Leave the existing expect that a pinned Psalms chart is labeled `Renumbered run`. That index is not `ONE_SIDED`.

Do not add a test for the empty-string return.

**Gate:** The web gate. `typeLabel("ONE_SIDED")` is still `Present on one side only`. A donut slice for that type is `Single-sided verse`.

---

## Phase 3: Move the severity line above the event list

**Files:** [Inspector.tsx](../frvt/web/src/divergence/Inspector.tsx), [Inspector.test.tsx](../frvt/web/src/divergence/Inspector.test.tsx), [DivergenceDialog.tsx](../frvt/web/src/divergence/DivergenceDialog.tsx), [ChartKey.tsx](../frvt/web/src/divergence/ChartKey.tsx), [divergence.css](../frvt/web/src/styles/divergence.css), [doc/ux-spec.md](../doc/ux-spec.md), [doc/ui-style-guide.md](../doc/ui-style-guide.md), [doc/divergence-dialog.md](../doc/divergence-dialog.md).

**Work in `ChartKey.tsx`:** Replace the `SeverityKey` doc comment with:

```ts
/**
 * Event-severity scale for the selection column.
 * Inspector renders it above the event list when that list has at least one event.
 * It does not change the pin.
 */
```

Do not change the JSX. The list is already centered by `.dv-chart-key`.

**Work in `Inspector.tsx`:** Import `SeverityKey` from `./ChartKey`. Inside the branch that already has the `<ol>`, render `<SeverityKey />` immediately before that `<ol>`. Do not wrap it in another element. The gap rule is `.dv-inspector > .dv-chart-key`, and a wrapper would miss it. Do not render it in the same-numbering branch or in `selectionPrompt`. Replace the whole component doc comment with:

```ts
/**
 * List the events for the pinned chapter, book, or single event.
 * The severity scale sits above that list when it has at least one event.
 * The title, its actions, and the meta line sit above the donut. This panel is the
 * selection prompt when nothing is selected or the book is missing, and the event list when
 * a known book is selected. A selection that names one event lists only that event.
 * Each event shows its catalog label, both sides, and flag chips. A data-warning chip
 * includes the notes stored for that event.
 */
```

**Work in `DivergenceDialog.tsx`:** Delete the `<SeverityKey />` that sits under the toggles. Drop `SeverityKey` from the import. Keep the `ChartKey` import and the chart-mark line inside the stage. In the file comment, replace `Event severity is centered under the toggles, and the other marks are centered at the top of the Overview and Radial charts.` with `Event severity is centered between the donut and the event list when that list has events. The other marks are centered at the top of the Overview and Radial charts.`

**Work in `divergence.css`:** Add this rule next to `.dv-chart-key`. Do not change `.dv-chart-key` itself.

```css
/* Gap for the severity line above the event list. The chart-mark line keeps margin 0. */
.dv-inspector > .dv-chart-key {
  margin: 0.75rem 0;
}
```

**Tests in `Inspector.test.tsx`:**

- In `lists the chapter events without a title or actions`, expect `Event severity 1 to 4`.
- In `shows the selection prompt and no actions when nothing is selected` and in `shows the selection prompt when the book is not in the index`, expect `Event severity 1 to 4` to be absent.
- Add one test that copies the chapter-events render and passes `layersOn={new Set()}`. Expect `Same numbering on both sides in the visible layers.` Expect `Event severity 1 to 4` to be absent.

`ChartKey.test.tsx` already covers what `SeverityKey` renders. Do not change it.

**Docs.** In [doc/ux-spec.md](../doc/ux-spec.md), replace this sentence and no other sentence in that bullet:

`Event severity sits centered under the toggles on every tab, including Details.`

with:

`Event severity sits centered in the selection column, between the donut and the event list, when that list has at least one event. It is hidden for the selection prompt and when the column says the numbering is the same. It is not under the toggles.`

In [doc/ui-style-guide.md](../doc/ui-style-guide.md), in the divergence-dialog paragraph, replace `Event severity is centered under them.` with `Event severity is centered between the donut and the event list when that list has events.`

In [doc/divergence-dialog.md](../doc/divergence-dialog.md), replace:

`` `SeverityKey` is the event-severity scale centered under the layer toggles on every tab. ``

with:

`` `SeverityKey` is the event-severity scale centered above the event list when that list has at least one event. The selection prompt and the same-numbering sentence do not include it. ``

In the component table, replace the `SeverityKey` cell `Event severity, centered under the toggles on every tab. It does not change the pin` with `Event severity, centered above the event list when that list has events. It does not change the pin`.

**Gate:** The web gate. Under the toggles there is no severity line. A non-empty event list has one, centered, above the rows. An empty list and the selection prompt do not.

---

## Phase 4: Size the pie and the slice names

**Files:** [divergence.css](../frvt/web/src/styles/divergence.css), [doc/ux-spec.md](../doc/ux-spec.md), [doc/ui-style-guide.md](../doc/ui-style-guide.md).

**Work in `divergence.css`.** Replace the donut box, the row, the name column's flex line, and the empty-sentence width. Leave the first-group margin rule, the host's `align-self: center` rule, and the row's `align-self: flex-start` override. The host also needs a width, added on the existing row override.

Replace the comment and rule for `.dv-donut` with:

```css
/* Half the selection column. The viewBox is unchanged, so the rings scale with the box. */
.dv-donut {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 1;
}
```

Replace the `.dv-donut-row` rule with:

```css
.dv-donut-row {
  display: grid;
  grid-template-columns: 50% calc(50% - 0.75rem);
  align-items: start;
  align-self: stretch;
  column-gap: 0.75rem;
  min-width: 0;
}
```

`50%` plus the gap plus `calc(50% - 0.75rem)` is the row. The pie is half the column. The gap comes out of the name column.

On `.dv-donut-key`, delete `flex: 1`. Keep `min-width: 0` and `text-align: left`.

Replace the empty-sentence width rule with:

```css
/* The empty sentence fills the pie's track and wraps there. */
.dv-donut-row > .dv-empty {
  width: 100%;
  min-width: 0;
}
```

On the existing `.dv-donut-row .dv-donut-host` rule, add `width: 100%` beside `align-self: flex-start`. Without that width, the square collapses.

Add the name size. Do not change `.dv-key-group h3`, `.dv-info-icon`, or `.dv-swatch`.

```css
/* 30% smaller than the column text. The ring headings stay 0.8rem. */
.dv-donut-key .dv-key-row,
.dv-donut-key > p {
  font-size: 0.7em;
}
```

`.dv-donut-key > p` is `No slices in this chart.` It already has `margin: 0`. Keep that rule.

**Docs.** In the selection-column bullet of [doc/ux-spec.md](../doc/ux-spec.md), replace `The donut is 5.59rem on each side.` with `The donut's width is half the selection column, and its height matches that width.` In that same bullet, after the sentence about the slice names starting at the top of the donut, add: `The slice names and the empty-slice sentence are 30% smaller than the column text. The ring headings are not.`

In the divergence-dialog paragraph of [doc/ui-style-guide.md](../doc/ui-style-guide.md), add this sentence at the end of the paragraph: `Slice names beside the donut, and the empty-slice sentence, are 30% smaller than the column text.`

**Gate:** The web gate, then the browser check below. `Donut.tsx` is unchanged. `.dv-donut` has no `5.59rem`.

### Browser check

Use the Vite dev server (`npm run dev` in `frvt/web`) so the check reads the source CSS. If the check uses the existing server on port 8000, run `npm run build` in `frvt/web` first. That server serves `frvt/web/dist`. The local Basic credentials are in the repository README.

Open a comparison that has both an empty book and a book with events. Then confirm all of these:

- The layer checkboxes read `Bridges & omissions` and `Single-sided books`. There is no severity line under the toggles.
- A book or chapter whose event list has rows shows `Event severity 1 to 4` centered between the pie and the first event. Clearing the selection, or pinning a book that says the numbering is the same, hides that line.
- The pie's width is half the selection column's content width, and the pie is square. The names start at the pie's top, to its right. `No differences…` wraps in the pie's half. `No slices in this chart.` is on the right.
- A slice name is smaller than `Inner ring: layers`. The info icon is still 13px.
- Overview still shows the six chart marks at the top of the dark chart area. Radial still adds the three move items. Details does not show those marks. Escape on the chart still clears the pin and leaves the dialog open.

If this comparison draws an `ONE_SIDED` slice, the donut says `Single-sided verse` and the event list still says `Present on one side only`. If it draws none, the unit test that names those two donut slices is the check for that split. Do not invent a slice to force it.
