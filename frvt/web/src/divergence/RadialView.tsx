import { arc, type DefaultArcObject } from "d3-shape";
import { select } from "d3-selection";
import { useEffect, useId, useRef } from "react";
import { devianceColor, HATCH, NEUTRAL, severityColor } from "./model/colors";
import {
  bookState,
  cellState,
  isNeutral,
  MATRIX,
  visibleRows,
  type ComparisonIndex,
  type IndexedBook,
} from "./model/index";
import type { MatrixSelection } from "./MatrixView";

/** Props for the two radial layouts. */
export interface RadialViewProps {
  index: ComparisonIndex;
  layersOn: ReadonlySet<string>;
  /** ``slices`` gives each book the full radius. ``rings`` uses a fixed ring thickness. */
  layout: "slices" | "rings";
  pinned: boolean;
  onSelect: (selection: MatrixSelection) => void;
  onHover: (selection: MatrixSelection) => void;
}

/**
 * Draw chapters as slices or as rings.
 * Hover does not pin. A pinned selection ignores later hovers.
 */
export function RadialView({
  index,
  layersOn,
  layout,
  pinned,
  onSelect,
  onHover,
}: RadialViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const hatchId = useId().replace(/:/g, "");
  const handlers = useRef({ onSelect, onHover, pinned });
  handlers.current = { onSelect, onHover, pinned };

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) {
      return;
    }
    const proposed = layout === "slices";
    const size = Math.max(320, Math.min(760, host.clientWidth || 700));
    const radius = size / 2 - 34;
    const inner = radius * 0.22;
    const root = select(host);
    root.selectAll("*").remove();
    const svg = root
      .append("svg")
      .attr("width", size)
      .attr("height", size)
      .attr("viewBox", `${-size / 2} ${-size / 2} ${size} ${size}`)
      .attr("role", "img")
      .attr(
        "aria-label",
        proposed ? "Radial chart, chapters as slices" : "Radial chart, chapters as rings",
      );
    const pattern = svg
      .append("defs")
      .append("pattern")
      .attr("id", hatchId)
      .attr("patternUnits", "userSpaceOnUse")
      .attr("width", 4)
      .attr("height", 4)
      .attr("patternTransform", "rotate(45)");
    pattern
      .append("line")
      .attr("x1", 0)
      .attr("y1", 0)
      .attr("x2", 0)
      .attr("y2", 4)
      .attr("stroke", HATCH)
      .attr("stroke-width", 1.4);
    const shape = arc<DefaultArcObject>();
    const units = proposed
      ? index.books
          .filter(
            (book) =>
              book.slots &&
              !(!layersOn.has("canon") && index.oneSidedBooks.has(book.code)),
          )
          .map((book) => ({ book, first: 1, last: book.slots }))
      : visibleRows(index, layersOn)
          .filter((row) => row.kind === "book" && row.book !== null)
          .map((row) => ({
            book: row.book!,
            first: row.part * MATRIX.cols + 1,
            last: Math.min(row.book!.slots, (row.part + 1) * MATRIX.cols),
          }));
    const gap = 0.012;
    const sections = new Set(units.map((unit) => unit.book.section)).size;
    const per = units.length === 0 ? 0 : (2 * Math.PI - gap * sections) / units.length;
    let angle = 0;
    let lastSection: string | null = null;
    const angles: number[] = [];
    for (const unit of units) {
      if (unit.book.section !== lastSection) {
        angle += gap;
        lastSection = unit.book.section;
      }
      angles.push(angle);
      angle += per;
    }
    const geometry = (unit: (typeof units)[number], item: number, chapter: number) => {
      const count = proposed ? unit.last - unit.first + 1 : MATRIX.cols;
      const ring = (radius - inner) / Math.max(count, 1);
      const offset = chapter - unit.first;
      return {
        innerRadius: inner + offset * ring,
        outerRadius: inner + offset * ring + ring * 0.86,
        startAngle: angles[item] ?? 0,
        endAngle: (angles[item] ?? 0) + per * 0.92,
      };
    };
    units.forEach((unit, item) => {
      let runStart: number | null = null;
      const flush = (last: number) => {
        if (runStart === null) {
          return;
        }
        const start = geometry(unit, item, runStart);
        const end = geometry(unit, item, last);
        svg
          .append("path")
          .attr("d", shape({ ...start, outerRadius: end.outerRadius }) ?? "")
          .attr("fill", NEUTRAL)
          .attr("pointer-events", "none");
        runStart = null;
      };
      for (let chapter = unit.first; chapter <= unit.last; chapter += 1) {
        const state = cellState(index, unit.book, chapter, layersOn);
        const geo = geometry(unit, item, chapter);
        if (isNeutral(state)) {
          runStart = runStart ?? chapter;
        } else {
          flush(chapter - 1);
          svg
            .append("path")
            .attr("d", shape(geo) ?? "")
            .attr("fill", state.severity ? devianceColor(state.deviance) : NEUTRAL)
            .attr("pointer-events", "none");
          if (state.oneSided) {
            svg
              .append("path")
              .attr("d", shape(geo) ?? "")
              .attr("fill", `url(#${hatchId})`);
          }
        }
        const selection = { bookCode: unit.book.code, chapter, summary: false };
        svg
          .append("path")
          .attr("d", shape(geo) ?? "")
          .attr("fill", "transparent")
          .style("cursor", "pointer")
          .on("mouseenter", () => {
            if (!handlers.current.pinned) {
              handlers.current.onHover(selection);
            }
          })
          .on("click", () => handlers.current.onSelect(selection));
      }
      flush(unit.last);
      if (unit.first === 1) {
        const summary = bookState(index, unit.book, layersOn);
        const ring = {
          innerRadius: inner - 12,
          outerRadius: inner - 4,
          startAngle: angles[item] ?? 0,
          endAngle: (angles[item] ?? 0) + per * 0.92,
        };
        svg
          .append("path")
          .attr("d", shape(ring) ?? "")
          .attr("fill", summary.severity ? devianceColor(summary.deviance) : NEUTRAL)
          .attr("pointer-events", "none");
        const bookSelection = { bookCode: unit.book.code, chapter: null, summary: true };
        svg
          .append("path")
          .attr("d", shape(ring) ?? "")
          .attr("fill", "transparent")
          .style("cursor", "pointer")
          .on("click", () => handlers.current.onSelect(bookSelection));
        const mid = (ring.startAngle + ring.endAngle) / 2;
        svg
          .append("text")
          .attr("class", "dv-code")
          .attr("font-size", 8.5)
          .attr(
            "transform",
            `rotate(${(mid * 180) / Math.PI - 90}) translate(${radius + 8},0)`,
          )
          .attr("dy", "0.32em")
          .text(unit.book.code);
      }
    });
    const ribbon = svg.append("g").attr("fill", "none");
    for (const event of index.events) {
      if (
        !layersOn.has(event.layer) ||
        event.a === null ||
        event.b === null ||
        !["CROSS_BOOK", "CHAPTER_MOVE", "ORDER_INVERSION"].includes(event.type)
      ) {
        continue;
      }
      ribbon
        .append("path")
        .attr("stroke", severityColor(event.severity))
        .attr("stroke-opacity", 0.55)
        .attr("d", ribbonPath(units, event.a, event.b, geometry))
        .attr("pointer-events", "stroke");
    }
  }, [hatchId, index, layersOn, layout]);

  return (
    <div className="dv-radial" ref={hostRef}>
      <p className="dv-caption">
        {layout === "slices"
          ? "Each book gets an equal sector. Its chapters divide that sector’s radius."
          : "Long books wrap into several sectors. Each chapter is one ring of fixed thickness."}
      </p>
    </div>
  );
}

/** Quadratic ribbon between two chapter positions. Empty when either chapter is absent. */
function ribbonPath(
  units: { book: IndexedBook; first: number; last: number }[],
  from: [string, number, number, number, number],
  to: [string, number, number, number, number],
  geometry: (
    unit: { book: IndexedBook; first: number; last: number },
    item: number,
    chapter: number,
  ) => { innerRadius: number; outerRadius: number; startAngle: number; endAngle: number },
): string {
  const point = (span: [string, number, number, number, number]) => {
    const item = units.findIndex(
      (unit) =>
        unit.book.code === span[0] && span[1] >= unit.first && span[1] <= unit.last,
    );
    const unit = units[item];
    if (unit === undefined) {
      return null;
    }
    const geo = geometry(unit, item, span[1]);
    const mid = (geo.startAngle + geo.endAngle) / 2;
    const radius = (geo.innerRadius + geo.outerRadius) / 2;
    return [Math.sin(mid) * radius, -Math.cos(mid) * radius] as const;
  };
  const start = point(from);
  const end = point(to);
  if (start === null || end === null) {
    return "";
  }
  return `M${start[0]},${start[1]} Q${(start[0] + end[0]) * 0.12},${(start[1] + end[1]) * 0.12} ${end[0]},${end[1]}`;
}
