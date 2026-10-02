import { lazy, Suspense, useState } from "react";
import { createPortal } from "react-dom";
import { divergenceLauncherEnabled } from "../divergence/launcher";
import { pairHeading, type PairSide } from "../divergence/pairHeading";
import { APP_HEADER_END_ID } from "../lib/appHeaderSlot";
import { useViewerSession } from "./ViewerSession";
import type { MapMode } from "./viewerUrl";

const DivergenceDialog = lazy(() =>
  import("../divergence/DivergenceDialog").then((module) => ({
    default: module.DivergenceDialog,
  })),
);

/**
 * One heading column from the catalogs currently loaded in the session.
 * A missing translation or versification row leaves the name null so the heading can fall back to the id.
 */
function headingSide(
  translationId: string,
  schemeId: string | null,
  translations: readonly { id: string; name: string }[],
  versifications: readonly { id: string; name: string }[],
): PairSide {
  return {
    translationId,
    translationName: translations.find((item) => item.id === translationId)?.name ?? null,
    schemeId,
    schemeName:
      schemeId === null || schemeId === ""
        ? null
        : (versifications.find((item) => item.id === schemeId)?.name ?? null),
  };
}

/**
 * Viewer-only header chrome portaled into the app nav bar.
 * Mapping mode, the comparison launcher, and resolve status stay out of the scripture workspace.
 */
export function ViewerHeaderControls() {
  const session = useViewerSession();
  const [divergenceOpen, setDivergenceOpen] = useState(false);
  const slot = document.getElementById(APP_HEADER_END_ID);
  if (!slot) {
    return null;
  }

  const divergenceEnabled = divergenceLauncherEnabled(
    session.canResolve,
    session.url.leftVers,
    session.url.rightVers,
    session.associationsFor("left"),
    session.associationsFor("right"),
  );
  const left = session.url.left;
  const right = session.url.right;

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
      <button
        type="button"
        className="btn header-divergence"
        disabled={!divergenceEnabled}
        title={
          divergenceEnabled ? undefined : "Select two translations with versifications."
        }
        onClick={() => setDivergenceOpen(true)}
      >
        Divergence
      </button>
      <div className="header-viewer-status" aria-live="polite">
        {session.resolveLoading && <span className="muted">Resolving…</span>}
        {session.chapterResolveLoading && (
          <span className="muted">Loading chapter mappings…</span>
        )}
      </div>
      {divergenceOpen && left !== null && right !== null && (
        <Suspense fallback={null}>
          <DivergenceDialog
            pairLabel={pairHeading(
              headingSide(
                left,
                session.url.leftVers,
                session.translations,
                session.versifications,
              ),
              headingSide(
                right,
                session.url.rightVers,
                session.translations,
                session.versifications,
              ),
            )}
            fromTranslationId={left}
            toTranslationId={right}
            fromSchemeId={session.url.leftVers}
            toSchemeId={session.url.rightVers}
            onClose={() => setDivergenceOpen(false)}
          />
        </Suspense>
      )}
    </>,
    slot,
  );
}
