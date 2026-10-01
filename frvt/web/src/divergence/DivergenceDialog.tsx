import { useMemo, useRef, useState } from "react";
import { ModalShell } from "../manage/modals/ModalShell";
import { breakdown } from "./breakdown";
import { DetailView } from "./DetailView";
import { Donut } from "./Donut";
import { displayNote, LAYER_HELP } from "./help";
import { InfoTip } from "./InfoTip";
import { Inspector } from "./Inspector";
import { MatrixView, targetsFor, type MatrixSelection } from "./MatrixView";
import { moveFocus } from "./model/index";
import { buildIndex } from "./model/index";
import { RadialView } from "./RadialView";
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
 * The donut follows the pinned book, or the whole report when nothing is pinned.
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
  const chart = useMemo(
    () =>
      report === null
        ? null
        : breakdown(report, pin?.bookCode ?? null, layersOn, countVerses),
    [report, pin, layersOn, countVerses],
  );
  const shown = pin ?? hover;

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
              <p className="dv-note">{displayNote(comparison.note, report.sides)}</p>
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
                  Book detail
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
                      {layer.label}{" "}
                      {layer.count === 0
                        ? "None in this comparison."
                        : `${layer.count} (${Math.round(layer.percent)}%)`}
                    </label>
                    <InfoTip
                      label={`${layer.label} explanation`}
                      text={LAYER_HELP[layer.id]}
                    >
                      ?
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
                        setPin({
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
                    }
                  }}
                >
                  {tab === "overview" && (
                    <MatrixView
                      index={index}
                      layersOn={layerSet}
                      focus={focus}
                      onSelect={(selection) => {
                        setPin(selection);
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
                      onSelect={(selection) => setPin(selection)}
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
                    />
                  )}
                </div>
                <aside>
                  <Donut
                    layers={chart.layers}
                    types={chart.types}
                    scope={pin === null ? "this comparison" : "this book"}
                  />
                  <Inspector
                    index={index}
                    selection={shown}
                    layersOn={layerSet}
                    notes={report.eventNotes}
                    sideNames={{ a: comparison.a, b: comparison.b }}
                    onOpenBook={(code) => {
                      setDetailBook(code);
                      setTab("detail");
                    }}
                    onClear={() => {
                      setPin(null);
                      setHover(null);
                      setFocus(null);
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
