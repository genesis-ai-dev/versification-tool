# Chart key: count dots and single-sided chapters

**Document:** `frvt-7-count-dot-legend-execution-plan-1`
**Status:** Implemented. The phases below are the record of that work. Do not apply them again.
**Audience:** The agent implementing these changes, and the owner reviewing them
**Scope:** The chart key in `frvt/web/src/divergence/ChartKey.tsx`, the count-dot thresholds in `frvt/web/src/divergence/model/index.ts`, their tests, and three maintainer notes under `doc/`. No backend change. No CSS change. No edit under `.spec/completed/`.

Never commit or push. The owner reviews all changes. Do not edit this plan.

---

## How to use this document

The phases are the order the work was done in. Each phase lists its files, its work, its tests, and the gate that passed. The "Locked decisions" section is the contract that was implemented. Do not invent a second version of it.

> **Rule 12.** Phase numbers and other identifiers in this plan must never appear in source code, comments, test names, CSS class names, runtime strings, or `doc/`. Name things for what they do.

**Web gate**, after Phases 1 and 2:

```bash
cd frvt/web && export PATH=$HOME/.local/node/bin:$PATH && npx vitest run src/divergence && npm run typecheck && npx eslint src/divergence
```

eslint must report 0 errors and no new warnings under `src/divergence`. Typecheck and eslint are how a missed prop or an unused import is caught. Fix those. Do not suppress them. If full `npm run lint` fails, it fails on files this plan does not touch. Leave those files alone.

## Rules for every phase

- Every new or changed function, component, interface, interface field, and module constant gets an orienting doc comment: why it exists, when to use it, and what it returns or throws. Where a snippet in this plan already has doc comments, copy them as written. Update any existing doc comment that the change makes wrong.
- Files stay under 600 lines. Functions take at most 6 named parameters. Keep the new swatch in `ChartKey.tsx`. Do not add a file.
- Tests cover the contract: the thresholds, the key text, the key order, and that the two dots differ in size and use the stated fills. Do not test CSS class names, `rx`, or coordinates for their own sake.
- This work changes no backend method, so the backend logging rule has nothing to apply to.
- Run `npx prettier --write` on each file under `frvt/web` that the phase edits. Do not run prettier on `doc/`.
- Do not add a `title` attribute anywhere inside the dialog.
- Do not edit anything under `.spec/completed/`.

---

## Findings that shape this plan

1. **The dot is a count, and both squares share it.** `countDotRadius` in [model/index.ts](../frvt/web/src/divergence/model/index.ts) returns `null` below 2 events, `1.5` for 2–4, and `2.3` for 5 or more. `drawCell` in [MatrixView.tsx](../frvt/web/src/divergence/MatrixView.tsx) calls it for the book square and for each chapter square. The number is `count` on the cell: `rest.length` in `cellState` and `bookState`, which leaves out `BOOK_ONE_SIDED`. A book square counts events in the book, once each. It is not the number of chapters that have a dot, and it is not the largest chapter count. Layer toggles already change `count`, because `cellEvents` and `bookEvents` honor `layersOn`. The key states the rule. It does not read the report.
2. **The neutral fill hides the dot.** `COUNT_DOT` is `#15181e` and `NEUTRAL` is `#272c35`. On a matrix cell the dot sits on the green-to-red deviance color, so it reads. A key square filled with `NEUTRAL` is about 1.1:1 against the dot, and the dot disappears. The key square uses `MUTED` (`#9aa1ad`), the existing muted grey. The matrix cells, `COUNT_DOT`, and `NEUTRAL` stay as they are. The Same swatch stays `NEUTRAL`.
3. **The hatch label is a rename only.** The string `Chapter on one side only` is rendered in `ChartKey` and asserted in `ChartKey.test.tsx`. The hatch is still drawn for a chapter that exists on one side and for a book that exists on one side (`oneSided` on `cellState` and `bookState`). Do not change when it is drawn. The new label is shorter on purpose. Do not widen it back to mention books.
4. **The donut is a different picture.** `Donut` and `DonutKey` show layer and type shares for the pin, or for the whole comparison. They do not draw count dots or the hatch. Leave them that way.
5. **The key is one list on every tab.** [DivergenceDialog.tsx](../frvt/web/src/divergence/DivergenceDialog.tsx) renders `ChartKey` under the toggles. `showRibbons` is true only when `tab === "radial"`. Count dots are drawn only on the matrix, and the key still names them on Radial and Details, in the same way it names Same and the hatch on every tab. Do not add a flag to hide the new item.
6. **Nothing else uses the old label.** `Present on one side only`, `Book on one side only`, and `Books on one side only` are different strings, in `taxonomy.ts` and `help.ts`. Leave them. Leave the dot-plot sentences about verses on one side only.

---

## Locked decisions

- **Where.** One new item in the chart key, on every tab, immediately after `Event severity 1 to 4` and immediately before the hatch item.
- **Words.** The visible item reads `Deviances:` then the smaller box, then `= 2–4,` then the larger box, then `= 5+`. The dash between 2 and 4 is an en dash, U+2013, not a hyphen. There is no space before `+`. These are fixed labels. Do not format them with `toLocaleString`. Do not add a clause for squares that have no dot.
- **Boxes.** Each box is the existing 14px key mark: a rounded square filled with `MUTED`, and a centered circle filled with `COUNT_DOT`. Scale the radius by `14 / MATRIX.cell` so the dot-to-box ratio matches a matrix cell. Take the radius from `countDotRadius`. Do not copy `1.5` or `2.3` into the key.
- **Hearing it.** The squares are `aria-hidden`. Two sibling spans, not children of the SVG, use the existing `.sr-only` class. Their text is ` small dot ` and ` large dot `, with the leading and trailing spaces, so the spoken phrase has word breaks: `Deviances: small dot = 2–4, large dot = 5+`. Do not set `aria-hidden` on those spans. Do not set `top` or `left` on them. Do not add `position: relative` on the list item.
- **Hatch label.** Replace `Chapter on one side only` with `Single-sided chapters`. The hatch graphic is unchanged.
- **Thresholds live once.** `COUNT_DOT_SMALL_FROM` is `2`. `COUNT_DOT_LARGE_FROM` is `5`. `countDotRadius` uses them and still returns `null`, `1.5`, and `2.3` for the same inputs it does today. The key builds `2–4` and `5+` from those constants.
- **Out of scope.** Do not edit `MatrixView.tsx`, `RadialView.tsx`, `Donut.tsx`, `DonutKey`, `breakdown.ts`, `colors.ts`, `divergence.css`, `taxonomy.ts`, or `help.ts`. Do not change a radius, a fill used by the matrix, or when a dot or hatch is drawn.

---

## Phase 1: Name the ranges

**Files:** [model/index.ts](../frvt/web/src/divergence/model/index.ts), [model/index.test.ts](../frvt/web/src/divergence/model/index.test.ts).

**Work:** Replace the `countDotRadius` comment and function with the block below. Insert the two constants directly above the function. Do not change any other function in the file.

```ts
/**
 * Fewest events that draw the smaller count dot on a matrix square.
 * Book squares and chapter squares share this threshold.
 * Counts below this draw no dot. The chart key starts its smaller range here.
 */
export const COUNT_DOT_SMALL_FROM = 2;

/**
 * Fewest events that draw the larger count dot on a matrix square.
 * There is no upper bound. The chart key prints this value followed by +.
 */
export const COUNT_DOT_LARGE_FROM = 5;

/**
 * Radius of the dot on a book square or a chapter square that has several events.
 * Counts from COUNT_DOT_SMALL_FROM up to but not including COUNT_DOT_LARGE_FROM
 * use the smaller dot. COUNT_DOT_LARGE_FROM and above use the larger one.
 * A count below COUNT_DOT_SMALL_FROM returns null, and the cell draws no dot.
 */
export function countDotRadius(count: number): number | null {
  if (count >= COUNT_DOT_LARGE_FROM) {
    return 2.3;
  }
  return count >= COUNT_DOT_SMALL_FROM ? 1.5 : null;
}
```

**Tests:** Add `COUNT_DOT_SMALL_FROM` and `COUNT_DOT_LARGE_FROM` to the existing import from `./index`. Do not add a second import from that module. In the existing `countDotRadius` test, add these expectations beside the ones already there. Keep `countDotRadius(1)`, `countDotRadius(2)`, and `countDotRadius(5)` as they are.

```ts
expect(COUNT_DOT_SMALL_FROM).toBe(2);
expect(COUNT_DOT_LARGE_FROM).toBe(5);
expect(countDotRadius(0)).toBeNull();
expect(countDotRadius(COUNT_DOT_LARGE_FROM - 1)).toBe(1.5);
```

`0` and `1` both draw nothing. `4` (`COUNT_DOT_LARGE_FROM - 1`) stays on the smaller dot. Do not add cases for negative numbers or `NaN`.

**Gate:** Web gate. The matrix tests must still pass. There is no visual change, so do not open the browser in this phase.

---

## Phase 2: Key item, label, and notes

**Files:** [ChartKey.tsx](../frvt/web/src/divergence/ChartKey.tsx), [ChartKey.test.tsx](../frvt/web/src/divergence/ChartKey.test.tsx), [doc/ux-spec.md](../doc/ux-spec.md), [doc/ui-style-guide.md](../doc/ui-style-guide.md), [doc/divergence-dialog.md](../doc/divergence-dialog.md).

**Work in `ChartKey.tsx`:**

1. Extend the value import from `./model/index` so it includes `COUNT_DOT_LARGE_FROM`, `COUNT_DOT_SMALL_FROM`, `MATRIX`, `countDotRadius`, and the `ComparisonIndex` type. Add `COUNT_DOT` and `MUTED` to the import from `./model/colors`.
2. Replace the `ChartKey` doc comment with:

```ts
/**
 * Key for the marks drawn on the matrix, the radial chart, and the strip.
 * It sits under the layer toggles on every tab. Count dots are named here
 * even on tabs that do not draw them. Move items appear only while the
 * radial chart is showing, because that is where the arrows are drawn.
 */
```

3. Add the helper and the swatch below `ChartKey`, above `Square`. Copy the comments.

```ts
/**
 * Side of a chart-key mark, in px.
 * CountDotSwatch uses it for the square and to scale the dot.
 * It matches `.dv-key-mark` in divergence.css. The matrix cell stays MATRIX.cell.
 */
const KEY_MARK = 14;

/**
 * Radius for a count the chart key is defined to draw.
 * Throws when countDotRadius returns null, which means the key ranges
 * no longer match the thresholds.
 */
function countDotRadiusForKey(count: number): number {
  const radius = countDotRadius(count);
  if (radius === null) {
    throw new Error(`No count dot for ${count} events`);
  }
  return radius;
}

/**
 * Grey chapter square with one count dot, for the chart key.
 * The matrix draws this dot on a colored cell. The key uses the muted grey
 * so the page-colored dot stays visible. Pass a radius from countDotRadiusForKey.
 */
function CountDotSwatch({
  radius,
}: {
  /** Dot radius in matrix pixels, before this swatch scales it up to KEY_MARK. */
  radius: number;
}) {
  const scale = KEY_MARK / MATRIX.cell;
  const center = KEY_MARK / 2;
  return (
    <svg className="dv-key-mark" aria-hidden="true">
      <rect width={KEY_MARK} height={KEY_MARK} rx="2" fill={MUTED} />
      <circle cx={center} cy={center} r={radius * scale} fill={COUNT_DOT} />
    </svg>
  );
}
```

4. Inside `ChartKey`, before the `return`, bind the two radii:

```ts
const smallDot = countDotRadiusForKey(COUNT_DOT_SMALL_FROM);
const largeDot = countDotRadiusForKey(COUNT_DOT_LARGE_FROM);
```

5. Insert this list item after the severity item and before the hatch item. Change the hatch item's text node from `Chapter on one side only` to `Single-sided chapters`. Leave `HatchSwatch` as it is. The `=` strings are template literals so a formatter cannot insert a space before `=`. The en dash is the character between the two expressions in the first template.

```tsx
<li>
  <span>Deviances:</span>
  <CountDotSwatch radius={smallDot} />
  <span className="sr-only"> small dot </span>
  <span>{`= ${COUNT_DOT_SMALL_FROM}–${COUNT_DOT_LARGE_FROM - 1},`}</span>
  <CountDotSwatch radius={largeDot} />
  <span className="sr-only"> large dot </span>
  <span>{`= ${COUNT_DOT_LARGE_FROM}+`}</span>
</li>
```

`.dv-chart-key li` is already `inline-flex` with a gap, and the list already wraps between items. Do not add a CSS rule. Do not set `flex-wrap` on the item. The two boxes must stay in the same item as their ranges.

**Tests in `ChartKey.test.tsx`:** Add `COUNT_DOT_LARGE_FROM`, `COUNT_DOT_SMALL_FROM`, `MATRIX`, and `countDotRadius` to the existing import from `./model/index`. Add an import of `COUNT_DOT` and `MUTED` from `./model/colors`. If eslint reports import order, follow it. Do not disable the rule, and do not add a second import from the same module.

In `ITEMS`, replace `Chapter on one side only` with `Single-sided chapters`. Rename the test so it no longer says there are six marks. The loop stays.

Add this test. It locks the words, the order, and the two dot sizes. `getByText` with a string matches one element's whole text: `Deviances:` is its span, and each range is its template result. The `small dot` and `large dot` spans are visually hidden, so assert them through the list item's text. Do not switch those two to `getByText` unless the query is called with `{ hidden: true }`. Do not remove the spans to make a query pass.

```tsx
it("explains the two count dots between severity and single-sided chapters", () => {
  render(<ChartKey index={index} showRibbons={false} />);
  const labels = screen.getAllByRole("listitem").map((item) => item.textContent ?? "");
  const severity = labels.findIndex((label) => label.includes("Event severity 1 to 4"));
  const deviances = labels.findIndex((label) => label.includes("Deviances:"));
  const single = labels.findIndex((label) => label.includes("Single-sided chapters"));
  expect(deviances).toBe(severity + 1);
  expect(single).toBe(deviances + 1);
  expect(labels[deviances]).toContain("small dot");
  expect(labels[deviances]).toContain("large dot");
  expect(screen.getByText("Deviances:")).toBeInTheDocument();
  expect(
    screen.getByText(`= ${COUNT_DOT_SMALL_FROM}–${COUNT_DOT_LARGE_FROM - 1},`),
  ).toBeInTheDocument();
  expect(screen.getByText(`= ${COUNT_DOT_LARGE_FROM}+`)).toBeInTheDocument();
  expect(screen.queryByText("Chapter on one side only")).not.toBeInTheDocument();

  const item = screen.getAllByRole("listitem")[deviances];
  const circles = [...item.querySelectorAll("circle")];
  expect(circles).toHaveLength(2);
  const scale = 14 / MATRIX.cell;
  expect(Number(circles[0].getAttribute("r"))).toBeCloseTo(
    (countDotRadius(COUNT_DOT_SMALL_FROM) ?? 0) * scale,
  );
  expect(Number(circles[1].getAttribute("r"))).toBeCloseTo(
    (countDotRadius(COUNT_DOT_LARGE_FROM) ?? 0) * scale,
  );
  expect(circles.every((circle) => circle.getAttribute("fill") === COUNT_DOT)).toBe(true);
  const squares = [...item.querySelectorAll("rect")];
  expect(squares).toHaveLength(2);
  expect(squares.every((square) => square.getAttribute("fill") === MUTED)).toBe(true);
});
```

In the existing ribbon test, after the three ribbon expects, add:

```tsx
expect(screen.getByText("Deviances:")).toBeInTheDocument();
expect(screen.getByText("Single-sided chapters")).toBeInTheDocument();
```

Do not assert CSS. Do not test the thrown error from `countDotRadiusForKey`.

**Notes.** Edit only the sentences named here. Do not rewrite the surrounding paragraphs.

In [doc/ux-spec.md](../doc/ux-spec.md), under Layout, replace the chart-key bullet with:

```markdown
- A chart key under the toggles explains every mark. After event severity it shows two grey chapter squares: a smaller dot for 2–4 deviances in that book or chapter square, and a larger dot for 5 or more. A square with fewer than 2 draws no dot. The hatch item is labeled "Single-sided chapters". Move ribbons appear in the key only on the Radial tab. The donut does not draw the count dots or the hatch.
```

The dash in `2–4` is an en dash.

In [doc/ui-style-guide.md](../doc/ui-style-guide.md), in the divergence-dialog mark list, insert this bullet after the Event severity bullet:

```markdown
- **Count dot** is a page-colored dot centered on a matrix chapter or book square. Two to four deviances in that square use the smaller dot. Five or more use the larger. The chart key draws both on a muted grey square, because the page-colored dot disappears on the neutral cell fill. The matrix still draws the dot on the deviance color.
```

Replace the One-sided chapter bullet with:

```markdown
- **Single-sided chapters** is the chart-key name for a diagonal hatch over the neutral fill. The hatch marks a chapter, or a whole book, that exists on one side only.
```

In [doc/divergence-dialog.md](../doc/divergence-dialog.md), in the Overview section, insert this sentence after "Cell color follows that deviance.":

```markdown
A count dot is drawn from `countDotRadius` when that square's `count` is at least 2. `count` is `rest.length`, so a `BOOK_ONE_SIDED` event does not add a dot. Two to four use the smaller radius. Five or more use the larger. The book square (`bookState`) and each chapter square (`cellState`) use that same function. The book count is the book's events, each event once.
```

Replace the `ChartKey` sentence in "From wire rows to marks" with:

```markdown
`ChartKey` explains the marks every view uses: Same, deviance, severity, the two count-dot sizes, single-sided chapters (the hatch), approximate, data warning, and, on the radial tab, the ribbons. It sits under the layer toggles. `DonutKey` is the collapsed key for the donut colors currently drawn. `summarySentence` is the comparison sentence in the info control beside the title. Neither one changes the pin.
```

**Gate:** Web gate, then prettier on the two files under `frvt/web`. Do not open the browser until Phase 3. If a file named in this phase does not contain the sentence this phase tells you to replace, stop and report that. Do not invent a second description.

---

## Phase 3: Browser check

**Files:** None, unless the check shows a defect in the Phase 2 code.

**Work:** Open the viewer the way [README.md](../README.md) describes, and open a comparison whose matrix already shows a dot on a book square and a dot on a chapter square. If the server is not running, or no loaded comparison has those dots, say so and stop. Do not add fixture data. Do not claim the check passed.

On Overview, Radial, and Details:

- The key order is severity, then `Deviances:` with a smaller dot and `= 2–4,` then a larger dot and `= 5+`, then `Single-sided chapters`.
- Both dots are visible on the grey squares, and the second dot is larger. The squares are lighter than the Same square.
- The two boxes stay with their ranges when the key wraps. They do not split onto separate lines from `Deviances:` or from each other.
- The visually hidden words do not add a scrollbar. If they do, stop and report it. Do not remove the spans.
- The donut, for a pinned book and with nothing pinned, still has no count dot and no hatch.
- Turning a layer toggle off does not remove the new key item, and does not change its words.

If a dot is invisible, or the two sizes cannot be told apart, stop and report it. Do not change `MUTED`, `COUNT_DOT`, `NEUTRAL`, the radii, or `KEY_MARK` to compensate.

**Gate:** The notes above. No web gate unless this phase edits a file, in which case run the web gate again.
