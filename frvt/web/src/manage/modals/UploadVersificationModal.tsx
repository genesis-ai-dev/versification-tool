import { useState } from "react";
import { uploadVersification } from "../../api/versifications";
import { ModalShell } from "./ModalShell";
import { FieldErrorList, useModalSubmit } from "./modalHelpers";

/** Props for the standalone versification upload dialog. */
export interface UploadVersificationModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * Upload a VRS or Copenhagen/Burrito versification file.
 * Creates an unassociated scheme; associate separately afterward.
 */
export function UploadVersificationModal({
  onClose,
  onSuccess,
}: UploadVersificationModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const { submitting, message, fieldErrors, run } = useModalSubmit();

  return (
    <ModalShell title="Upload versification" onClose={onClose}>
      <form
        onSubmit={(event) =>
          void run(event, async () => {
            if (!file) {
              throw new Error("Choose a versification file");
            }
            await uploadVersification(file, name.trim() || undefined);
            onSuccess();
          })
        }
      >
        <label>
          Versification file
          <input
            type="file"
            accept=".vrs,.json,application/json"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <label>
          Display name (optional)
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Defaults to the file name"
          />
        </label>
        {message && <p className="error-text">{message}</p>}
        <FieldErrorList errors={fieldErrors} />
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={submitting || !file}>
            {submitting ? "Uploading…" : "Upload"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
