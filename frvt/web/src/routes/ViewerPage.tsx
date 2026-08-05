import { EmptyStateUpload } from "../viewer/EmptyStateUpload";
import { ViewerHeaderControls } from "../viewer/ViewerHeaderControls";
import { ViewerSessionProvider, useViewerSession } from "../viewer/ViewerSession";
import { ViewerWorkspace } from "../viewer/ViewerWorkspace";

/** Viewer route with URL-owned session state. */
export function ViewerPage() {
  return (
    <ViewerSessionProvider>
      <ViewerContent />
    </ViewerSessionProvider>
  );
}

/** Choose empty, authentication, or two-column viewer content. */
function ViewerContent() {
  const session = useViewerSession();

  if (session.authRequired) {
    return (
      <div className="banner auth-banner">
        Authentication required — reload and sign in.
      </div>
    );
  }

  return (
    <section className="viewer-page">
      {session.errorBanner && (
        <div className="banner error-banner" role="alert">
          {session.errorBanner}
        </div>
      )}
      {session.translationTotal === 0 ? (
        <EmptyStateUpload onUploaded={() => session.refreshCatalogs()} />
      ) : (
        <>
          <ViewerHeaderControls />
          <ViewerWorkspace />
        </>
      )}
    </section>
  );
}
