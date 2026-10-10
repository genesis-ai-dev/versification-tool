import { scaleLinear } from "d3-scale";
import { select, type Selection } from "d3-selection";
import {
  useEffect,
  useId,
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ACCENT, NEUTRAL, severityColor } from "./model/colors";
import {
  alignedOrigin,
  axisFor,
  clampZoom,
  ladderWindow,
  panOrigin,
  runKey,
  runSelectable,
  severityOf,
  visibleChapters,
  wheelZoomFactor,
  zoomAround,
  type LadderAxis,
  type LadderView,
  type ScopedRun,
} from "./model/detail";
import type { RunHighlight } from "./model/selection";
import type { ComparisonIndex } from "./model/index";
import { InfoIcon } from "./InfoIcon";
import { InfoTip } from "./InfoTip";
import { tickMarks } from "./model/ladderTicks";

/**
 * Horizontal inset of the ladder axes.
 * Tick labels start at their tick, so the inset only has to fit the ``org`` axis name.
 */
const LADDER_LEFT = 36;

/** Space kept clear at the right end of each ladder axis. */
const LADDER_RIGHT = 14;

/**
 * Left edge of the middle-axis name.
 * The range label uses the same inset, so its text lines up with ``org``.
 */
const AXIS_LABEL_X = 6;

/** Vertical position of the A, org, and B axes in the strip, top to bottom. */
const AXIS_Y = [24, 122, 220] as const;

/** Gap between an axis line and the ribbon edge that meets it. */
const RIBBON_INSET = 6;

/** Height of a block drawn for verses that exist on one side only. */
const ONE_SIDED_BLOCK_HEIGHT = 22;

/** Strip height. It leaves room for the B labels under the last axis. */
const LADDER_HEIGHT = 240;

/** Pointer travel below this is a click, so the strip does not pan. */
const PAN_SLOP_PX = 4;

/** Props for the three-axis strip of one book. */
export interface LadderProps {
  /** Runs of the selected book, from ``scopeRuns``. Each one draws a ribbon on each pair of axes. */
  runs: ScopedRun[];
  /** Comparison index that supplies chapter lengths, book names, and type severities. */
  index: ComparisonIndex;
  /** Chapter lengths of the org scheme by book code. A missing book takes its extent from the runs. */
  org: Record<string, number[]>;
  /** Side A axis for ``runs``. The pan, the wheel, and the place caption measure against it. */
  axis: LadderAxis;
  /** Current zoom and first visible verse. */
  view: LadderView;
  /** Stores the next view after a pan or a wheel zoom. */
  onView: (view: LadderView) => void;
  /** Translation names printed above and below the strip and in the axes explanation. */
  sideNames: { a: string; b: string };
  /** Run to emphasize, and the callback a ribbon click calls. */
  highlight: RunHighlight;
}

/**
 * Three horizontal axes. Zoom 1 shows the whole book. The highest zoom, MAX_LADDER_ZOOM, shows one hundredth of the book.
 * Translation names sit outside the drawing. The range label ends with an info control
 * that explains the axes. Dragging the background pans that window.
 * The mouse wheel zooms around the pointer. A wheel that cannot change the zoom is left to
 * scroll the page, except a pinch, which is always consumed so the browser page does not zoom.
 * An unchanged ribbon is not a hit target, so a chapter with no deviance cannot be selected here.
 * Ribbons, blocks, axis lines, and ticks are clipped at the axis ends. The org name stays outside that clip.
 */
export function Ladder({
  runs,
  index,
  org,
  axis,
  view,
  onView,
  sideNames,
  highlight,
}: LadderProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  /** Clip-path fragment. A raw ``useId`` contains colons, which ``url(#…)`` does not resolve. */
  const clipId = useId().replaceAll(":", "");
  /** Pointer-down origin and position. The pan applies the total movement, not each step. */
  const dragRef = useRef<{ x: number; origin: number; id: number } | null>(null);
  /**
   * Latest view for the wheel and pan handlers.
   * Both write their result here, because either can run again before the next render.
   * A pan that read the zoom from the render would put the old zoom back after a wheel zoom.
   */
  const latest = useRef({ view, length: axis.length, onView });
  latest.current = { view, length: axis.length, onView };
  const pick = highlight.onPick;
  const activeKey = highlight.activeKey;
  const { zoom, origin } = view;
  const [windowStart, windowEnd] = ladderWindow(axis.length, zoom, origin);
  const chapters = visibleChapters(axis, windowStart, windowEnd);
  /** Start a pan from the strip background. A ribbon press stops before this runs. */
  const beginPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      x: event.clientX,
      origin: latest.current.view.origin,
      id: event.pointerId,
    };
  };
  /**
   * Move the source window with the pointer once the drag has passed the click threshold.
   * Zoom and length come from ``latest``, which a wheel event may already have updated.
   */
  const movePan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag === null || drag.id !== event.pointerId) {
      return;
    }
    const delta = event.clientX - drag.x;
    if (Math.abs(delta) < PAN_SLOP_PX) {
      return;
    }
    const current = latest.current;
    const width = Math.max(320, event.currentTarget.clientWidth);
    const [start, end] = ladderWindow(current.length, current.view.zoom, drag.origin);
    const span = Math.max(end - start, Number.MIN_VALUE);
    const pxPerVerse = (width - LADDER_LEFT - LADDER_RIGHT) / span;
    const nextView = {
      zoom: current.view.zoom,
      origin: panOrigin(
        current.length,
        current.view.zoom,
        drag.origin,
        delta,
        pxPerVerse,
      ),
    };
    current.view = nextView;
    current.onView(nextView);
  };
  /** Drop the drag when the pointer is released or cancelled. */
  const endPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.id === event.pointerId) {
      dragRef.current = null;
    }
  };
  useEffect(() => {
    const stage = hostRef.current;
    if (stage === null) {
      return;
    }
    /**
     * Zoom around the pointer. React's ``onWheel`` is passive and cannot cancel the scroll,
     * so this is a native listener.
     */
    const zoomOnWheel = (event: WheelEvent) => {
      if (event.ctrlKey) {
        event.preventDefault();
      }
      const current = latest.current;
      const next = clampZoom(
        current.view.zoom * wheelZoomFactor(event.deltaY, event.deltaMode, event.ctrlKey),
      );
      if (next === current.view.zoom) {
        return;
      }
      event.preventDefault();
      const plotWidth = Math.max(320, stage.clientWidth) - LADDER_LEFT - LADDER_RIGHT;
      const fraction =
        (event.clientX - stage.getBoundingClientRect().left - LADDER_LEFT) / plotWidth;
      const result = zoomAround(current.length, current.view, next, fraction);
      current.view = result;
      const drag = dragRef.current;
      if (drag !== null) {
        dragRef.current = { ...drag, x: event.clientX, origin: result.origin };
      }
      current.onView(result);
    };
    stage.addEventListener("wheel", zoomOnWheel, { passive: false });
    return () => stage.removeEventListener("wheel", zoomOnWheel);
  }, []);
  useEffect(() => {
    const host = hostRef.current;
    if (host === null) {
      return;
    }
    const sideO = axisFor(index, runs, "o", (code) => org[code]);
    const sideB = axisFor(index, runs, "b", (code) => index.byCode.get(code)?.b);
    const width = Math.max(320, host.clientWidth);
    const axes = [axis, sideO, sideB];
    const ranges = axes.map((side) =>
      ladderWindow(side.length, zoom, alignedOrigin(side.length, axis.length, origin)),
    );
    const scales = ranges.map((range) =>
      scaleLinear()
        .domain(range)
        .range([LADDER_LEFT, width - LADDER_RIGHT]),
    );
    const root = select(host);
    root.selectAll("*").remove();
    const svg = root.append("svg").attr("width", width).attr("height", LADDER_HEIGHT);
    svg
      .append("defs")
      .append("clipPath")
      .attr("id", clipId)
      .append("rect")
      .attr("x", LADDER_LEFT)
      .attr("y", 0)
      .attr("width", width - LADDER_LEFT - LADDER_RIGHT)
      .attr("height", LADDER_HEIGHT);
    const plot = svg.append("g").attr("clip-path", `url(#${clipId})`);
    const levels = [
      [AXIS_Y[0], null],
      [AXIS_Y[1], "org"],
      [AXIS_Y[2], null],
    ] as const;
    /**
     * Make a ribbon or a block selectable.
     * The outline stays on ribbons. A block only gets the hit target and the highlight.
     */
    const wire = <Element extends SVGElement>(
      element: Selection<Element, unknown, null, undefined>,
      run: ScopedRun,
    ) => {
      const key = runKey(run);
      const selectable = runSelectable(run);
      element.classed("dv-pick", selectable).classed("dv-selected", key === activeKey);
      if (!selectable) {
        return;
      }
      element.on("pointerdown", (event) => {
        event.stopPropagation();
      });
      element.on("click", () => pick(key));
    };
    for (const item of [0, 1] as const) {
      for (const run of runs) {
        const span = item === 0 ? run.a : run.o;
        const next = item === 0 ? run.o : run.b;
        if (span === null || next === null) {
          continue;
        }
        const scale = scales[item];
        const nextScale = scales[item + 1];
        if (scale === undefined || nextScale === undefined) {
          continue;
        }
        const yTop = AXIS_Y[item] + RIBBON_INSET;
        const yBottom = AXIS_Y[item + 1] - RIBBON_INSET;
        const ribbon = plot
          .append("path")
          .attr(
            "d",
            `M${scale(axes[item].position(span, false))},${yTop} L${scale(axes[item].position(span, true))},${yTop} L${nextScale(axes[item + 1].position(next, true))},${yBottom} L${nextScale(axes[item + 1].position(next, false))},${yBottom} Z`,
          )
          .attr(
            "fill",
            run.type === "SAME" ? NEUTRAL : severityColor(severityOf(index, run.type)),
          )
          .attr("fill-opacity", 0.85);
        wire(ribbon, run);
        const outline = ribbonOutline(run.flags);
        if (outline !== null) {
          ribbon.attr("stroke", outline.stroke).attr("stroke-width", 1);
          if (outline.dash !== null) {
            ribbon.attr("stroke-dasharray", outline.dash);
          }
        }
      }
    }
    for (const run of runs) {
      const fill =
        run.type === "SAME" ? NEUTRAL : severityColor(severityOf(index, run.type));
      if (
        run.a !== null &&
        run.b === null &&
        scales[0] !== undefined &&
        axes[0] !== undefined
      ) {
        const x = scales[0](axes[0].position(run.a, false));
        wire(
          plot
            .append("rect")
            .attr("x", x)
            .attr("y", AXIS_Y[0] + RIBBON_INSET)
            .attr("width", Math.max(1, scales[0](axes[0].position(run.a, true)) - x))
            .attr("height", ONE_SIDED_BLOCK_HEIGHT)
            .attr("fill", fill)
            .attr("fill-opacity", 0.85),
          run,
        );
      }
      if (
        run.b !== null &&
        run.a === null &&
        scales[2] !== undefined &&
        axes[2] !== undefined
      ) {
        const scale = scales[2];
        const side = axes[2];
        const x = scale(side.position(run.b, false));
        wire(
          plot
            .append("rect")
            .attr("x", x)
            .attr("y", AXIS_Y[2] - RIBBON_INSET - ONE_SIDED_BLOCK_HEIGHT)
            .attr("width", Math.max(1, scale(side.position(run.b, true)) - x))
            .attr("height", ONE_SIDED_BLOCK_HEIGHT)
            .attr("fill", fill)
            .attr("fill-opacity", 0.85),
          run,
        );
      }
    }
    plot.selectAll(".dv-selected").raise();
    const plotWidth = width - LADDER_LEFT - LADDER_RIGHT;
    levels.forEach(([y, label], item) => {
      const side = axes[item];
      const range = ranges[item];
      const scale = scales[item];
      if (label !== null) {
        svg
          .append("text")
          .attr("class", "dv-axis")
          .attr("x", AXIS_LABEL_X)
          .attr("y", y)
          .text(label);
      }
      plot
        .append("line")
        .attr("x1", LADDER_LEFT)
        .attr("x2", width - LADDER_RIGHT)
        .attr("y1", y)
        .attr("y2", y)
        .attr("stroke", "currentColor");
      if (side === undefined || range === undefined || scale === undefined) {
        return;
      }
      for (const mark of tickMarks(side, range, scale, plotWidth)) {
        const reach = mark.major ? 7 : 4;
        plot
          .append("line")
          .attr("x1", mark.x)
          .attr("x2", mark.x)
          .attr("y1", y - reach)
          .attr("y2", y + reach)
          .attr("stroke", "currentColor")
          .attr("stroke-width", mark.major ? 1.4 : 0.8);
        if (mark.label !== null) {
          plot
            .append("text")
            .attr("class", "dv-tick")
            .attr("x", mark.x + 2)
            .attr("y", item === 0 ? y - 8 : y + 16)
            .attr("text-anchor", "start")
            .text(mark.label);
        }
      }
    });
  }, [activeKey, axis, clipId, index, org, origin, pick, runs, zoom]);
  const ladderStyle = {
    "--dv-axis-label-x": `${AXIS_LABEL_X}px`,
  } as CSSProperties;
  return (
    <div className="dv-ladder" style={ladderStyle}>
      <div className="dv-ladder-head">
        <p className="dv-ladder-place">
          {placeCaption(index, chapters)}
          <InfoTip label="Verse axes explanation" text={verseAxesExplanation(sideNames)}>
            <InfoIcon />
          </InfoTip>
        </p>
        <p className="dv-ladder-name">{sideNames.a}</p>
      </div>
      <div
        className="dv-ladder-stage"
        ref={hostRef}
        onPointerDown={beginPan}
        onPointerMove={movePan}
        onPointerUp={endPan}
        onPointerCancel={endPan}
      />
      <p className="dv-ladder-name">{sideNames.b}</p>
    </div>
  );
}

/** Stroke used to mark a ribbon that is approximate, a data warning, or both. */
interface RibbonOutline {
  /** Accent for a data warning, otherwise the text color for an approximate run. */
  stroke: string;
  /** Dash pattern for an approximate run, or null when the run is only a warning. */
  dash: string | null;
}

/**
 * Outline for a ribbon. A data warning uses the accent, and an approximate run is dashed.
 * Returns null when the run has neither mark. A run can carry both.
 */
function ribbonOutline(flags: string): RibbonOutline | null {
  const warning = flags.includes("w");
  const approximate = flags.includes("a");
  if (!warning && !approximate) {
    return null;
  }
  return { stroke: warning ? ACCENT : "currentColor", dash: approximate ? "3 2" : null };
}

/**
 * Explanation of the three axes, opened from the info control on the range label.
 * It names both translations and how ribbon shapes map to divergences.
 */
function verseAxesExplanation(sideNames: { a: string; b: string }): string {
  return `Three verse axes: ${sideNames.a} on top, org in the middle, and ${sideNames.b} below. A straight ribbon is the same numbering, a slanted one is renumbered, a fanned one is a merge or split, a long one is a move, and crossing ribbons are an order inversion. A dashed edge is approximate, and an accent edge is a data warning. A block on the top or bottom axis has verses on that side only. Scroll or pinch to zoom, and drag to pan.`;
}

/** ``Genesis 20–22``, one chapter when the window stays inside it, or an empty string. */
function placeCaption(
  index: ComparisonIndex,
  chapters: ReturnType<typeof visibleChapters>,
): string {
  if (chapters === null) {
    return "";
  }
  const startName = index.byCode.get(chapters.book)?.name ?? chapters.book;
  if (chapters.book === chapters.endBook && chapters.first === chapters.last) {
    return `${startName} ${chapters.first}`;
  }
  if (chapters.book === chapters.endBook) {
    return `${startName} ${chapters.first}–${chapters.last}`;
  }
  const endName = index.byCode.get(chapters.endBook)?.name ?? chapters.endBook;
  return `${startName} ${chapters.first}–${endName} ${chapters.last}`;
}
