import { scaleLinear } from "d3-scale";
import { select } from "d3-selection";
import { useEffect, useMemo, useRef, useState } from "react";
import { NEUTRAL, severityColor } from "./model/colors";
import {
  axisFor,
  drawDotPlot,
  ladderWindow,
  scopeRuns,
  type ScopedRun,
} from "./model/detail";
import { bookEvents, type ComparisonIndex } from "./model/index";
import type { RunRow } from "./types";

/** Props for the ladder, dot plot, and event table of one book. */
export interface DetailViewProps {
  index: ComparisonIndex;
  runs: RunRow[];
  org: Record<string, number[]>;
  layersOn: ReadonlySet<string>;
  book: string | null;
  sideNames: { a: string; b: string };
  onBook: (code: string) => void;
}

/**
 * Book detail: a three-axis ladder, a dot plot, and the event table.
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
}: DetailViewProps) {
  const choices = index.books.filter((item) => item.slots > 0);
  const selected =
    book ??
    choices.find((item) => bookEvents(index, item.code, layersOn).length > 0)?.code ??
    choices[0]?.code ??
    "";
  const [zoom, setZoom] = useState(1);
  const [magnify, setMagnify] = useState(true);
  const scoped = useMemo(
    () => (selected === "" ? [] : scopeRuns(index, runs, selected, layersOn)),
    [index, runs, selected, layersOn],
  );
  const events = selected === "" ? [] : bookEvents(index, selected, layersOn);

  return (
    <div className="dv-detail">
      <label>
        Book{" "}
        <select value={selected} onChange={(event) => onBook(event.target.value)}>
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
      <Ladder runs={scoped} index={index} org={org} zoom={zoom} sideNames={sideNames} />
      <label>
        <input
          type="checkbox"
          checked={magnify}
          onChange={(event) => setMagnify(event.target.checked)}
        />
        Magnify offsets
      </label>
      <DotPlot runs={scoped} index={index} magnify={magnify} />
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
            events.map((event) => (
              <tr key={event.index}>
                <td>{event.type}</td>
                <td>{formatSpan(event.a)}</td>
                <td>{formatSpan(event.o)}</td>
                <td>{formatSpan(event.b)}</td>
                <td>{event.n}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Three horizontal axes. Zoom 1 shows the whole book. Zoom 400 shows a thin window. */
function Ladder({
  runs,
  index,
  org,
  zoom,
  sideNames,
}: {
  runs: ScopedRun[];
  index: ComparisonIndex;
  org: Record<string, number[]>;
  zoom: number;
  sideNames: { a: string; b: string };
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (host === null) {
      return;
    }
    const sideA = axisFor(index, runs, "a", (code) => index.byCode.get(code)?.a);
    const sideO = axisFor(index, runs, "o", (code) => org[code]);
    const sideB = axisFor(index, runs, "b", (code) => index.byCode.get(code)?.b);
    const width = Math.max(320, host.clientWidth);
    const height = 280;
    const left = 58;
    const right = 14;
    const axes = [sideA, sideO, sideB];
    const scales = axes.map((axis) => {
      const [start, end] = ladderWindow(axis.length, zoom);
      return scaleLinear()
        .domain([start, end])
        .range([left, width - right]);
    });
    const root = select(host);
    root.selectAll("*").remove();
    const svg = root.append("svg").attr("width", width).attr("height", height);
    const levels = [
      [44, sideNames.a],
      [142, "org"],
      [240, sideNames.b],
    ] as const;
    levels.forEach(([y, label], item) => {
      svg.append("text").attr("class", "dv-axis").attr("x", 6).attr("y", y).text(label);
      svg
        .append("line")
        .attr("x1", left)
        .attr("x2", width - right)
        .attr("y1", y)
        .attr("y2", y)
        .attr("stroke", "currentColor");
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
          .attr("fill-opacity", 0.85);
      }
    });
  }, [index, org, runs, sideNames.a, sideNames.b, zoom]);
  return <div className="dv-ladder" ref={hostRef} />;
}

/** Square plot of side A against side B. A null canvas context leaves it blank. */
function DotPlot({
  runs,
  index,
  magnify,
}: {
  runs: ScopedRun[];
  index: ComparisonIndex;
  magnify: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (canvas === null) {
      return;
    }
    drawDotPlot(canvas, (context) => {
      const sideA = axisFor(index, runs, "a", (code) => index.byCode.get(code)?.a);
      const sideB = axisFor(index, runs, "b", (code) => index.byCode.get(code)?.b);
      const size = canvas.clientWidth || 360;
      canvas.width = size;
      canvas.height = size;
      context.clearRect(0, 0, size, size);
      context.strokeStyle = NEUTRAL;
      context.strokeRect(14, 4, size - 18, size - 18);
      const x = scaleLinear()
        .domain(ladderWindow(sideA.length, 1))
        .range([14, size - 4]);
      const y = scaleLinear()
        .domain(ladderWindow(sideB.length, 1))
        .range([size - 14, 4]);
      const perVerse = (size - 18) / Math.max(1, sideB.length);
      let maxOffset = 0;
      for (const run of runs) {
        if (run.a !== null && run.b !== null && run.a[0] === run.b[0]) {
          maxOffset = Math.max(
            maxOffset,
            Math.abs(sideB.position(run.b, false) - sideA.position(run.a, false)),
            Math.abs(sideB.position(run.b, true) - sideA.position(run.a, true)),
          );
        }
      }
      const head = 0.3 * (size - 18);
      const magnification =
        maxOffset > 0 ? Math.min(400, head / (maxOffset * perVerse)) : 1;
      const top = 4 + head;
      const bottom = size - 14 - head;
      const baseline = (position: number) =>
        bottom + (position / Math.max(1, sideA.length)) * (top - bottom);
      const magnified = (aPos: number, bPos: number) =>
        Math.max(
          4,
          Math.min(size - 14, baseline(aPos) - (bPos - aPos) * perVerse * magnification),
        );
      for (const run of runs) {
        if (run.a === null || run.b === null) {
          continue;
        }
        context.strokeStyle =
          run.type === "SAME" ? NEUTRAL : severityColor(severityOf(index, run.type));
        context.beginPath();
        const a0 = sideA.position(run.a, false);
        const a1 = sideA.position(run.a, true);
        const b0 = sideB.position(run.b, false);
        const b1 = sideB.position(run.b, true);
        context.moveTo(x(a0), magnify ? magnified(a0, b0) : y(b0));
        context.lineTo(x(a1), magnify ? magnified(a1, b1) : y(b1));
        context.stroke();
      }
    });
  }, [index, magnify, runs]);
  return <canvas className="dv-dot" ref={ref} />;
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
