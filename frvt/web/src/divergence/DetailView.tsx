import { scaleLinear } from "d3-scale";
import { select } from "d3-selection";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ACCENT, NEUTRAL, severityColor } from "./model/colors";
import {
  alignedOrigin,
  axisFor,
  dotSegments,
  drawDotPlot,
  eventForRun,
  ladderWindow,
  nearestSegment,
  panOrigin,
  runForEvent,
  runKey,
  scopeRuns,
  visibleChapters,
  type DotSegment,
  type ScopedRun,
} from "./model/detail";
import { bookEvents, type ComparisonIndex } from "./model/index";
import type { RunRow } from "./types";

/** Pixels a dot-plot click may miss a stroke and still select that run. */
const DOT_HIT_SLOP_PX = 8;

/** Horizontal inset of the ladder axes. Wide enough for a chapter label at the first tick. */
const LADDER_LEFT = 36;

/** Space kept clear at the right end of each ladder axis. */
const LADDER_RIGHT = 14;

/** Pointer travel below this is a click, so the strip does not pan. */
const PAN_SLOP_PX = 4;

/** The highlighted run, shared by the ladder, the dot plot, and the table. */
interface RunHighlight {
  /** Key of the visible run to emphasize, or null when nothing is highlighted. */
  activeKey: string | null;
  /**
   * Select this run, or clear it when the key is already highlighted.
   * A null key is a miss and does nothing.
   */
  onPick: (key: string | null) => void;
}

/** Props for the ladder, dot plot, and event table of one book. */
export interface DetailViewProps {
  index: ComparisonIndex;
  runs: RunRow[];
  org: Record<string, number[]>;
  layersOn: ReadonlySet<string>;
  book: string | null;
  sideNames: { a: string; b: string };
  onBook: (code: string) => void;
  /** Highlight shared with the column. The dialog owns the key. */
  highlight: RunHighlight;
}

/**
 * Details tab: a three-axis ladder, a dot plot, and the event table.
 * Clicking a ribbon, a dot-plot stroke, or a table row highlights that run in all three.
 * Clicking the highlighted run again clears it. Dragging the strip background pans a zoomed window.
 * The dot plot skips drawing when the canvas has no 2D context.
 */
export function DetailView({
  index,
  runs,
  org,
  layersOn,
  book,
  sideNames,
  onBook,
  highlight,
}: DetailViewProps) {
  const choices = index.books.filter((item) => item.slots > 0);
  const bookCode =
    book ??
    choices.find((item) => bookEvents(index, item.code, layersOn).length > 0)?.code ??
    choices[0]?.code ??
    "";
  const [zoom, setZoom] = useState(1);
  const [magnify, setMagnify] = useState(true);
  /**
   * First verse of the strip window.
   * Reset while rendering a new book so the previous window does not paint.
   */
  const [origin, setOrigin] = useState(0);
  /** Book whose window ``origin`` belongs to. */
  const [originBook, setOriginBook] = useState(bookCode);
  if (bookCode !== originBook) {
    setOriginBook(bookCode);
    setOrigin(0);
  }
  const scoped = useMemo(
    () => (bookCode === "" ? [] : scopeRuns(index, runs, bookCode, layersOn)),
    [bookCode, index, layersOn, runs],
  );
  const events = bookCode === "" ? [] : bookEvents(index, bookCode, layersOn);
  const activeKey =
    highlight.activeKey !== null && scoped.some((run) => runKey(run) === highlight.activeKey)
      ? highlight.activeKey
      : null;
  const activeRun =
    activeKey === null ? null : (scoped.find((run) => runKey(run) === activeKey) ?? null);
  const selectedEvent = activeRun === null ? null : eventForRun(index, activeRun, layersOn);

  return (
    <div className="dv-detail">
      <label>
        Book{" "}
        <select value={bookCode} onChange={(event) => onBook(event.target.value)}>
          {choices.map((item) => (
            <option key={item.code} value={item.code}>
              {item.code} {item.name} ({bookEvents(index, item.code, layersOn).length}{" "}
              events)
            </option>
          ))}
        </select>
      </label>
      <label>
        Zoom {zoom}
        <input
          type="range"
          min={1}
          max={400}
          value={zoom}
          onChange={(event) => setZoom(Number(event.target.value))}
        />
      </label>
      <Ladder
        runs={scoped}
        index={index}
        org={org}
        zoom={zoom}
        origin={origin}
        onOrigin={setOrigin}
        sideNames={sideNames}
        highlight={{ activeKey, onPick: highlight.onPick }}
      />
      <label>
        <input
          type="checkbox"
          checked={magnify}
          onChange={(event) => setMagnify(event.target.checked)}
        />
        Magnify offsets
      </label>
      <DotPlot
        runs={scoped}
        index={index}
        magnify={magnify}
        highlight={{ activeKey, onPick: highlight.onPick }}
      />
      <table className="dv-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>{sideNames.a}</th>
            <th>org</th>
            <th>{sideNames.b}</th>
            <th>Verses</th>
          </tr>
        </thead>
        <tbody>
          {events.length === 0 ? (
            <tr>
              <td colSpan={5}>No divergences in the visible layers.</td>
            </tr>
          ) : (
            events.map((event) => {
              const rowSelected = selectedEvent?.index === event.index;
              return (
                <tr
                  key={event.index}
                  aria-selected={rowSelected}
                  onClick={() => {
                    if (rowSelected) {
                      highlight.onPick(activeKey);
                      return;
                    }
                    const match = runForEvent(index, scoped, event, layersOn);
                    if (match !== null) {
                      highlight.onPick(runKey(match));
                    }
                  }}
                >
                  <td>{event.type}</td>
                  <td>{formatSpan(event.a)}</td>
                  <td>{formatSpan(event.o)}</td>
                  <td>{formatSpan(event.b)}</td>
                  <td>{event.n}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Three horizontal axes. Zoom 1 shows the whole book. Zoom 400 shows a thin window.
 * Translation names sit outside the drawing. Dragging the background pans that window.
 */
function Ladder({
  runs,
  index,
  org,
  zoom,
  origin,
  onOrigin,
  sideNames,
  highlight,
}: {
  runs: ScopedRun[];
  index: ComparisonIndex;
  org: Record<string, number[]>;
  zoom: number;
  /** First verse of the visible window. */
  origin: number;
  /** Stores the next origin after a pan. */
  onOrigin: (origin: number) => void;
  sideNames: { a: string; b: string };
  highlight: RunHighlight;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  /** Pointer-down origin and position. The pan applies the total movement, not each step. */
  const dragRef = useRef<{ x: number; origin: number; id: number } | null>(null);
  const pick = highlight.onPick;
  const activeKey = highlight.activeKey;
  const sideA = useMemo(
    () => axisFor(index, runs, "a", (code) => index.byCode.get(code)?.a),
    [index, runs],
  );
  const [windowStart, windowEnd] = ladderWindow(sideA.length, zoom, origin);
  const chapters = visibleChapters(sideA, windowStart, windowEnd);
  /** Start a pan from the strip background. A ribbon press stops before this runs. */
  const beginPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, origin, id: event.pointerId };
  };
  /** Move the source window with the pointer once the drag has passed the click threshold. */
  const movePan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag === null || drag.id !== event.pointerId) {
      return;
    }
    const delta = event.clientX - drag.x;
    if (Math.abs(delta) < PAN_SLOP_PX) {
      return;
    }
    const width = Math.max(320, event.currentTarget.clientWidth);
    const [start, end] = ladderWindow(sideA.length, zoom, drag.origin);
    const span = Math.max(end - start, Number.MIN_VALUE);
    const pxPerVerse = (width - LADDER_LEFT - LADDER_RIGHT) / span;
    onOrigin(panOrigin(sideA.length, zoom, drag.origin, delta, pxPerVerse));
  };
  /** Drop the drag when the pointer is released or cancelled. */
  const endPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.id === event.pointerId) {
      dragRef.current = null;
    }
  };
  useEffect(() => {
    const host = hostRef.current;
    if (host === null) {
      return;
    }
    const sideO = axisFor(index, runs, "o", (code) => org[code]);
    const sideB = axisFor(index, runs, "b", (code) => index.byCode.get(code)?.b);
    const width = Math.max(320, host.clientWidth);
    const height = 280;
    const axes = [sideA, sideO, sideB];
    const scales = axes.map((axis) => {
      const [start, end] = ladderWindow(
        axis.length,
        zoom,
        alignedOrigin(axis.length, sideA.length, origin),
      );
      return scaleLinear()
        .domain([start, end])
        .range([LADDER_LEFT, width - LADDER_RIGHT]);
    });
    const root = select(host);
    root.selectAll("*").remove();
    const svg = root.append("svg").attr("width", width).attr("height", height);
    const levels = [
      [44, null],
      [142, "org"],
      [240, null],
    ] as const;
    levels.forEach(([y, label], item) => {
      if (label !== null) {
        svg.append("text").attr("class", "dv-axis").attr("x", 6).attr("y", y).text(label);
      }
      svg
        .append("line")
        .attr("x1", LADDER_LEFT)
        .attr("x2", width - LADDER_RIGHT)
        .attr("y1", y)
        .attr("y2", y)
        .attr("stroke", "currentColor");
      if (item === 0) {
        const scale = scales[0];
        const [start, end] = ladderWindow(sideA.length, zoom, origin);
        for (const tick of sideA.ticks) {
          if (scale === undefined || tick.x < start || tick.x > end) {
            continue;
          }
          const x = scale(tick.x);
          svg
            .append("line")
            .attr("x1", x)
            .attr("x2", x)
            .attr("y1", y - 8)
            .attr("y2", y)
            .attr("stroke", "currentColor");
          svg
            .append("text")
            .attr("class", "dv-tick")
            .attr("x", x)
            .attr("y", y - 12)
            .attr("text-anchor", "middle")
            .text(tick.label);
        }
      }
      for (const run of runs) {
        const span = item === 0 ? run.a : item === 1 ? run.o : run.b;
        const next = item === 0 ? run.o : item === 1 ? run.b : null;
        if (span === null || next === null || item === 2) {
          continue;
        }
        const scale = scales[item];
        const nextScale = scales[item + 1];
        if (scale === undefined || nextScale === undefined) {
          continue;
        }
        const yTop = item === 0 ? 50 : 148;
        const yBottom = item === 0 ? 136 : 234;
        const key = runKey(run);
        svg
          .append("path")
          .attr(
            "d",
            `M${scale(axes[item].position(span, false))},${yTop} L${scale(axes[item].position(span, true))},${yTop} L${nextScale(axes[item + 1].position(next, true))},${yBottom} L${nextScale(axes[item + 1].position(next, false))},${yBottom} Z`,
          )
          .attr(
            "fill",
            run.type === "SAME" ? NEUTRAL : severityColor(severityOf(index, run.type)),
          )
          .attr("fill-opacity", 0.85)
          .classed("dv-selected", key === activeKey)
          .on("pointerdown", (event: PointerEvent) => {
            event.stopPropagation();
          })
          .on("click", () => pick(key));
      }
    });
  }, [activeKey, index, org, origin, pick, runs, sideA, zoom]);
  return (
    <div className="dv-ladder">
      <p className="dv-ladder-name">{sideNames.a}</p>
      <p className="dv-ladder-place">{placeCaption(index, chapters)}</p>
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

/**
 * Square plot of side A against side B.
 * A null canvas context leaves the plot blank and ignores clicks.
 */
function DotPlot({
  runs,
  index,
  magnify,
  highlight,
}: {
  runs: ScopedRun[];
  index: ComparisonIndex;
  magnify: boolean;
  highlight: RunHighlight;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const segmentsRef = useRef<DotSegment[]>([]);
  const pick = highlight.onPick;
  const activeKey = highlight.activeKey;
  useEffect(() => {
    const canvas = ref.current;
    if (canvas === null || canvasContext(canvas) === null) {
      segmentsRef.current = [];
      return;
    }
    const size = canvas.clientWidth || 360;
    const segments = dotSegments(runs, index, magnify, size);
    segmentsRef.current = segments;
    drawDotPlot(canvas, (context) => {
      canvas.width = size;
      canvas.height = size;
      context.clearRect(0, 0, size, size);
      context.strokeStyle = NEUTRAL;
      context.lineWidth = 1;
      context.strokeRect(14, 4, size - 18, size - 18);
      for (const segment of segments) {
        context.strokeStyle =
          segment.type === "SAME" ? NEUTRAL : severityColor(severityOf(index, segment.type));
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(segment.x0, segment.y0);
        context.lineTo(segment.x1, segment.y1);
        context.stroke();
      }
      const selected = segments.find((segment) => segment.key === activeKey);
      if (selected === undefined) {
        return;
      }
      context.strokeStyle = ACCENT;
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(selected.x0, selected.y0);
      context.lineTo(selected.x1, selected.y1);
      context.stroke();
    });
  }, [activeKey, index, magnify, runs]);
  return (
    <canvas
      className="dv-dot"
      ref={ref}
      onClick={(event) => {
        pick(
          nearestSegment(
            segmentsRef.current,
            event.nativeEvent.offsetX,
            event.nativeEvent.offsetY,
            DOT_HIT_SLOP_PX,
          ),
        );
      }}
    />
  );
}

/**
 * 2D context for the dot plot, or null when the canvas cannot draw.
 * A host without canvas support throws instead of returning null; that is the same outcome.
 */
function canvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  try {
    return canvas.getContext("2d");
  } catch {
    return null;
  }
}

/** Severity for a run type, or 0 when the type is unchanged. */
function severityOf(index: ComparisonIndex, type: string): number {
  return index.types.find((item) => item.id === type)?.severity ?? 0;
}

/** Compact reference for a table cell. */
function formatSpan(span: ScopedRun["a"]): string {
  if (span === null) {
    return "—";
  }
  const end = span[3] === span[1] && span[4] === span[2] ? "" : `–${span[3]}:${span[4]}`;
  return `${span[0]} ${span[1]}:${span[2]}${end}`;
}
