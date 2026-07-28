import { useViewerSession } from "./ViewerSession";
import type { MapMode } from "./viewerUrl";

/**
 * Toolbar showing the active pair context and the mapping overlay mode select.
 * Chapter mode loads in-column alignments without the jump menu.
 */
export function ViewerToolbar() {
  const session = useViewerSession();
  const leftName =
    session.translations.find((t) => t.id === session.url.left)?.name ?? "—";
  const rightName =
    session.translations.find((t) => t.id === session.url.right)?.name ?? "—";

  return (
    <div className="viewer-toolbar">
      <div className="pair-context" aria-live="polite">
        <span>{leftName}</span>
        <span className="muted">↔</span>
        <span>{rightName}</span>
        {session.resolveLoading && <span className="muted">Resolving…</span>}
        {session.chapterResolveLoading && (
          <span className="muted">Loading chapter mappings…</span>
        )}
        <span className="muted">drive: {session.url.drive}</span>
      </div>
      <label className="map-toggle">
        Mapping
        <select
          aria-label="Mapping"
          value={session.url.mapMode}
          disabled={!session.canResolve}
          onChange={(event) => session.setMapMode(event.target.value as MapMode)}
        >
          <option value="off">Hidden</option>
          <option value="current">Current</option>
          <option value="chapter">All (dimmed)</option>
        </select>
      </label>
    </div>
  );
}
