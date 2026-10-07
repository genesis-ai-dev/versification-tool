import { arc, type DefaultArcObject } from "d3-shape";
import { select } from "d3-selection";
import { useEffect, useId, useRef } from "react";
import { ACCENT, devianceColor, HATCH, NEUTRAL } from "./model/colors";
import {
  bookState,
  cellState,
  isNeutral,
  MATRIX,
  visibleRows,
  type ComparisonIndex,
  type IndexedBook,
} from "./model/index";
import { eventSelection, type MatrixSelection } from "./model/selection";
import {
  bookLabelTransform,
  isRibbonType,
  ribbonCurve,
  ribbonStyle,
  ribbonWidth,
} from "./model/radial";

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
    // Fill the chart column. A wider dialog draws a larger chart. 320 keeps a narrow column readable.
    const size = Math.max(320, host.clientWidth || 700);
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
              .attr("fill", `url(#${hatchId})`)
              .attr("pointer-events", "none");
          }
          if (state.warning) {
            svg
              .append("path")
              .attr("d", shape({ ...geo, innerRadius: geo.outerRadius - 1.6 }) ?? "")
              .attr("fill", ACCENT)
              .attr("pointer-events", "none");
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
        if (summary.oneSided) {
          svg
            .append("path")
            .attr("d", shape(ring) ?? "")
            .attr("fill", `url(#${hatchId})`)
            .attr("pointer-events", "none");
        }
        const bookSelection = { bookCode: unit.book.code, chapter: null, summary: true };
        svg
          .append("path")
          .attr("d", shape(ring) ?? "")
          .attr("fill", "transparent")
          .style("cursor", "pointer")
          .on("mouseenter", () => {
            if (!handlers.current.pinned) {
              handlers.current.onHover(bookSelection);
            }
          })
          .on("click", () => handlers.current.onSelect(bookSelection));
        const mid = (ring.startAngle + ring.endAngle) / 2;
        if (per * radius > 7) {
          const label = bookLabelTransform(mid, radius);
          svg
            .append("text")
            .attr("class", "dv-code")
            .attr("font-size", 8.5)
            .attr("transform", label.transform)
            .attr("text-anchor", label.anchor)
            .attr("dy", "0.32em")
            .text(unit.book.code);
        }
      }
    });
    const markers = new Map<string, string>();
    /**
     * Arrowhead for one ribbon color, created the first time that color is used.
     * Moves share a marker per color so the head matches the stroke.
     */
    const markerFor = (color: string) => {
      const existing = markers.get(color);
      if (existing !== undefined) {
        return existing;
      }
      const id = `${hatchId}-arrow-${markers.size}`;
      svg
        .select("defs")
        .append("marker")
        .attr("id", id)
        .attr("viewBox", "0 0 10 10")
        .attr("refX", 8.5)
        .attr("refY", 5)
        .attr("markerWidth", 9)
        .attr("markerHeight", 9)
        .attr("markerUnits", "userSpaceOnUse")
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,1 L9,5 L0,9 L2.6,5 Z")
        .attr("fill", color);
      markers.set(color, id);
      return id;
    };
    const ribbon = svg.append("g").attr("fill", "none");
    for (const event of index.events) {
      if (
        !layersOn.has(event.layer) ||
        event.a === null ||
        event.b === null ||
        !isRibbonType(event.type)
      ) {
        continue;
      }
      const start = chapterPoint(units, event.a, geometry);
      const end = chapterPoint(units, event.b, geometry);
      if (start === null || end === null) {
        continue;
      }
      const style = ribbonStyle(event.type, event.severity);
      const curve = ribbonCurve(start, end, style.arrow);
      if (curve === null) {
        continue;
      }
      const path = ribbon
        .append("path")
        .attr("d", curve)
        .attr("stroke", style.color)
        .attr("stroke-opacity", 0.55)
        .attr("stroke-width", ribbonWidth(event.n))
        .attr("pointer-events", "stroke")
        .style("cursor", "pointer");
      if (style.arrow) {
        path.attr("marker-end", `url(#${markerFor(style.color)})`);
      }
      const selection = eventSelection(index, event, null);
      if (selection === null) {
        continue;
      }
      path
        .on("mouseenter", (pointer: MouseEvent) => {
          if (pointer.currentTarget instanceof SVGPathElement) {
            select(pointer.currentTarget).attr("stroke-opacity", 1);
          }
          if (!handlers.current.pinned) {
            handlers.current.onHover(selection);
          }
        })
        .on("mouseleave", (pointer: MouseEvent) => {
          if (pointer.currentTarget instanceof SVGPathElement) {
            select(pointer.currentTarget).attr("stroke-opacity", 0.55);
          }
        })
        .on("click", () => handlers.current.onSelect(selection));
    }
  }, [hatchId, index, layersOn, layout]);

  return (
    <div className="dv-radial">
      <div ref={hostRef} />
    </div>
  );
}

/** Point at the middle of one chapter, or null when that chapter is not drawn. */
function chapterPoint(
  units: { book: IndexedBook; first: number; last: number }[],
  span: [string, number, number, number, number],
  geometry: (
    unit: { book: IndexedBook; first: number; last: number },
    item: number,
    chapter: number,
  ) => { innerRadius: number; outerRadius: number; startAngle: number; endAngle: number },
): readonly [number, number] | null {
  const item = units.findIndex(
    (unit) => unit.book.code === span[0] && span[1] >= unit.first && span[1] <= unit.last,
  );
  const unit = units[item];
  if (unit === undefined) {
    return null;
  }
  const geo = geometry(unit, item, span[1]);
  const mid = (geo.startAngle + geo.endAngle) / 2;
  const at = (geo.innerRadius + geo.outerRadius) / 2;
  return [Math.sin(mid) * at, -Math.cos(mid) * at];
}
