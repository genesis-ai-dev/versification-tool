# Selection subtitle, range alignment, and strip clip: phased execution plan

**Document:** `frvt-7-scope-tip-and-strip-clip-execution-plan-1`
**Status:** Implemented
**Audience:** The agent implementing these changes, and the owner reviewing them
**Scope:** The selection-panel subtitle, the Details strip range label, and the strip clip, in `frvt/web/src/divergence/`.

Never commit or push. The owner reviews all changes.

---

## How to use this document

Do the phases in order. Each phase lists its work, its tests, and a gate. Do not start a phase until the previous gate passes. The "Locked decisions" section is the contract. Do not invent alternatives.

> **Rule 12.** Phase numbers and other identifiers in this plan must never appear in source code, comments, test names, CSS class names, or runtime strings. Name things for what they do.

`npm run lint` already reports one error outside this work, in `src/viewer/columnScroll.ts` (`@typescript-eslint/no-empty-object-type`). Leave that file alone. Each phase gate below is the lint check for this work.

Code standards for every phase:

- Every new or changed function, component, interface field, and module constant gets an orienting doc comment: why it exists, when to use it, and what it returns. Match the comment style in `model/detail.ts`.
- Keep each source file under 600 lines. `Ladder.tsx` is about 460 lines.
- Keep functions to 6 or fewer named parameters.
- Test happy paths and essential failures only. Do not test CSS with computed styles; jsdom will not prove pixel alignment. Do not test boilerplate.
- This work changes only the web client. There are no backend methods, so the backend logging rule has nothing to apply to.

---

## Locked decisions

- **Subtitle tip.** In `ScopeHeading.tsx`, every non-blank subtitle moves out of the `.dv-scope-meta` paragraph and into the existing click-to-open `InfoTip` with `InfoIcon`, placed immediately to the right of the `h2`. That covers the chapter line (`Chapter 3: … verses`), the whole-book line (`Whole book: … chapters`), and the selected-event verse reference. The component does not branch on which kind of subtitle it is. The comparison title has `subtitle: null` and gets no icon. Treat `null`, omitted, and a whitespace-only string the same. The tip text is the subtitle string unchanged. Accessible name: `${title} details`. Do not use a native `title` or the hover tip. Update the `ScopeHeading` and `subtitle` comments so they say the text opens from the icon, not that it is a line under the title. Delete `.dv-scope-meta`; nothing else uses it. Do not keep its bottom margin, or a blank gap remains above the donut. The header is a row (`display: flex; align-items: center; gap: 0.35rem`) and must not set `overflow: hidden`, `transform`, `filter`, or `contain`, or the tip is clipped. Give the header `position: relative` and `z-index: 1` so the tip paints above the donut. Do not let the `h2` grow, or the icon jumps to the far edge. Give the `h2` `min-width: 0` so a long title wraps and the icon stays visible. `.is-centered` uses `justify-content: center`. Flex would otherwise leave that title at the left, because `text-align` does not center a flex item. The tip trigger stays `flex-shrink: 0`. Set that trigger to `position: static` and the tip body to `left: 0; width: 100%`, so the explanation is positioned against the header and stays inside the column. `scopeHeading()` itself does not change. The icon uses the shared faint color. Do not copy the darker modal-header icon color.
- **Range alignment.** The middle-axis label is drawn at `x = 6` in `Ladder.tsx`. Name that inset once (`AXIS_LABEL_X = 6`) and use it for the text `x`. Do not export the constant. The range label and the svg share the left edge of `.dv-ladder`: the head and the stage have no left padding. Give `.dv-ladder-place` that same inset as left padding, so the range text, not the info icon, lines up with the left edge of `org`. Set an inline custom property on `.dv-ladder` from the constant (`--dv-axis-label-x`) and read it in `divergence.css`. Do not hardcode a second `6` in CSS. Do not put the padding on `.dv-ladder-head`; that would also shift the translation name on the right. The info icon stays at the end of the range text.
- **Clip.** Match the prototype clip in `versification-divergence-views.html`: one `clipPath` rect from `x = LADDER_LEFT` (`36`) with width `width - LADDER_LEFT - LADDER_RIGHT`, and height `LADDER_HEIGHT`. Ribbons, one-sided blocks, axis lines, and tick marks go in that clipped group. The `org` label stays a direct child of the root svg, outside the clip, so the gutter text is not cut off. The draw effect already clears the host on every update, so create the `clipPath` inside that effect after the clear. Build its id from `useId()` with every `:` removed. A raw `useId` value contains colons, and `clip-path: url(#…)` does not resolve those. Keep the selected-ribbon raise as a raise within the clipped parent. Do not reparent a selected ribbon onto the root svg, or the clip no longer applies to it. Do not clip by CSS `overflow` on the stage; that would not stop a ribbon that stays inside the svg but crosses an axis end.

---

## Files

| File | Role |
| --- | --- |
| `frvt/web/src/divergence/ScopeHeading.tsx` | Title row. The subtitle becomes the tip. `scopeHeading()` stays. |
| `frvt/web/src/divergence/ScopeHeading.test.tsx` | Model assertions stay. Add the tip click and the blank-subtitle case. |
| `frvt/web/src/styles/divergence.css` | Header row and the range-label inset. |
| `frvt/web/src/styles/divergence-events.css` | Delete `.dv-scope-meta`. |
| `frvt/web/src/divergence/Ladder.tsx` | Shared inset, clip group, org label outside the clip. |
| `frvt/web/src/divergence/DetailView.test.tsx` | Assert the inset and the clip after the strip draws. |

`InfoTip` and `InfoIcon` already exist. Do not change them.

---

## Phase 1 — Subtitle tip

**Work.** `ScopeHeading.tsx` and the header CSS only.

**Tests.** With a subtitle, the sentence is absent until the info button is clicked, then the tooltip shows it, and the button is inside the header. With `subtitle` omitted, there is no info button. A whitespace-only subtitle also draws no button. Existing `scopeHeading()` assertions stay as they are. One component test covers every subtitle kind, because the component does not branch.

**Gate.** From `frvt/web`:

```bash
npx vitest run src/divergence/ScopeHeading.test.tsx && npm run typecheck && npx eslint src/divergence/ScopeHeading.tsx src/divergence/ScopeHeading.test.tsx
```

---

## Phase 2 — Range alignment

**Work.** The shared inset constant, the inline custom property, and `padding-left: var(--dv-axis-label-x)` on `.dv-ladder-place` only.

**Tests.** jsdom will not prove pixel alignment. In a DetailView test that waits for the strip, assert the `org` text `x` attribute is `"6"` and `.dv-ladder`'s inline `--dv-axis-label-x` is `6px`. Those two are the same inset.

**Gate.** From `frvt/web`:

```bash
npx vitest run src/divergence/DetailView.test.tsx && npm run typecheck && npx eslint src/divergence/Ladder.tsx src/divergence/DetailView.test.tsx
```

---

## Phase 3 — Strip clip

**Work.** Add the clip group in `Ladder.tsx`.

**Tests.** After the strip draws, read the svg `width` attribute. jsdom reports no client width, so the drawing uses `320`. Expect one `clipPath` whose rect `x` is `"36"` and whose width is that svg width minus `50` (`36 + 14`). Expect every ribbon `path` and one-sided `rect` to sit inside the clipped group, and the `org` text to be a direct child of the svg. The clip id must contain no colon. A run with side B missing supplies the one-sided rect. A run row is `[a, o, b, type, flags, excludedA, excludedB]`.

**Gate.** The same command as phase 2.
