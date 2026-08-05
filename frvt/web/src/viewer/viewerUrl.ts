import type { ColumnBcv } from "../lib/bcv";
import type { DriveSide } from "./overlay/drawPlan";

/** Overlay visibility mode encoded in the ``map`` URL param. */
export type MapMode = "off" | "current" | "chapter";

/** URL-owned viewer session fields (bookmarkable source of truth). */
export interface ViewerUrlState {
  left: string | null;
  right: string | null;
  leftBcv: ColumnBcv | null;
  rightBcv: ColumnBcv | null;
  leftVers: string | null;
  rightVers: string | null;
  drive: DriveSide;
  mapMode: MapMode;
}

/**
 * Parse viewer URL search params into structured session state.
 * Missing optional fields become null/defaults rather than inventing BCV.
 */
export function parseViewerSearch(search: string): ViewerUrlState {
  const params = new URLSearchParams(search);
  return {
    left: emptyToNull(params.get("left")),
    right: emptyToNull(params.get("right")),
    leftBcv: parseBcv(params, "lb", "lc", "lv", "lp"),
    rightBcv: parseBcv(params, "rb", "rc", "rv", "rp"),
    leftVers: emptyToNull(params.get("lvers")),
    rightVers: emptyToNull(params.get("rvers")),
    drive: params.get("drive") === "right" ? "right" : "left",
    mapMode: parseMapMode(params.get("map")),
  };
}

/**
 * Serialize viewer session state into URL search params.
 * Omits empty optional fields so preferred-scheme fallbacks stay implicit.
 */
export function serializeViewerSearch(state: ViewerUrlState): string {
  const params = new URLSearchParams();
  if (state.left) {
    params.set("left", state.left);
  }
  if (state.right) {
    params.set("right", state.right);
  }
  writeBcv(params, state.leftBcv, "lb", "lc", "lv", "lp");
  writeBcv(params, state.rightBcv, "rb", "rc", "rv", "rp");
  if (state.leftVers) {
    params.set("lvers", state.leftVers);
  }
  if (state.rightVers) {
    params.set("rvers", state.rightVers);
  }
  params.set("drive", state.drive);
  params.set("map", serializeMapMode(state.mapMode));
  return params.toString();
}

/** Parse ``map`` query values into the three-mode overlay contract. */
export function parseMapMode(raw: string | null): MapMode {
  if (raw === "0") {
    return "off";
  }
  if (raw === "all") {
    return "chapter";
  }
  return "current";
}

/** Serialize ``MapMode`` to ``map=0|1|all``. */
export function serializeMapMode(mode: MapMode): string {
  if (mode === "off") {
    return "0";
  }
  if (mode === "chapter") {
    return "all";
  }
  return "1";
}

/** Read structured BCV from four URL keys; null when book/chapter/verse missing. */
function parseBcv(
  params: URLSearchParams,
  bookKey: string,
  chapterKey: string,
  verseKey: string,
  partKey: string,
): ColumnBcv | null {
  const book = emptyToNull(params.get(bookKey));
  const chapterRaw = params.get(chapterKey);
  const verseRaw = params.get(verseKey);
  if (!book || chapterRaw === null || verseRaw === null) {
    return null;
  }
  const chapter = Number(chapterRaw);
  const verse = Number(verseRaw);
  if (!Number.isFinite(chapter) || !Number.isFinite(verse)) {
    return null;
  }
  const part = emptyToNull(params.get(partKey));
  return { book, chapter, verse, part };
}

/** Write structured BCV into URL params when present. */
function writeBcv(
  params: URLSearchParams,
  bcv: ColumnBcv | null,
  bookKey: string,
  chapterKey: string,
  verseKey: string,
  partKey: string,
): void {
  if (!bcv) {
    return;
  }
  params.set(bookKey, bcv.book);
  params.set(chapterKey, String(bcv.chapter));
  params.set(verseKey, String(bcv.verse));
  if (bcv.part) {
    params.set(partKey, bcv.part);
  }
}

/** Treat empty strings as absent URL values. */
function emptyToNull(value: string | null): string | null {
  return value && value.length > 0 ? value : null;
}

/**
 * Patch helper for immutable URL state updates from column chrome.
 * Prefer this over mutating ``URLSearchParams`` ad hoc in components.
 */
export function patchViewerUrl(
  current: ViewerUrlState,
  patch: Partial<ViewerUrlState>,
): ViewerUrlState {
  return { ...current, ...patch };
}
