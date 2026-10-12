import { select, type Selection } from "d3-selection";
import { useEffect, useId, useRef } from "react";
import {
  ACCENT,
  APPROXIMATE_DASH,
  COUNT_DOT,
  devianceColor,
  HATCH,
  NEUTRAL,
} from "./model/colors";
import {
  bookState,
  cellState,
  countDotRadius,
  isNeutral,
  MATRIX,
  matrixTargets,
  visibleRows,
  type ComparisonIndex,
  type MatrixTarget,
} from "./model/index";
import type { MatrixSelection } from "./model/selection";

/** Props for the chapter matrix. */
export interface MatrixViewProps {
  index: ComparisonIndex;
  layersOn: ReadonlySet<string>;
  focus: number | null;
  /** Click, which pins the chapter or the book summary. */
  onSelect: (selection: MatrixSelection) => void;
}

const SECTION_NAME: Record<string, string> = {
  OT: "Old Testament",
  NT: "New Testament",
  DC: "Deuterocanon",
  EX: "Other books in the USFM catalog",
  NC: "Not in the USFM catalog",
};

/**
 * Draw the chapter matrix into a scrollable SVG.
 * A click pins a chapter or a book.
 */
export function MatrixView({ index, layersOn, focus, onSelect }: MatrixViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const hatchId = useId().replace(/:/g, "");
  const handlers = useRef({ onSelect });
  handlers.current = { onSelect };

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) {
      return;
    }
    const rows = visibleRows(index, layersOn);
    const targets = matrixTargets(rows);
    const pitch = MATRIX.cell + MATRIX.gap;
    let y = MATRIX.top;
    const placed = rows.map((row) => {
      const at = y;
      y += row.kind === "sec" ? MATRIX.secH : pitch;
      return { row, y: at };
    });
    const x0 = MATRIX.left + MATRIX.cell + MATRIX.sumGap;
    const width = x0 + MATRIX.cols * pitch + 16;
    const height = y + 16;
    const root = select(host);
    root.selectAll("*").remove();
    const svg = root
      .append("svg")
      .attr("width", width)
      .attr("height", height)
      .attr("role", "img")
      .attr("aria-label", `Matrix of ${index.books.length} books by chapter`);
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
    svg
      .append("text")
      .attr("class", "dv-axis")
      .attr("x", MATRIX.left + MATRIX.cell / 2)
      .attr("y", MATRIX.top - 12)
      .attr("text-anchor", "middle")
      .text("Book");
    for (const chapter of [1, 10, 20, 30, 40, 50]) {
      svg
        .append("text")
        .attr("class", "dv-axis")
        .attr("x", x0 + (chapter - 1) * pitch + MATRIX.cell / 2)
        .attr("y", MATRIX.top - 12)
        .attr("text-anchor", "middle")
        .text(String(chapter));
    }
    const drawing = svg.append("g");
    for (const item of placed) {
      if (item.row.kind === "sec") {
        drawing
          .append("text")
          .attr("class", "dv-section")
          .attr("x", 8)
          .attr("y", item.y + 20)
          .text(SECTION_NAME[item.row.section] ?? item.row.section);
        continue;
      }
      const book = item.row.book;
      if (book === null) {
        continue;
      }
      if (item.row.part === 0) {
        drawing
          .append("text")
          .attr("class", "dv-code")
          .attr("x", 8)
          .attr("y", item.y + 10)
          .text(book.code);
        drawing
          .append("text")
          .attr("class", "dv-book")
          .attr("x", 42)
          .attr("y", item.y + 10)
          .text(book.name.length > 18 ? `${book.name.slice(0, 17)}…` : book.name);
        const summary = { bookCode: book.code, chapter: null, summary: true };
        drawCell(
          drawing,
          MATRIX.left,
          item.y,
          bookState(index, book, layersOn),
          hatchId,
          {
            onSelect: () => handlers.current.onSelect(summary),
          },
        );
      } else {
        drawing
          .append("text")
          .attr("class", "dv-axis")
          .attr("x", 42)
          .attr("y", item.y + MATRIX.cell - 3)
          .text(
            `${item.row.part * MATRIX.cols + 1}–${Math.min((item.row.part + 1) * MATRIX.cols, book.slots)}`,
          );
      }
      const start = item.row.part * MATRIX.cols + 1;
      const end = Math.min(book.slots, (item.row.part + 1) * MATRIX.cols);
      let runStart: number | null = null;
      const flush = (last: number) => {
        if (runStart === null) {
          return;
        }
        drawing
          .append("rect")
          .attr("x", x0 + (runStart - start) * pitch)
          .attr("y", item.y)
          .attr("height", MATRIX.cell)
          .attr("width", (last - runStart + 1) * pitch - MATRIX.gap)
          .attr("rx", 2)
          .attr("fill", NEUTRAL)
          .attr("pointer-events", "none");
        runStart = null;
      };
      for (let chapter = start; chapter <= end; chapter += 1) {
        const state = cellState(index, book, chapter, layersOn);
        if (isNeutral(state)) {
          runStart = runStart ?? chapter;
          continue;
        }
        flush(chapter - 1);
        drawCell(drawing, x0 + (chapter - start) * pitch, item.y, state, hatchId, null);
      }
      flush(end);
      for (let chapter = start; chapter <= end; chapter += 1) {
        const x = x0 + (chapter - start) * pitch;
        const selection = { bookCode: book.code, chapter, summary: false };
        drawing
          .append("rect")
          .attr("x", x)
          .attr("y", item.y)
          .attr("width", pitch)
          .attr("height", MATRIX.cell)
          .attr("fill", "transparent")
          .style("cursor", "pointer")
          .on("click", () => handlers.current.onSelect(selection));
      }
    }
    const focusTarget = focus === null ? undefined : targets[focus];
    if (focusTarget !== undefined) {
      svg
        .append("rect")
        .attr("class", "dv-focus")
        .attr("x", focusTarget.x - 1)
        .attr("y", focusTarget.y - 1)
        .attr("width", MATRIX.cell + 2)
        .attr("height", MATRIX.cell + 2)
        .attr("rx", 2)
        .attr("fill", "none");
    }
  }, [focus, hatchId, index, layersOn]);

  return <div className="dv-matrix" ref={hostRef} />;
}

/** Click for the book-summary cell. Chapter cells pass null. */
interface BookSummaryHandlers {
  /** Pins the whole book. */
  onSelect: () => void;
}

/** Draw one colored cell. ``summary`` is set only for the book-level cell. */
function drawCell(
  parent: Selection<SVGGElement, unknown, null, undefined>,
  x: number,
  y: number,
  state: ReturnType<typeof cellState>,
  hatchId: string,
  summary: BookSummaryHandlers | null,
): void {
  const group = parent.append("g").attr("transform", `translate(${x},${y})`);
  const fill = state.severity ? devianceColor(state.deviance) : NEUTRAL;
  group
    .append("rect")
    .attr("width", MATRIX.cell)
    .attr("height", MATRIX.cell)
    .attr("rx", 2)
    .attr("fill", fill);
  if (state.oneSided) {
    group
      .append("rect")
      .attr("width", MATRIX.cell)
      .attr("height", MATRIX.cell)
      .attr("rx", 2)
      .attr("fill", `url(#${hatchId})`);
  }
  if (state.approximate) {
    group
      .append("rect")
      .attr("x", 0.75)
      .attr("y", 0.75)
      .attr("width", MATRIX.cell - 1.5)
      .attr("height", MATRIX.cell - 1.5)
      .attr("rx", 2)
      .attr("fill", "none")
      .attr("stroke", "currentColor")
      .attr("stroke-width", 1.2)
      .attr("stroke-dasharray", APPROXIMATE_DASH);
  }
  if (state.warning) {
    group
      .append("path")
      .attr("d", `M${MATRIX.cell - 5},0 H${MATRIX.cell} V5 Z`)
      .attr("fill", ACCENT);
  }
  const radius = countDotRadius(state.count);
  if (radius !== null) {
    group
      .append("circle")
      .attr("cx", MATRIX.cell / 2)
      .attr("cy", MATRIX.cell / 2)
      .attr("r", radius)
      .attr("fill", COUNT_DOT);
  }
  if (summary !== null) {
    group.style("cursor", "pointer").on("click", summary.onSelect);
  }
}

/** Targets the keyboard handler walks. Exported so the dialog can move focus. */
export function targetsFor(
  index: ComparisonIndex,
  layersOn: ReadonlySet<string>,
): MatrixTarget[] {
  return matrixTargets(visibleRows(index, layersOn));
}
