# Divergence dialog

The dialog draws one cached comparison. The payload and the type catalog are described in [divergence-engine.md](divergence-engine.md). [Bands](domain-model.md#band-and-run), runs, and [ribbons](domain-model.md#ribbon) are defined in the domain model.

`DivergenceDialog` in `frvt/web/src/divergence/DivergenceDialog.tsx` is opened from the viewer header. It receives the two translation ids and the two scheme ids. A null scheme id means the preferred association.

## State

The dialog owns the comparison and the selection:

- `useDivergenceReport` loads the report. The HTTP polling is specified in [api.md](api.md).
- `pin` is a `MatrixSelection` from `frvt/web/src/divergence/model/selection.ts`: a book, an optional chapter, a whole-book summary flag, and an optional verse label or event index.
- `runKey` is the selected [run](domain-model.md#band-and-run).
- `layersOn` is the four layer toggles from `LAYER_IDS`. They start on.
- `tab` is `overview`, `radial`, or `detail`.
- `layout` is `slices` or `rings` for the radial chart.
- `detailBook` is the book open on the detail tab.

The donut, the heading above it, and the event list follow `pin`. With no pin they describe the whole comparison. `breakdown` in `frvt/web/src/divergence/breakdown.ts` takes that scope. Layer toggles stay on the whole comparison and add the pin's share while a cell is pinned.

Book-detail zoom, the dot-plot magnifier, and the side tab inside `DetailView` stay local to that view.

## Selection

A click selects. Pointer movement does not change the heading, the donut, the event list, or the book-detail button. The file comment on `DivergenceDialog` states that rule.

What a click can pin:

- A chapter or a book in `MatrixView`.
- A chapter, a book ring, or a ribbon in `RadialView`.
- A ribbon, a one-sided block, a dot-plot mark, or a table row in `DetailView`.

Arrow keys on the matrix still move the pin (`moveFocus` in `frvt/web/src/divergence/model/index.ts`). Enter or Space on a table row selects. Escape and Clear selection clear the pin.

## Overview

The Overview tab is the matrix and the Radial tab is the radial chart. The donut, the inspector, and the scope actions sit in the selection column beside every tab.

`MatrixView` is the whole-Bible heatmap: books by chapters. `cellState` in `frvt/web/src/divergence/model/index.ts` scores a chapter from the events that survive the layer toggles. `BOOK_ONE_SIDED` is held aside. The remaining events contribute a severity (the max) and an extent (their `n` values over the chapter length, capped at 1). Deviance is `0` when severity is `0`. Otherwise it is `min(1, 0.3 * (severity / 4) + 0.7 * extent)`. Cell color follows that deviance. A count dot is drawn from `countDotRadius` when that square's `count` is at least 2. `count` is `rest.length`, so a `BOOK_ONE_SIDED` event does not add a dot. Two to four use the smaller radius. Five or more use the larger. The book square (`bookState`) and each chapter square (`cellState`) use that same function. The book count is the book's events, each event once. A book that exists on only one side is hatched rather than colored as an ordinary chapter. `RadialView` draws the same chapters as slices or as rings, and draws move events as ribbons. The donut (`Donut`, `DonutKey`) shows layer and type shares for the pin, or for the whole comparison when nothing is pinned. A pinned chapter or book with no events in the visible layers omits the donut and the slice names. `Inspector` lists the events in the pin. With nothing pinned, or when the book is missing, it renders nothing. A pinned chapter or book with no events in the visible layers says there are no deviances in that chapter or book. `ScopeHeading` and `ScopeActions` title the pin and open that book in the detail tab.

## Book detail

`DetailView` is one book. The [ladder](domain-model.md#ladder) draws axes for side A, org, and side B. Ribbons are the bands. One-sided stretches are blocks. Chapter ticks mark chapter starts (`tickMarks` in `frvt/web/src/divergence/model/ladderTicks.ts`).

The dot plot (`DotPlot`, geometry in `frvt/web/src/divergence/model/dotPlot.ts`) draws side A against side B. A stroke is a `DotSegment`. Its `key` matches the ladder ribbon and the table row. That geometry is the second meaning of "segment" in [domain-model.md](domain-model.md#same-word-different-meaning).

`EventTable` lists the book's events. Click, Enter, or Space sets the active event.

## From wire rows to marks

`buildIndex` in `frvt/web/src/divergence/model/index.ts` decodes event rows. The integer in the row is an index into `types`, which is `TYPE_IDS` order. The index then knows each event's id, severity, and layer, and which events sit in each chapter.

`scopeRuns` in `frvt/web/src/divergence/model/detail.ts` decodes run rows for one book. A hidden layer is rewritten to `SAME`, so the [band](domain-model.md#band-and-run) stays on the ladder and loses its type color. `runSelectable` treats `SAME` as visible and not selectable.

`useDivergenceReport` posts the comparison, polls status, and fetches the payload when the row is `ready`. A stalled `running` report is posted again. The stall window is the server's `DIVERGENCE_STALE_SECONDS`, described in [architecture.md](architecture.md#sessions-config-logging-errors-auth). The dialog does not compute the report in the browser.

The hook returns `status`, `report`, `error`, and `retry`. It does nothing until `active` is true and both translation ids are set. The first call is `createDivergenceReport`. While status is neither `ready` nor `failed`, it waits, starting at 500ms and doubling up to 5s. A status whose `stalled` flag is set posts the comparison again. Otherwise it calls `getDivergenceStatus`. `failed` stops the loop and shows `status.error`, or "Comparison failed." when that field is empty. A `ready` status then calls `getDivergenceData`. One HTTP 409 from that call posts the comparison again and resumes polling. A second 409, or any other error, stops and shows the error message. Closing the dialog aborts the controller, and an abort does not surface as an error. `retry` bumps an attempt counter and runs the effect again. When `active` is false the hook returns an empty state.

`breakdown` counts events, not verses. The outer donut ring is type. The inner ring is layer. A layer that is toggled off is omitted from the drawn rings. The toggle's own percentage still includes that layer, so the control does not show zero for a layer the user just hid. `LAYER_HELP` in `frvt/web/src/divergence/help.ts` is the tip text for the four toggles. `taxonomy.ts` must list `TYPE_IDS` in the same order as `frvt/divergence/taxonomy.py`, because `buildIndex` uses the integer as a subscript into `types`.

`defaultBook` picks the first book that has events in the active layers, or the first book with slots. `initialLadderView` opens a book of at most `LONG_BOOK_VERSES` (1200) on the whole axis (`zoom` 1, `origin` 0). A longer book opens on a window of `OPENING_WINDOW_VERSES` (300) that starts `OPENING_LEAD_VERSES` (20) before the first non-`SAME` run with an A span. The zoom is `clampZoom(length / 300)`, and the window is widened when that zoom would pass `MAX_LADDER_ZOOM` (100). `ladderWindow` is the visible slice: zoom 1 shows the whole axis, and the highest zoom shows one hundredth of it. The origin is clamped inside the axis.

`LadderView` keeps `zoom` and `origin` together so they paint as one update. `origin` is the first visible verse on axis A and is ignored at zoom 1. `panOrigin` moves that origin with a pointer drag: movement to the right shows earlier verses. `zoomAround` keeps the verse under a fraction of the plot width under that point. The slider uses fraction 0.5. `wheelZoomFactor` follows a power-of-two curve. A negative `deltaY` zooms in. `deltaMode` 1 (lines) uses 0.05 per unit, mode 0 (pixels) uses 0.002, and mode 2 (pages) uses 1. `ctrlKey` multiplies by 10, which is how a trackpad pinch is recognized. A zero `deltaY` returns 1. `alignedOrigin` scales another axis to the same fraction of its length, so a drag moves equal-length axes by the same screen distance.

`visibleChapters` names the chapters that contain the window. A chapter owns the verses from its tick up to the next tick. No ticks, or a window that starts before the first tick, returns null. `scopeRuns` prefers runs whose A span is in the book, and falls back to the B span when A has none. One-sided runs that touch the book stay in the list so the block is drawn.

`SeverityKey` is the deviance-severity scale above the event list, left-aligned with each event's swatch, when that list has at least one event. Its squares match those swatches, and the list's divider is drawn above and below it. The donut and that scale stay in place while the event list scrolls. It is omitted when nothing is pinned, when the book is missing, and when the list says there are no deviances. `ChartKey` names the other marks at the top of the Overview and Radial charts: Same, deviance, the two count-dot sizes, single-sided chapters (the hatch), approximate, data warning, and, on the radial tab, the ribbons. That line stays put while the chart scrolls. Details does not render `ChartKey`. `DonutKey` lists the donut colors in a column to the right of the chart, and the pie is centered on that list. Each color block lines up with the top of its name. Each info control stays beside its slice name when that name wraps. The no-deviances sentence is centered under the scope heading. `summarySentence` is the comparison sentence in the info control beside the title. None of these change the pin.

Radial `layout` `slices` draws chapters as slices. `rings` draws them as rings. Both layouts call the same `onSelect` the matrix uses, so a radial click pins a chapter, a book, or an event and the column updates. Ribbon hover brightens that ribbon's stroke. It does not change `pin`. The dot plot switches the cursor over a mark and does not change `pin` until the click.

## From a click to a pin

`MatrixSelection` in `frvt/web/src/divergence/model/selection.ts` is `bookCode`, `chapter` (null for a whole book), `summary`, an optional `verseLabel`, and an optional `eventIndex`. `coversWholeBook` is true when `summary` is set or `chapter` is null. The donut scope, the heading, and the event list share that rule. `verseLabel` is a heading such as a verse span. The donut and the event list ignore it.

`pinChapter` stores the selection and clears `runKey`. A matrix or radial click therefore does not leave a ribbon highlighted from the previous book. `focus` is the matrix keyboard index. Arrow keys call `moveFocus` and then the same pin path. Pointer movement updates neither `pin` nor `focus`.

`eventSelection` builds a pin from an event. The span whose book matches the open book wins, then side A, then side B. No span returns null. `runSelection` uses `runPlace` and attaches `eventIndex` when `eventForRun` finds an event in the active layers. `pickRun` toggles: the same key again clears the highlight, and clears the pin when the run has a place. A null key, an unknown key, or a run that `runSelectable` rejects returns null, and the caller leaves the highlight alone. `pickEvent` toggles a table row the same way. A row with no matching run still pins the event and sets `runKey` to null. `pinnedEvent` returns the event only when its layer is in `layersOn`. Otherwise the column falls back to the chapter.

`layersOn` is a record of the four `LAYER_IDS` (`scheme`, `segment`, `text`, `canon`), all true at open. The views receive a `Set` of the ids that are not false. `breakdown` still receives the record, because a missing key counts as on.

`defaultBook` runs when `detailBook` is null. Opening the detail tab without a prior book uses that choice. Choosing a book from the heading stores `detailBook`, so a later layer toggle does not jump back to the first book with events.

## Ladder controls

| Symbol | Contract |
| --- | --- |
| `MAX_LADDER_ZOOM` | 100. Zoom 1 shows the whole axis |
| `LONG_BOOK_VERSES` | 1200. At most this length opens on zoom 1 |
| `OPENING_WINDOW_VERSES` | 300. Opening width of a longer book |
| `OPENING_LEAD_VERSES` | 20. Verses shown before the first side-A divergence |
| `clampZoom` | Keep a factor between 1 and 100 |
| `ladderWindow` | Visible `[start, end)` at a zoom and origin |
| `initialLadderView` | The view a book opens on |
| `panOrigin` | Drag to the right shows earlier verses |
| `zoomAround` | Keep the verse under a plot fraction under that point |
| `wheelZoomFactor` | Power-of-two wheel multiplier. Pinch is `ctrlKey` |
| `alignedOrigin` | Same fraction of length on another axis |
| `visibleChapters` | Chapters that contain the window, or null |
| `runKey` | Identity shared by the ladder, the dot plot, and the table |
| `runSelectable` | `SAME` is visible and not selectable |
| `verseTitle` | Heading for a span, used as `verseLabel` |

## Symbols

| Symbol | Contract |
| --- | --- |
| `DivergenceDialog` | Owns pin, run, layers, tab, and layout |
| `useDivergenceReport` | Post, poll, and load. One 409 on the data route posts again |
| `buildIndex` | Event rows to books, chapters, and `IndexedEvent` |
| `cellState` | Severity and extent for one chapter, after the layer filter |
| `moveFocus` | Arrow keys across matrix targets |
| `breakdown` | Event counts for the donut and the layer toggles |
| `MatrixView` | Books by chapters. Click and arrows pin. Pointer movement does not |
| `RadialView` | Slices or rings, and ribbons for `CHAPTER_MOVE`, `CROSS_BOOK`, `ORDER_INVERSION` |
| `DetailView` | One book: ladder, dot plot, and event table |
| `scopeRuns` | Run rows for one book. A hidden layer is drawn as `SAME` |
| `initialLadderView` | Whole axis at 1200 verses or fewer. Otherwise a 300-verse window |
| `ladderWindow` | The zoomed slice of that axis |
| `pickRun` | Ribbon or dot click. The same key again clears it |
| `pickEvent` | Table row. The same event again clears the pin |
| `pinnedEvent` | The named event when its layer is on. Otherwise the column shows the chapter |
| `divergenceLauncherEnabled` | Both columns can resolve, and each pinned scheme id is still associated |
| `Donut` | Layer ring and type ring for the pin, or the whole comparison |
| `Inspector` | Events in the pin, or a prompt when the pin is empty |
| `ScopeHeading` | Title of the pin |
| `ScopeActions` | Open the book, or clear the pin |
| `EventTable` | The book's events. Click, Enter, or Space selects |
| `DotPlot` | Side A against side B. A stroke key matches the ribbon |
| `SeverityKey` | Deviance severity, left-aligned with the event swatches when that list has events. The squares match those swatches, and the list's divider is drawn above and below the scale. The scale stays put while the event list scrolls. It does not change the pin |
| `ChartKey` | Marks at the top of Overview and Radial. Ribbon items only on the radial tab. Details does not render it. It does not change the pin |
| `summarySentence` | The sentence in the info control beside the title |
| `LAYER_IDS` | `scheme`, `segment`, `text`, `canon` |
| `LAYER_HELP` | Tip text for the four toggles |
| `SideTabs` | Vertical tabs. Only the selected panel is mounted |
| `HoverTip` | Delayed tip for a truncated side name. `useHoverTip` also serves the donut slices. Movement does not change the pin |
| `formatCount` | Locale-aware event count in the title |
| `comparisonTitle` | Title when nothing is pinned. Zero reads `All Deviances (None)` |
| `targetsFor` | Matrix cells the arrow keys walk |
| `bookEvents` | Events in one book that survive the layer filter |
| `eventSwatch` | Color for one event in the table |
| `severityColor` | Color for a severity from 1 to 5 |
| `InfoTip` | The control beside the title |
| `keepOnScreen` | Clamp a tip rectangle inside the viewport |
| `placeTip` | Position a tip against an anchor rectangle |
| `layerToggleLabel` | The toggle's count and percent |

`RIBBON_TYPES` in `frvt/web/src/divergence/model/radial.ts` is `CHAPTER_MOVE`, `CROSS_BOOK`, and `ORDER_INVERSION`. Other event types are not drawn as radial ribbons. `TYPE_IDS` in `frvt/web/src/divergence/taxonomy.ts` is the client copy of the server tuple. `Span` in `frvt/web/src/divergence/types.ts` is `[book, chapterStart, verseStart, chapterEnd, verseEnd]`. That is the divergence span from `frvt/divergence/refs.py`, not a `verse_span` row. The two meanings are the table in [domain-model.md](domain-model.md#same-word-different-meaning).

## See also

The dialog's place in the viewer is in [web-ui.md](web-ui.md). The user-facing rules for the dialog are in [ux-spec.md](ux-spec.md#divergence-comparison), and its colors and marks are in [ui-style-guide.md](ui-style-guide.md#divergence-dialog).
