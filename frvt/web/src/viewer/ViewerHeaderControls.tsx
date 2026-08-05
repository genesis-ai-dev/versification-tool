import { createPortal } from "react-dom";
import { APP_HEADER_END_ID } from "../lib/appHeaderSlot";
import { useViewerSession } from "./ViewerSession";
import type { MapMode } from "./viewerUrl";

/**
 * Viewer-only header chrome portaled into the app nav bar.
 * Keeps mapping mode and resolve status out of the scripture workspace.
 */
export function ViewerHeaderControls() {
  const session = useViewerSession();
  const slot = document.getElementById(APP_HEADER_END_ID);
  if (!slot) {
    return null;
  }

  return createPortal(
    <>
      <label className="header-map-toggle">
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
      <div className="header-viewer-status" aria-live="polite">
        {session.resolveLoading && <span className="muted">Resolving…</span>}
        {session.chapterResolveLoading && (
          <span className="muted">Loading chapter mappings…</span>
        )}
      </div>
    </>,
    slot,
  );
}
