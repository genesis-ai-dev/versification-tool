# Divergence dialog: click selection and control chrome

**Document:** `frvt-7-selection-and-controls-execution-plan-1`
**Status:** Implemented
**Audience:** The agent implementing these changes, and the owner reviewing them
**Scope:** The divergence dialog in `frvt/web/src/divergence/` and `frvt/web/src/styles/divergence.css`. No backend change. No edit under `.spec/completed/`.

Never commit or push. The owner reviews all changes.

---

## How to use this document

Do the phases in order. Each phase lists its files, its work, its tests, and a gate. Do not start a phase until the previous gate passes. The "Locked decisions" section is the contract. Do not invent alternatives. When this plan gives exact text in quotes, or a code block, use that text.

> **Rule 12.** Phase numbers and other identifiers in this plan must never appear in source code, comments, test names, CSS class names, or runtime strings. Name things for what they do.

**Web gate**, after every phase:

```bash
cd frvt/web && export PATH=$HOME/.local/node/bin:$PATH && npx vitest run src/divergence && npm run typecheck && npx eslint src/divergence
```

eslint must report 0 errors and no new warnings under `src/divergence`. Typecheck and eslint are how a missed prop or an unused import is caught. Fix those. Do not suppress them. If full `npm run lint` fails, it fails on files this plan does not touch. Leave those files alone.

## Rules for every phase

- Every new or changed function, component, hook, interface, interface field, and module constant gets an orienting doc comment: why it exists, when to use it, and what it returns or throws. Match the style in `model/detail.ts`. Where a snippet in this plan already has doc comments, copy them as written. Where it shows logic only, add the doc comments yourself. Update any existing doc comment that the change makes wrong.
- Files stay under 600 lines. Functions take at most 6 named parameters. Every file this plan touches already meets both limits. This work shrinks them or adds only a few lines.
- Tests cover happy paths and essential contracts only. Delete a test whose subject is deleted. Do not test CSS or markup structure for its own sake.
- This work changes no backend method, so the backend logging rule has nothing to apply to.
- Run `npx prettier --write` on each file the phase edits, from `frvt/web`.
- Do not add a `title` attribute anywhere inside the dialog.
- Do not edit anything under `.spec/completed/`.

---

## Findings that shape this plan

1. **The donut already follows only the pin.** In [DivergenceDialog.tsx](../frvt/web/src/divergence/DivergenceDialog.tsx), `scope` is built from `pin` and passed to `breakdown` and `Donut`. Do not change `breakdown`, `Donut`, or `scope`. What moves as the pointer moves is `shown = pin ?? hover`. That value feeds the title above the donut (`scopeHeading`), the event list (`Inspector`), and `Open {CODE} in book detail` (`ScopeActions`, through `heading.bookCode`).
2. **The hover callbacks exist only to fill that column.** `MatrixView.onHover`, `RadialView.onHover`, `RadialView.pinned`, `RunHighlight.onHover` (the strip and the dot plot), `RunHighlight.onHoverEvent` (table rows), and `hoverSelection` in `model/selection.ts` have no other reader. Removing the column's hover state makes them dead. Delete them. Keep pointer feedback that does not change the column: a radial ribbon still brightens its own stroke, the dot plot still switches to a pointer cursor over a mark, and existing CSS hover styles stay.
3. **The view and layout buttons already expose their selection.** Overview, Radial, Details, Chapters as slices, and Chapters as rings set `aria-pressed`. Nothing paints that state. The Details tabs Divergences and Dot plot use `.dv-sidetab[aria-selected="true"]` in [divergence.css](../frvt/web/src/styles/divergence.css), which sets `border-color: var(--dv-accent)`. `.btn:hover:not(:disabled)` in `app.css` has the same specificity as `.dv-controls .btn[aria-pressed="true"]`. `divergence.css` is imported after `app.css` in `main.tsx`, so the accent border wins while the pointer is over a pressed button.
4. **Radial book codes are clipped on the right.** `RadialView` sizes the SVG once, from `host.clientWidth`, inside an effect. The chart is tall enough that the dialog body then gains a vertical scrollbar, which narrows the column. The SVG keeps its measured width, and `.dv-stage` (`overflow: auto`) clips the right edge, where the book codes sit. The codes also have little spare room inside the SVG: `bookLabelTransform` starts them at `radius + 8`, and `radius` is `size / 2 - 34`, leaving 26px for a three-character code drawn at 11px by `.dv-radial text`. Both layouts share this radius.

---

## Locked decisions

- **The column follows a selection.** Pointer movement changes none of the title, the donut, the event list, or the Open button, on Overview, Radial, and Details. A click selects: a chapter or book in the matrix, a chapter, book ring, or ribbon in the radial chart, and a ribbon, block, dot mark, or table row in Details. Enter or Space on a table row selects. Arrow keys on Overview still pin a cell and update the column. Escape and Clear selection still clear the pin. Do not change the Overview key handler.
- **Empty prompt.** The exact text is `Click a chapter, book, or event. Arrow keys move through the matrix.` It replaces `Hover or click a chapter. Arrow keys move through the matrix.`
- **Selected buttons.** One shared rule. Do not change button markup, `aria-pressed`, or click handlers:

```css
.dv-sidetab[aria-selected="true"],
.dv-controls .btn[aria-pressed="true"] {
  border-color: var(--dv-accent);
}
```

- **Radial fit.** Scale the drawn SVG down to the column, and reserve room for the book code inside the SVG. No `overflow` rule. No resize observer. The constants and the CSS are in Phase 3. Copy them as written.

---

## Phase 1: Selected button highlight

**Files:** [divergence.css](../frvt/web/src/styles/divergence.css) only.

**Work:** Replace the existing `.dv-sidetab[aria-selected="true"]` rule with the shared rule in Locked decisions. Leave the comment above `.dv-sidetab-label` as it is. Do not edit the buttons in [DivergenceDialog.tsx](../frvt/web/src/divergence/DivergenceDialog.tsx) or [SideTabs.tsx](../frvt/web/src/divergence/SideTabs.tsx).

**Tests:** None. This is CSS.

**Gate:** Web gate. Then, in the browser:

- Overview has the accent border when the dialog opens. Clicking Radial or Details moves that border and leaves the others with the normal border.
- On Radial, Chapters as slices has the accent border. Clicking Chapters as rings moves it.
- The accent border stays while the pointer is over the selected button.
- Divergences and Dot plot look the same as before this phase.

If browser tools are unavailable, say so in the phase report. Do not claim the visual check passed.

---

## Phase 2: The column changes only from a selection

Do every step, then run the gate once. Do not stop between steps for a typecheck. The typecheck at the gate lists any caller this list missed.

**Files:**

- [model/selection.ts](../frvt/web/src/divergence/model/selection.ts)
- [model/selection.test.ts](../frvt/web/src/divergence/model/selection.test.ts)
- [Ladder.tsx](../frvt/web/src/divergence/Ladder.tsx)
- [DotPlot.tsx](../frvt/web/src/divergence/DotPlot.tsx)
- [EventTable.tsx](../frvt/web/src/divergence/EventTable.tsx)
- [DetailView.tsx](../frvt/web/src/divergence/DetailView.tsx)
- [DetailView.test.tsx](../frvt/web/src/divergence/DetailView.test.tsx)
- [MatrixView.tsx](../frvt/web/src/divergence/MatrixView.tsx)
- [MatrixView.test.tsx](../frvt/web/src/divergence/MatrixView.test.tsx)
- [RadialView.tsx](../frvt/web/src/divergence/RadialView.tsx)
- [RadialView.test.tsx](../frvt/web/src/divergence/RadialView.test.tsx)
- [DivergenceDialog.tsx](../frvt/web/src/divergence/DivergenceDialog.tsx)
- [DivergenceDialog.test.tsx](../frvt/web/src/divergence/DivergenceDialog.test.tsx) (new)
- [Inspector.tsx](../frvt/web/src/divergence/Inspector.tsx)
- [Inspector.test.tsx](../frvt/web/src/divergence/Inspector.test.tsx)
- [ScopeHeading.tsx](../frvt/web/src/divergence/ScopeHeading.tsx)
- [ScopeActions.tsx](../frvt/web/src/divergence/ScopeActions.tsx)
- [ScopeActions.test.tsx](../frvt/web/src/divergence/ScopeActions.test.tsx)
- [counts.ts](../frvt/web/src/divergence/counts.ts)

### Selection model

In `RunHighlight`, delete `onHover` and `onHoverEvent` and their doc comments. Leave `activeKey`, `onPick`, `activeEvent`, and `onPickEvent`.

Delete `hoverSelection` and its doc comment. Keep `findRun`, `runSelection`, and `eventSelection`. They still back clicks.

In `selection.test.ts`, delete the `hoverSelection` import and the whole `describe("hoverSelection", ...)` block. Keep the `runKey` import. The other describes use it.

### Strip, dot plot, and table

In `Ladder.tsx`, delete the `handlers` ref, the comment above it, and the assignment `handlers.current.hover = highlight.onHover`. In `wire`, delete the `mouseenter` listener. Leave `pointerdown`, `click`, `dv-pick`, and `dv-selected`.

In `DotPlot.tsx`, delete `lastHoverRef` and its comment. Replace `onMouseMove` with this. Keep `onMouseLeave` and `onClick` as they are.

```tsx
onMouseMove={(event) => {
  const key = selectedDotKey(
    layoutRef.current,
    event.nativeEvent.offsetX,
    event.nativeEvent.offsetY,
    DOT_HIT_SLOP_PX,
  );
  event.currentTarget.style.cursor = key === null ? "default" : "pointer";
}}
```

In `EventTable.tsx`, delete the `onHover` prop, its doc comment, the destructured parameter, and `onMouseEnter`. Leave `onClick` and the Enter and Space handler.

In `DetailView.tsx`, delete `onHover={highlight.onHoverEvent}` from `EventTable`. Do not otherwise edit that component's doc comment. It does not promise that pointer movement selects anything.

### Matrix

Delete the `onHover` prop and its doc comment. The `handlers` ref keeps `onSelect` only. Delete both `mouseenter` listeners: the one on each chapter hit target, and `summary.onHover` on the book cell. `BookSummaryHandlers` keeps `onSelect` only. Replace its doc comment and the field doc with:

```ts
/** Click for the book-summary cell. Chapter cells pass null. */
interface BookSummaryHandlers {
  /** Pins the whole book. */
  onSelect: () => void;
}
```

Replace the `MatrixView` component doc with:

```ts
/**
 * Draw the chapter matrix into a scrollable SVG.
 * A click pins a chapter or a book.
 */
```

In `MatrixView.test.tsx`, delete every `onHover={() => undefined}` prop, including the one in `renderMatrix`.

### Radial chart

Delete the `pinned` and `onHover` props. The `handlers` ref keeps `onSelect` only. On chapter paths and on the book-ring path, delete the `mouseenter` listener and leave the `click` listener. On a ribbon, keep the stroke-opacity change on `mouseenter` and `mouseleave`, and keep `click`. Delete the `pinned` check and the `onHover` call inside the ribbon `mouseenter`.

Replace the `RadialView` component doc with:

```ts
/**
 * Draw chapters as slices or as rings.
 * A click on a chapter, a book ring, or a ribbon selects it.
 * A ribbon brightens under the pointer, and the pointer alone selects nothing.
 */
```

In `RadialView.test.tsx`, delete the `pinned` and `onHover` props from both renders.

### Dialog

Delete the `hover` state and every `setHover` call. Delete `shown`. Delete `onHover`, `onHoverEvent`, and their comments. Delete the `hoverSelection` and `eventSelection` imports. Keep `pinRef`. Escape reads it.

Pass `pin` to `scopeHeading` and to `Inspector` as `selection`. Delete the `onHover` and `pinned` props passed to `MatrixView` and `RadialView`. From the Details `highlight` object, delete `onHover` and `onHoverEvent`. Leave `activeKey`, `onPick`, `activeEvent`, and `onPickEvent`.

In the Overview `onSelect` callback, delete only the `setHover(null)` line. Leave `pinChapter`, the focus update, and the key handler. In `applyPick` and in the Clear selection handler, delete only the `setHover` line.

In the component doc, replace the two sentences that begin `The donut follows` and `The heading above it follows` with:

```text
The donut, the heading above it, and the event list follow the pinned chapter, book, or event, and describe the whole comparison when nothing is pinned. Pointer movement alone changes none of them.
```

Leave the rest of that doc comment.

### Wording

In `Inspector.tsx`, rename `hoverHint` to `selectionPrompt` and update both call sites. The prompt text is the sentence in Locked decisions. Replace these docs.

The `selection` field:

```ts
/** Pinned cell, or null when nothing is selected. */
```

The component doc's first three sentences become:

```text
List the events for the pinned chapter, book, or single event.
The title, its actions, and the meta line sit above the donut. This panel is the
selection prompt when nothing is selected or the book is missing, and the event list when
a known book is selected.
```

Leave the sentences that follow those. The `selectionPrompt` doc becomes:

```text
Prompt shown when the panel has no chapter or book to list.
Used when nothing is pinned, and when the selection names a book
the index does not contain.
```

In `ScopeHeading.tsx`, change `hovered or pinned scope` to `pinned scope`, and `hovered or pinned cell` to `pinned cell`. Change nothing else in those comments.

In `ScopeActions.tsx`, the `onClear` doc becomes `Clears the pin, the keyboard focus, and the strip highlight.` In the component doc, change `for a hovered or pinned book` to `for the selected book`.

In `counts.ts`, the `comparisonTitle` doc's first line becomes `Title shown when nothing is pinned.`

### Tests

In `Inspector.test.tsx`, assert the new prompt text in both tests that quote the old sentence. Rename `shows the hover hint and no actions when nothing is selected` to `shows the selection prompt and no actions when nothing is selected`. Rename `shows the hover hint when the book is not in the index` to `shows the selection prompt when the book is not in the index`.

In `ScopeActions.test.tsx`, rename `offers only book detail for a hovered book` to `offers only book detail when nothing is pinned`. Do not change what that test renders or expects. The component still shows the book button whenever it is given a book code. The dialog stops passing a book unless one is pinned.

In `DetailView.test.tsx`, delete `reports a ribbon hover with the run key` and `reports a table-row hover with the event`. Delete `onHover` and `onHoverEvent` from `Harness` and from `renderDetail`, and delete the `{...hover}` spread. `renderDetail()` and `renderDetail(runs)` stay valid. Remove the `vi` import, and remove `import { runKey, type ScopedRun } from "./model/detail"`. Nothing left in the file uses them. `pick.runKey` is a property, not that import.

Add `DivergenceDialog.test.tsx` with one test, `keeps the column on the comparison until a chapter is clicked`. Mock the report hook. Vitest hoists `vi.mock`, so this replaces the hook before the dialog imports it:

```tsx
vi.mock("./useDivergenceReport", () => ({
  useDivergenceReport: () => ({
    status: null,
    report,
    error: null,
    retry: () => undefined,
  }),
}));
```

Copy the `report` fixture from `MatrixView.test.tsx`, including its `approximate` event, `catalog`, and `org`. Render:

```tsx
<DivergenceDialog
  fromTranslationId="from"
  toTranslationId="to"
  fromSchemeId={null}
  toSchemeId={null}
  onClose={() => undefined}
/>
```

The matrix draws in an effect, so wait until `.dv-matrix rect[fill="transparent"]` exists. That rect is Genesis chapter 1. Fire `mouseEnter` on it. The level-2 heading still matches `/^All Deviances/`, and the selection prompt is still present. Fire `click` on the same rect. The level-2 heading is then `Genesis 1`.

The rect selector finds the click target. The assertions are the heading and the prompt, which is what a person sees. Do not assert SVG geometry.

If the dialog cannot render in jsdom for a reason other than this selection behavior, stop and report that reason. Do not restructure the dialog so the test can render.

**Gate:** Web gate, then:

```bash
rg -n "onHover|hoverSelection|setHover|hoverHint|lastHoverRef|Hover or click|hovered" frvt/web/src/divergence
```

That search finds nothing. `HoverTip` and other hover tips do not match it. Leave those alone.

Then, in the browser, on Overview, Radial, and Details:

- Moving the pointer leaves the title on `All Deviances (...)`, leaves the selection prompt in the event list, and shows no Open button.
- A click updates the title, the donut, the event list, and Open.
- A second click on the same Details row still clears that selection.
- Arrow keys on Overview still move the pinned cell and the column.
- Escape and Clear selection restore the prompt.
- A radial ribbon still brightens under the pointer and dims when the pointer leaves.

If browser tools are unavailable, say so. Do not claim the visual check passed.

---

## Phase 3: Radial book codes fit the column

**Files:** [model/radial.ts](../frvt/web/src/divergence/model/radial.ts), [RadialView.tsx](../frvt/web/src/divergence/RadialView.tsx), [divergence.css](../frvt/web/src/styles/divergence.css).

**Work:** In `model/radial.ts`, add these constants above `bookLabelTransform`, and use `BOOK_LABEL_GAP_PX` in place of the literal `8` inside that function's `translate`.

```ts
/**
 * Space between the outer arc and the start of a book code.
 * The radial chart uses the same distance when it reserves room inside the SVG.
 */
export const BOOK_LABEL_GAP_PX = 8;

/**
 * Room past {@link BOOK_LABEL_GAP_PX} for one book code.
 * Book codes are three characters, drawn at the 11px size of `.dv-radial text`.
 */
export const BOOK_LABEL_ROOM_PX = 32;
```

In `RadialView.tsx`, import both constants. Replace `const radius = size / 2 - 34` with:

```ts
const radius = size / 2 - BOOK_LABEL_GAP_PX - BOOK_LABEL_ROOM_PX;
```

Add a comment on that line: the inset is the gap plus the label room, so a book code stays inside the SVG. Leave the `size` line and its comment as they are. Both layouts use this `radius`.

In `divergence.css`, after the `.dv-matrix text, .dv-radial text, .dv-ladder text` rule, add:

```css
/* Drawn at the measured column width. Scaling down keeps the book codes inside the column
   when the column narrows after the draw, for example when the dialog gains a scrollbar. */
.dv-radial svg {
  display: block;
  max-width: 100%;
  height: auto;
}
```

Do not add an `overflow` rule. Do not add a resize observer. Do not change `MatrixView` or `Ladder`.

**Tests:** None new. The existing `bookLabelTransform` test must still pass. It checks the flip, not the gap constant.

**Gate:** Web gate. Then, in the browser, open Radial on a comparison that fills the canon, so the dialog body scrolls vertically. In both Chapters as slices and Chapters as rings:

- Every book code is fully readable, including the codes along the right (Ezra through Ecclesiastes on a full canon).
- The chart column does not scroll horizontally.
- This expression prints `true`:

```js
document.querySelector(".dv-radial svg").getBoundingClientRect().right <=
  document.querySelector(".dv-stage").getBoundingClientRect().right
```

Narrow the browser window and switch layouts. The codes stay inside the column. If browser tools are unavailable, say so.

---

## Phase 4: Final gate

**Work:**

- From `frvt/web`, run `npm test` and `npm run build`.
- `npm run lint` may fail only on files this plan does not touch. `npx eslint src/divergence` reports 0 errors and no new warnings.
- Confirm the touched files are under 600 lines:

```bash
wc -l \
  frvt/web/src/divergence/DivergenceDialog.tsx \
  frvt/web/src/divergence/DivergenceDialog.test.tsx \
  frvt/web/src/divergence/DetailView.tsx \
  frvt/web/src/divergence/DetailView.test.tsx \
  frvt/web/src/divergence/MatrixView.tsx \
  frvt/web/src/divergence/MatrixView.test.tsx \
  frvt/web/src/divergence/RadialView.tsx \
  frvt/web/src/divergence/RadialView.test.tsx \
  frvt/web/src/divergence/Ladder.tsx \
  frvt/web/src/divergence/DotPlot.tsx \
  frvt/web/src/divergence/EventTable.tsx \
  frvt/web/src/divergence/Inspector.tsx \
  frvt/web/src/divergence/Inspector.test.tsx \
  frvt/web/src/divergence/ScopeHeading.tsx \
  frvt/web/src/divergence/ScopeActions.tsx \
  frvt/web/src/divergence/ScopeActions.test.tsx \
  frvt/web/src/divergence/counts.ts \
  frvt/web/src/divergence/model/selection.ts \
  frvt/web/src/divergence/model/selection.test.ts \
  frvt/web/src/divergence/model/radial.ts \
  frvt/web/src/styles/divergence.css
```

- Confirm no plan identifier leaked:

```bash
rg -n -i "phase|frvt-7" frvt/web/src/divergence frvt/web/src/styles/divergence.css
```

That search finds nothing new.

- Set this document's **Status** to `Implemented`.
- In the final report, list the owner visual checklist below. Mark each item as not yet checked by the owner. Also say which of them the implementing agent checked in a browser, and which it could not reach.

---

## Owner visual checklist

1. Overview is drawn with the accent border when the dialog opens. Radial or Details takes the border on click. The border stays while the pointer is over the selected button.
2. On Radial, Chapters as slices has the accent border, and Chapters as rings takes it on click.
3. Divergences and Dot plot look unchanged.
4. Moving the pointer over Overview, Radial, or Details leaves the title on `All Deviances (...)`, leaves the prompt `Click a chapter, book, or event. Arrow keys move through the matrix.`, and shows no Open button.
5. A click updates the title, the donut, the event list, and Open. A second click on the same Details row clears it. Arrow keys on Overview still move the column. Escape and Clear selection restore the prompt.
6. A radial ribbon brightens under the pointer.
7. On a full-canon Radial chart, with the dialog body scrolling vertically, every book code is fully readable in both layouts, and the chart column does not scroll horizontally.

---

## Out of scope

- Redrawing the radial chart when the window grows. The chart is measured once. Scaling down covers the clipping. A wider window leaves the chart at the size it first measured.
- The Divergences and Dot plot tabs losing their accent border while the pointer is over them. That is existing behavior. This plan does not change it.
- The width measurement in `MatrixView` and `Ladder`.
- Any file under `.spec/completed/`.
