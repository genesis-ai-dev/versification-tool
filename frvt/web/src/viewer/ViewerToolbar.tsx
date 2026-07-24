import { useViewerSession } from "./ViewerSession";

/**
 * Toolbar showing the active pair context and the mapping overlay toggle.
 * Toggle only affects the current ResolveResult drawing — not chapter deltas.
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
        <span className="muted">drive: {session.url.drive}</span>
      </div>
      <label className="map-toggle">
        <input
          type="checkbox"
          checked={session.url.map}
          disabled={!session.canResolve}
          onChange={(event) => session.setMapEnabled(event.target.checked)}
        />
        Show mapping
      </label>
    </div>
  );
}
