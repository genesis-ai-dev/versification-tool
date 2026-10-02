import { useCallback, useMemo, useRef, useState } from "react";
import { ModalShell } from "../manage/modals/ModalShell";
import { breakdown, type BreakdownScope } from "./breakdown";
import { comparisonTotal } from "./counts";
import { DetailView } from "./DetailView";
import { Donut } from "./Donut";
import { DonutKey } from "./DonutKey";
import { LAYER_HELP } from "./help";
import { InfoIcon } from "./InfoIcon";
import { InfoTip } from "./InfoTip";
import { Inspector } from "./Inspector";
import { layerToggleLabel } from "./layerLabel";
import {
  coversWholeBook,
  MatrixView,
  targetsFor,
  type MatrixSelection,
} from "./MatrixView";
import { runPlace, runKey as keyOfRun, runSelectable, scopeRuns } from "./model/detail";
import { buildIndex, moveFocus } from "./model/index";
import { RadialView } from "./RadialView";
import { ScopeHeading, scopeHeading } from "./ScopeHeading";
import { LAYER_IDS } from "./taxonomy";
import { useDivergenceReport } from "./useDivergenceReport";

/** Props for the comparison opened from the viewer header. */
export interface DivergenceDialogProps {
  /** Source and target names with the versification each column is using. */
  pairLabel: string;
  fromTranslationId: string;
  toTranslationId: string;
  fromSchemeId: string | null;
  toSchemeId: string | null;
  onClose: () => void;
}

type Tab = "overview" | "radial" | "detail";

/**
 * Full-screen comparison of the two open translations.
 * The line under the title names those translations and the versification each column uses.
 * The donut follows the pinned chapter or book, or the whole report when nothing
 * is pinned. The heading above it follows the hover or the pin, and names every
 * deviance when neither is set. A key under the chart names the colors currently
 * drawn. Layer toggles stay on the whole comparison, and add the pin's own share
 * while a cell is pinned.
 */
export function DivergenceDialog({
  pairLabel,
  fromTranslationId,
  toTranslationId,
  fromSchemeId,
  toSchemeId,
  onClose,
}: DivergenceDialogProps) {
  const state = useDivergenceReport(
    fromTranslationId,
    toTranslationId,
    fromSchemeId,
    toSchemeId,
    true,
  );
  const [pin, setPin] = useState<MatrixSelection | null>(null);
  const [hover, setHover] = useState<MatrixSelection | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [layout, setLayout] = useState<"slices" | "rings">("slices");
  const [detailBook, setDetailBook] = useState<string | null>(null);
  const [runKey, setRunKey] = useState<string | null>(null);
  const pinRef = useRef(pin);
  pinRef.current = pin;
  const [layersOn, setLayersOn] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(LAYER_IDS.map((id) => [id, true])),
  );
  const [countVerses, setCountVerses] = useState(false);
  const report = state.report;
  const comparison = report?.comparisons[0];
  const layerSet = useMemo(
    () => new Set(LAYER_IDS.filter((id) => layersOn[id] !== false)),
    [layersOn],
  );
  const index = useMemo(() => (report === null ? null : buildIndex(report)), [report]);
  const scope = useMemo(() => (pin === null ? null : pinScope(pin)), [pin]);
  const chart = useMemo(
    () => (report === null ? null : breakdown(report, scope, layersOn, countVerses)),
    [report, scope, layersOn, countVerses],
  );
  const shown = pin ?? hover;
  /**
   * Pin a chapter from the matrix, the radial chart, or the arrow keys.
   * Those selections have no verse heading, so the strip highlight is cleared too.
   */
  const pinChapter = (selection: MatrixSelection) => {
    setPin(selection);
    setRunKey(null);
  };
  /**
   * Highlight from the strip, the dot plot, or the table.
   * A placed run pins its chapter and shows the verse heading. A run with no
   * span only toggles the highlight. An unknown key or an unchanged run does
   * nothing. Passing the active key again clears a placed pin.
   */
  const pickRun = useCallback(
    (key: string | null) => {
      if (index === null || comparison === undefined) {
        return;
      }
      const books =
        detailBook !== null ? [detailBook] : index.books.map((item) => item.code);
      const findRun = (wanted: string | null) => {
        if (wanted === null) {
          return undefined;
        }
        for (const code of books) {
          const found = scopeRuns(index, comparison.runs, code, layerSet).find(
            (run) => keyOfRun(run) === wanted,
          );
          if (found !== undefined) {
            return found;
          }
        }
        return undefined;
      };
      if (key === null) {
        return;
      }
      const match = findRun(key);
      if (match === undefined || !runSelectable(match)) {
        return;
      }
      if (key === runKey) {
        setRunKey(null);
        if (runPlace(index, match) !== null) {
          setPin(null);
          setHover(null);
          setFocus(null);
        }
        return;
      }
      setRunKey(key);
      const place = runPlace(index, match);
      if (place === null) {
        return;
      }
      if (place.bookCode !== detailBook) {
        setDetailBook(place.bookCode);
      }
      setHover(null);
      setPin({
        bookCode: place.bookCode,
        chapter: place.chapter,
        summary: false,
        verseLabel: place.title,
      });
    },
    [comparison, detailBook, index, layerSet, runKey],
  );

  return (
    <ModalShell
      title="Divergence"
      onClose={onClose}
      size="fullscreen"
      onEscape={() => {
        if (pinRef.current === null) {
          return false;
        }
        setPin(null);
        setFocus(null);
        setRunKey(null);
        return true;
      }}
    >
      <div className="dv-root">
        {state.error !== null && (
          <p className="banner error-banner" role="alert">
            {state.error}{" "}
            <button type="button" className="btn" onClick={state.retry}>
              Retry
            </button>
          </p>
        )}
        {report === null && state.error === null && (
          <div className="dv-loading" role="status">
            <p>
              {state.status === null
                ? "Starting comparison…"
                : `Working — ${state.status.stage ?? "queued"} (${state.status.stage_index} of ${state.status.stage_count})`}
            </p>
            {state.status !== null && state.status.total > 0 && (
              <progress value={state.status.completed} max={state.status.total} />
            )}
          </div>
        )}
        {report !== null &&
          comparison !== undefined &&
          chart !== null &&
          index !== null && (
            <>
              <p className="dv-note">{pairLabel}</p>
              {comparison.events.length === 0 && (
                <p className="dv-note">These versifications agree verse for verse.</p>
              )}
              <div className="dv-controls">
                <button
                  type="button"
                  className="btn"
                  aria-pressed={tab === "overview"}
                  onClick={() => setTab("overview")}
                >
                  Overview
                </button>
                <button
                  type="button"
                  className="btn"
                  aria-pressed={tab === "radial"}
                  onClick={() => setTab("radial")}
                >
                  Radial
                </button>
                <button
                  type="button"
                  className="btn"
                  aria-pressed={tab === "detail"}
                  onClick={() => setTab("detail")}
                >
                  Details
                </button>
                <button
                  type="button"
                  className="btn"
                  aria-pressed={!countVerses}
                  onClick={() => setCountVerses(false)}
                >
                  Events
                </button>
                <button
                  type="button"
                  className="btn"
                  aria-pressed={countVerses}
                  onClick={() => setCountVerses(true)}
                >
                  Verses affected
                </button>
                {chart.layerStats.map((layer) => (
                  <span key={layer.id} className="dv-layer">
                    <label>
                      <input
                        type="checkbox"
                        checked={layersOn[layer.id] !== false}
                        disabled={layer.count === 0}
                        onChange={() =>
                          setLayersOn((current) => ({
                            ...current,
                            [layer.id]: current[layer.id] === false,
                          }))
                        }
                      />
                      {layerToggleLabel(
                        layer.label,
                        layer,
                        chart.selectionStats?.find((item) => item.id === layer.id) ??
                          null,
                      )}
                    </label>
                    <InfoTip
                      label={`${layer.label} explanation`}
                      text={LAYER_HELP[layer.id]}
                    >
                      <InfoIcon />
                    </InfoTip>
                  </span>
                ))}
              </div>
              {tab === "radial" && (
                <div className="dv-controls">
                  <button
                    type="button"
                    className="btn"
                    aria-pressed={layout === "slices"}
                    onClick={() => setLayout("slices")}
                  >
                    Chapters as slices
                  </button>
                  <button
                    type="button"
                    className="btn"
                    aria-pressed={layout === "rings"}
                    onClick={() => setLayout("rings")}
                  >
                    Chapters as rings
                  </button>
                </div>
              )}
              <div className="dv-layout">
                <div
                  className="dv-stage"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (tab !== "overview" || index === null) {
                      return;
                    }
                    const targets = targetsFor(index, layerSet);
                    if (
                      event.key === "ArrowRight" ||
                      event.key === "ArrowLeft" ||
                      event.key === "ArrowDown" ||
                      event.key === "ArrowUp"
                    ) {
                      event.preventDefault();
                      const delta =
                        event.key === "ArrowRight"
                          ? [0, 1]
                          : event.key === "ArrowLeft"
                            ? [0, -1]
                            : event.key === "ArrowDown"
                              ? [1, 0]
                              : [-1, 0];
                      const next = moveFocus(targets, focus, delta[0], delta[1]);
                      setFocus(next);
                      const target = next === null ? undefined : targets[next];
                      if (target !== undefined) {
                        pinChapter({
                          bookCode: target.bookCode,
                          chapter: target.chapter,
                          summary: false,
                        });
                      }
                    }
                    if (event.key === "Enter" && focus !== null) {
                      const target = targets[focus];
                      if (target !== undefined) {
                        setDetailBook(target.bookCode);
                        setTab("detail");
                      }
                    }
                    if (event.key === "Escape") {
                      event.stopPropagation();
                      setPin(null);
                      setFocus(null);
                      setRunKey(null);
                    }
                  }}
                >
                  {tab === "overview" && (
                    <MatrixView
                      index={index}
                      layersOn={layerSet}
                      focus={focus}
                      onSelect={(selection) => {
                        pinChapter(selection);
                        setHover(null);
                        const next = targetsFor(index, layerSet).findIndex(
                          (target) =>
                            target.bookCode === selection.bookCode &&
                            target.chapter === selection.chapter,
                        );
                        if (next >= 0) {
                          setFocus(next);
                        }
                      }}
                      onHover={(selection) => {
                        if (pinRef.current === null) {
                          setHover(selection);
                        }
                      }}
                    />
                  )}
                  {tab === "radial" && (
                    <RadialView
                      index={index}
                      layersOn={layerSet}
                      layout={layout}
                      pinned={pin !== null}
                      onSelect={(selection) => pinChapter(selection)}
                      onHover={(selection) => {
                        if (pinRef.current === null) {
                          setHover(selection);
                        }
                      }}
                    />
                  )}
                  {tab === "detail" && (
                    <DetailView
                      index={index}
                      runs={comparison.runs}
                      org={report.org ?? {}}
                      layersOn={layerSet}
                      book={detailBook}
                      sideNames={{ a: comparison.a, b: comparison.b }}
                      onBook={setDetailBook}
                      highlight={{ activeKey: runKey, onPick: pickRun }}
                    />
                  )}
                </div>
                <aside>
                  <figure className="dv-summary">
                    <ScopeHeading
                      {...scopeHeading(shown, index, comparisonTotal(chart.layerStats))}
                      showDetails={tab !== "detail"}
                      onOpenBook={(code) => {
                        setDetailBook(code);
                        setTab("detail");
                      }}
                      onClear={() => {
                        setPin(null);
                        setHover(null);
                        setFocus(null);
                        setRunKey(null);
                      }}
                    />
                    <Donut
                      layers={chart.layers}
                      types={chart.types}
                      scope={pinScopeLabel(pin)}
                    />
                  </figure>
                  <DonutKey layers={chart.layers} types={chart.types} />
                  <Inspector
                    index={index}
                    selection={shown}
                    layersOn={layerSet}
                    notes={report.eventNotes}
                    sideNames={{ a: comparison.a, b: comparison.b }}
                  />
                </aside>
              </div>
            </>
          )}
      </div>
    </ModalShell>
  );
}

/**
 * The cell the donut and the selection counts follow.
 * A book summary, or a pin without a chapter, covers the whole book.
 */
function pinScope(pin: MatrixSelection): BreakdownScope {
  return {
    book: pin.bookCode,
    chapter: coversWholeBook(pin) ? null : pin.chapter,
  };
}

/**
 * Donut tip scope for the current pin.
 * Slice tips and the empty message use this wording.
 */
function pinScopeLabel(pin: MatrixSelection | null): string {
  if (pin === null) {
    return "this comparison";
  }
  return pinScope(pin).chapter === null ? "this book" : "this chapter";
}
