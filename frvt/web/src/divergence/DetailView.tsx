import { useMemo, useState } from "react";
import { EventTable } from "./EventTable";
import { DotPlot } from "./DotPlot";
import { InfoIcon } from "./InfoIcon";
import { InfoTip } from "./InfoTip";
import { Ladder } from "./Ladder";
import { SideTabs, type SideTab } from "./SideTabs";
import {
  axisFor,
  MAX_LADDER_ZOOM,
  runKey,
  runSelectable,
  initialLadderView,
  scopeRuns,
  zoomAround,
  type LadderView,
} from "./model/detail";
import { dotMagnification } from "./model/dotPlot";
import type { RunHighlight } from "./model/selection";
import { bookEvents, type ComparisonIndex } from "./model/index";
import type { RunRow } from "./types";

/** Views that share the space under the strip. */
type DetailPanel = "events" | "dot";

/** Tabs under the strip, top to bottom. The event table opens first. */
const DETAIL_PANELS: readonly SideTab<DetailPanel>[] = [
  { id: "events", label: "Divergences" },
  { id: "dot", label: "Dot plot" },
];

/** Props for the ladder, dot plot, and event table of one book. */
export interface DetailViewProps {
  index: ComparisonIndex;
  runs: RunRow[];
  org: Record<string, number[]>;
  layersOn: ReadonlySet<string>;
  /** Book drawn in the strip. The dialog passes the open book, or an empty string when there is none. */
  book: string;
  sideNames: { a: string; b: string };
  onBook: (code: string) => void;
  /** Highlight shared with the column. The dialog owns the key. */
  highlight: RunHighlight;
}

/**
 * Details tab: a row with the book menu and the zoom slider, a three-axis ladder, and
 * vertical tabs under it for the event table (``Divergences``, the default) and the dot plot.
 * A deviance ribbon, a one-sided block, a dot-plot stroke or tick, or a table row selects
 * that run or event. A table row with no matching run still selects the event.
 * An unchanged run is not a deviance, so its ribbon, block, and stroke do not select.
 * Clicking the highlighted run or the selected event again clears it.
 * Every book change resets the strip. A long book opens on a window that starts
 * just before its first divergence.
 * A layer toggle leaves the window where it is. Dragging the strip background pans a zoomed
 * window, and the mouse wheel zooms it; the slider follows both.
 * The dot plot skips drawing when the canvas has no 2D context.
 * An info control at the end of the range label explains the three axes.
 * An info control at the end of Magnify offsets explains the dot plot.
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
  const bookCode = book;
  const scoped = useMemo(
    () => (bookCode === "" ? [] : scopeRuns(index, runs, bookCode, layersOn)),
    [bookCode, index, layersOn, runs],
  );
  const sideA = useMemo(
    () => axisFor(index, scoped, "a", (code) => index.byCode.get(code)?.a),
    [index, scoped],
  );
  const [magnify, setMagnify] = useState(true);
  const magnification = useMemo(() => dotMagnification(scoped, index), [index, scoped]);
  /** View shown under the strip. Resets to the table when the Details tab reopens. */
  const [panel, setPanel] = useState<DetailPanel>("events");
  /**
   * Strip zoom and first visible verse.
   * Every book change resets the view. A long book opens on a window at its first
   * divergence. A layer toggle does not reset it.
   */
  const [view, setView] = useState<LadderView>(() => initialLadderView(sideA, scoped));
  /** Book the current window was opened for. */
  const [viewBook, setViewBook] = useState(bookCode);
  if (bookCode !== viewBook) {
    setViewBook(bookCode);
    setView(initialLadderView(sideA, scoped));
  }
  const events = bookCode === "" ? [] : bookEvents(index, bookCode, layersOn);
  const activeKey =
    highlight.activeKey !== null &&
    scoped.some((run) => runSelectable(run) && runKey(run) === highlight.activeKey)
      ? highlight.activeKey
      : null;
  const runHighlight = { ...highlight, activeKey };

  return (
    <div className="dv-detail">
      <div className="dv-detail-toolbar">
        <label className="dv-detail-book">
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
        <label className="dv-detail-zoom">
          Zoom {formatZoom(view.zoom)}
          <input
            type="range"
            min={1}
            max={MAX_LADDER_ZOOM}
            step={1}
            value={view.zoom}
            onChange={(event) => {
              const next = Number(event.target.value);
              setView((current) => zoomAround(sideA.length, current, next, 0.5));
            }}
          />
        </label>
      </div>
      <Ladder
        runs={scoped}
        index={index}
        org={org}
        axis={sideA}
        view={view}
        onView={setView}
        sideNames={sideNames}
        highlight={runHighlight}
      />
      <SideTabs
        tabs={DETAIL_PANELS}
        selected={panel}
        onSelect={setPanel}
        label="Book detail views"
      >
        {panel === "events" ? (
          <EventTable
            events={events}
            sideNames={sideNames}
            activeEvent={highlight.activeEvent}
            onPick={highlight.onPickEvent}
            onHover={highlight.onHoverEvent}
          />
        ) : (
          <div className="dv-dot-panel">
            <div className="dv-dot-option">
              <label className="dv-check">
                <input
                  type="checkbox"
                  checked={magnify}
                  onChange={(event) => setMagnify(event.target.checked)}
                />
                Magnify offsets
              </label>
              <InfoTip
                label="Dot plot explanation"
                text={dotPlotExplanation(sideNames, magnify, magnification)}
              >
                <InfoIcon />
              </InfoTip>
            </div>
            <DotPlot
              runs={scoped}
              index={index}
              magnify={magnify}
              highlight={runHighlight}
            />
          </div>
        )}
      </SideTabs>
    </div>
  );
}

/**
 * Explanation of the dot plot, opened from the info control beside Magnify offsets.
 * The magnified form names the factor. The true-scale form says small offsets can be hard to see.
 */
function dotPlotExplanation(
  sideNames: { a: string; b: string },
  magnify: boolean,
  magnification: number,
): string {
  const axes = `x is the ${sideNames.a} position and y is the ${sideNames.b} position`;
  if (magnify) {
    return `${axes}. Distance from the dashed diagonal is magnified about ${Math.round(magnification)}× for this book, so single-verse offsets show. On the dashed line the two numberings are in step. Steps and runs off the line are divergences. Margin ticks are verses on one side only. Click a run to inspect it.`;
  }
  return `${axes}, at true scale. The dashed line is the proportional diagonal. Steps, gaps, and marks off the line are divergences, and small ones can be hard to see without magnification. Margin ticks are verses on one side only. Click a run to inspect it.`;
}

/**
 * Zoom shown beside the slider. A wheel zoom is fractional, so values below 10 keep one
 * decimal (``3.7``) and drop a trailing ``.0``. Larger values are whole numbers.
 */
function formatZoom(zoom: number): string {
  return zoom < 10 ? zoom.toFixed(1).replace(/\.0$/, "") : String(Math.round(zoom));
}
