import { useState } from "react";
import { ModalShell } from "./ModalShell";
import { FieldErrorList, useModalSubmit } from "./modalHelpers";

/** Props for rename dialogs on translations or versifications. */
export interface RenameModalProps {
  /** Resource display name shown as the initial field value. */
  initialName: string;
  /** Dialog title (for example ``Rename translation``). */
  title: string;
  onClose: () => void;
  /** Persist the new name; throw ApiError on failure. */
  onRename: (name: string) => Promise<void>;
}

/**
 * Rename a translation or versification via PATCH.
 * Shows envelope ``errors`` when the server rejects the name.
 */
export function RenameModal({ initialName, title, onClose, onRename }: RenameModalProps) {
  const [name, setName] = useState(initialName);
  const { submitting, message, fieldErrors, run } = useModalSubmit();

  return (
    <ModalShell title={title} onClose={onClose}>
      <form
        onSubmit={(event) =>
          void run(event, async () => {
            await onRename(name.trim());
            onClose();
          })
        }
      >
        <label>
          Name
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
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
            disabled={submitting || name.trim().length === 0}
          >
            Save
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
