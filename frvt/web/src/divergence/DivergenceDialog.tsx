import { useCallback, useMemo, useRef, useState } from "react";
import { ModalShell } from "../manage/modals/ModalShell";
import { breakdown, type BreakdownScope } from "./breakdown";
import { ChartKey } from "./ChartKey";
import { comparisonTotal } from "./counts";
import { DetailView } from "./DetailView";
import { Donut } from "./Donut";
import { DonutKey } from "./DonutKey";
import { LAYER_HELP } from "./help";
import { InfoIcon } from "./InfoIcon";
import { InfoTip } from "./InfoTip";
import { Inspector } from "./Inspector";
import { layerToggleLabel } from "./layerLabel";
import { MatrixView, targetsFor } from "./MatrixView";
import { defaultBook } from "./model/detail";
import {
  coversWholeBook,
  eventSelection,
  hoverSelection,
  pickEvent as nextEventPick,
  pickRun as nextRunPick,
  type DetailPick,
  type MatrixSelection,
  type PickContext,
} from "./model/selection";
import { buildIndex, moveFocus, type IndexedEvent } from "./model/index";
import { RadialView } from "./RadialView";
import { ScopeActions } from "./ScopeActions";
import { ScopeHeading, scopeHeading } from "./ScopeHeading";
import { summarySentence } from "./summaryText";
import { LAYER_IDS } from "./taxonomy";
import { useDivergenceReport } from "./useDivergenceReport";

/** Props for the comparison opened from the viewer header. */
export interface DivergenceDialogProps {
  fromTranslationId: string;
  toTranslationId: string;
  fromSchemeId: string | null;
  toSchemeId: string | null;
  onClose: () => void;
}

type Tab = "overview" | "radial" | "detail";

/**
 * Full-screen comparison of the two open translations.
 * The donut follows the pinned chapter or book, or the whole report when nothing
 * is pinned. The heading above it follows the hover or the pin, and names every
 * deviance when neither is set. The book detail button sits under the event list,
 * and Clear selection joins it while a selection is pinned. A key under the chart
 * names the colors currently drawn, and a chart key under the toggles explains
 * the marks used in every view. An info control beside the title holds the
 * comparison sentence.
 * Layer toggles stay on the whole comparison, and add the pin's own share
 * while a cell is pinned.
 */
export function DivergenceDialog({
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
  const report = state.report;
  const comparison = report?.comparisons[0];
  const layerSet = useMemo(
    () => new Set(LAYER_IDS.filter((id) => layersOn[id] !== false)),
    [layersOn],
  );
  const index = useMemo(() => (report === null ? null : buildIndex(report)), [report]);
  const detailBookCode = useMemo(
    () => (index === null ? "" : (detailBook ?? defaultBook(index, layerSet))),
    [detailBook, index, layerSet],
  );
  const pickContext = useMemo<PickContext | null>(() => {
    if (index === null || comparison === undefined) {
      return null;
    }
    return { index, runs: comparison.runs, layersOn: layerSet, book: detailBookCode };
  }, [comparison, detailBookCode, index, layerSet]);
  const scope = useMemo(() => (pin === null ? null : pinScope(pin)), [pin]);
  const chart = useMemo(
    () => (report === null ? null : breakdown(report, scope, layersOn)),
    [report, scope, layersOn],
  );
  const shown = pin ?? hover;
  /**
   * Pin a cell from the matrix, the radial chart, or the arrow keys.
   * The selection is stored as given, so a radial ribbon keeps the event it names.
   * The strip highlight is cleared, so opening a book afterward does not keep a stale ribbon.
   */
  const pinChapter = (selection: MatrixSelection) => {
    setPin(selection);
    setRunKey(null);
  };
  /**
   * Store a detail pick.
   * A null result changes nothing. A pin in another book opens that book.
   * Clearing the pin also clears the keyboard focus.
   */
  const applyPick = useCallback(
    (next: DetailPick | null) => {
      if (next === null) {
        return;
      }
      setRunKey(next.runKey);
      setHover(null);
      setPin(next.pin);
      if (next.pin === null) {
        setFocus(null);
        return;
      }
      if (next.pin.bookCode !== detailBookCode) {
        setDetailBook(next.pin.bookCode);
      }
    },
    [detailBookCode],
  );
  /**
   * Highlight from the strip or the dot plot.
   * Clicking the highlighted run again clears it. An unknown or unchanged run does nothing.
   */
  const pickRun = useCallback(
    (key: string | null) => {
      if (pickContext === null) {
        return;
      }
      applyPick(nextRunPick(pickContext, { runKey, pin }, key));
    },
    [applyPick, pickContext, pin, runKey],
  );
  /**
   * Column contents while the pointer is over a ribbon or a dot mark.
   * A pin keeps the column on the selection. An unchanged run changes nothing.
   */
  const onHover = useCallback(
    (key: string) => {
      if (pinRef.current !== null || pickContext === null) {
        return;
      }
      const next = hoverSelection(pickContext, key);
      if (next !== null) {
        setHover(next);
      }
    },
    [pickContext],
  );
  /**
   * Column contents while the pointer is over a table row.
   * A pin keeps the column on the selection.
   */
  const onHoverEvent = useCallback(
    (event: IndexedEvent) => {
      if (pinRef.current !== null || index === null) {
        return;
      }
      const next = eventSelection(index, event, detailBookCode);
      if (next !== null) {
        setHover(next);
      }
    },
    [detailBookCode, index],
  );
  /**
   * Highlight from a table row.
   * The row's event is pinned even when no ribbon matches it. Clicking it again clears the pin.
   */
  const pickEventFromTable = useCallback(
    (event: IndexedEvent) => {
      if (pickContext === null) {
        return;
      }
      applyPick(nextEventPick(pickContext, { runKey, pin }, event));
    },
    [applyPick, pickContext, pin, runKey],
  );
  /**
   * Column title for this render.
   * Computed once so the heading and the buttons name the same book.
   */
  const heading =
    index === null || chart === null || comparison === undefined
      ? null
      : scopeHeading(
          shown,
          index,
          comparisonTotal(chart.layerStats),
          { a: comparison.a, b: comparison.b },
          layerSet,
        );

  /** Sentence for the info control, or the agreement line when the report has no events. */
  const summaryText =
    comparison === undefined || index === null
      ? null
      : comparison.events.length === 0
        ? "These versifications agree verse for verse."
        : summarySentence(index, layerSet, comparison);

  return (
    <ModalShell
      title="Divergences"
      titleExtra={
        summaryText === null ? null : (
          <InfoTip label="Comparison summary" text={summaryText}>
            <InfoIcon />
          </InfoTip>
        )
      }
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
          index !== null &&
          heading !== null && (
            <>
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
              <ChartKey index={index} showRibbons={tab === "radial"} />
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
                  className={tab === "detail" ? "dv-stage is-detail" : "dv-stage"}
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
                      book={detailBookCode}
                      sideNames={{ a: comparison.a, b: comparison.b }}
                      onBook={setDetailBook}
                      highlight={{
                        activeKey: runKey,
                        onPick: pickRun,
                        activeEvent: pin?.eventIndex ?? null,
                        onPickEvent: pickEventFromTable,
                        onHover,
                        onHoverEvent,
                      }}
                    />
                  )}
                </div>
                <aside className="dv-column">
                  <figure className="dv-summary">
                    <ScopeHeading
                      title={heading.title}
                      subtitle={heading.subtitle}
                      centered={heading.centered}
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
                  <ScopeActions
                    bookCode={heading.bookCode}
                    pinned={pin !== null}
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
