import { useState } from "react";
import { ingestProject } from "../../api/ingest";
import { ModalShell } from "./ModalShell";
import { FieldErrorList, useModalSubmit } from "./modalHelpers";

/** Props for the project-zip upload dialog. */
export interface UploadProjectModalProps {
  onClose: () => void;
  /** Called after a successful ``201`` ingest; may be async (e.g. catalog reload). */
  onSuccess: () => void | Promise<void>;
}

/**
 * Upload a Paratext-style project zip (USX + custom.vrs).
 * Blocks the UI on the synchronous ingest request.
 */
export function UploadProjectModal({ onClose, onSuccess }: UploadProjectModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("");
  const { submitting, message, fieldErrors, run } = useModalSubmit();

  return (
    <ModalShell title="Upload project" onClose={onClose}>
      <form
        onSubmit={(event) =>
          void run(event, async () => {
            if (!file) {
              throw new Error("Choose a project zip file");
            }
            await ingestProject(file, {
              name: name.trim() || undefined,
              language: language.trim() || undefined,
            });
            await onSuccess();
          })
        }
      >
        <label>
          Project zip
          <input
            type="file"
            accept=".zip,application/zip"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <label>
          Translation name (optional)
          <span className="muted field-hint">
            Initialized from metadata.xml when omitted
          </span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          Language (optional)
          <span className="muted field-hint">
            Initialized from metadata.xml when omitted
          </span>
          <input
            type="text"
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
          />
        </label>
        {message && <p className="error-text">{message}</p>}
        <FieldErrorList errors={fieldErrors} />
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn primary"
            disabled={submitting || !file}
          >
            {submitting ? "Uploading…" : "Upload"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
