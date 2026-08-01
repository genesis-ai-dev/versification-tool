import {
  parseViewerSearch,
  serializeViewerSearch,
  type ViewerUrlState,
} from "./viewerUrl";

/** ``localStorage`` key for the last serialized viewer URL search string. */
export const VIEWER_STORAGE_KEY = "frvt.viewerSession";

/**
 * Persist the viewer search string for restore on bare ``/`` navigation.
 * Swallows storage errors (private mode, quota) so the viewer keeps working.
 */
export function saveViewerSearch(search: string): void {
  try {
    localStorage.setItem(VIEWER_STORAGE_KEY, search);
  } catch {
    // Storage unavailable or full — URL remains the runtime source of truth.
  }
}

/**
 * Read the last persisted viewer search string, or ``null`` when absent or unreadable.
 */
export function loadViewerSearch(): string | null {
  try {
    const raw = localStorage.getItem(VIEWER_STORAGE_KEY);
    return raw && raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

/**
 * True when the URL already names at least one translation column explicitly.
 * Used to decide whether ``localStorage`` should seed the session on mount.
 */
export function hasExplicitViewerParams(search: string): boolean {
  const params = parseViewerSearch(search);
  return params.left !== null || params.right !== null;
}

/** Options for validating persisted ids against the live catalog. */
export interface SanitizeViewerSearchOptions {
  /** Translation ids currently listed in ``GET /api/translations``. */
  translationIds: ReadonlySet<string>;
  /** Versification scheme ids currently listed in ``GET /api/versifications``. */
  versificationIds: ReadonlySet<string>;
}

/**
 * Drop translation and versification ids that no longer exist in the catalog.
 * Returns a serialized search string safe to apply after ingest deletes or renames.
 */
export function sanitizeViewerSearch(
  search: string,
  options: SanitizeViewerSearchOptions,
): string {
  const parsed = parseViewerSearch(search);
  const next: ViewerUrlState = { ...parsed };

  if (next.left && !options.translationIds.has(next.left)) {
    next.left = null;
  }
  if (next.right && !options.translationIds.has(next.right)) {
    next.right = null;
  }
  if (next.leftVers && !options.versificationIds.has(next.leftVers)) {
    next.leftVers = null;
  }
  if (next.rightVers && !options.versificationIds.has(next.rightVers)) {
    next.rightVers = null;
  }

  return serializeViewerSearch(next);
}
