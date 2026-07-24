import { useState } from "react";
import { Link } from "react-router-dom";
import { UploadProjectModal } from "../manage/modals/UploadProjectModal";

/** Props for the empty-state upload CTA panel. */
export interface EmptyStateUploadProps {
  /** Invoked after a successful project ingest so the session can reload. */
  onUploaded: () => void;
}

/**
 * Explanatory empty state when no translations exist.
 * Primary CTA opens the project upload modal; manage link is secondary.
 */
export function EmptyStateUpload({ onUploaded }: EmptyStateUploadProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="empty-state">
      <h2>Upload a translation project</h2>
      <p>
        Side-by-side viewing requires at least one Paratext-style project zip that
        includes USX scripture and a <code>custom.vrs</code> versification file.
      </p>
      <div className="empty-actions">
        <button type="button" className="btn primary" onClick={() => setOpen(true)}>
          Upload project
        </button>
        <Link to="/manage/versifications" className="btn ghost">
          Manage versifications
        </Link>
      </div>
      {open && (
        <UploadProjectModal
          onClose={() => setOpen(false)}
          onSuccess={() => {
            setOpen(false);
            onUploaded();
          }}
        />
      )}
    </div>
  );
}
