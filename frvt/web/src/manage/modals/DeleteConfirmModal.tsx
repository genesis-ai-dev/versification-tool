import { ModalShell } from "./ModalShell";
import { FieldErrorList, useModalSubmit } from "./modalHelpers";

/** Props for confirm-delete (resource) and confirm-remove (association). */
export interface DeleteConfirmModalProps {
  /** Dialog title. */
  title: string;
  /** Confirm body explaining the irreversible action. */
  message: string;
  /** Confirm button label (defaults to Delete). */
  confirmLabel?: string;
  onClose: () => void;
  /** Perform the delete/remove; throw ApiError on failure. */
  onConfirm: () => Promise<void>;
}

/**
 * Confirm deletion of a translation/versification or association removal.
 * Preferred associations should not open this modal (UI disables that action).
 */
export function DeleteConfirmModal({
  title,
  message,
  confirmLabel = "Delete",
  onClose,
  onConfirm,
}: DeleteConfirmModalProps) {
  const { submitting, message: errorMessage, fieldErrors, run } = useModalSubmit();

  return (
    <ModalShell title={title} onClose={onClose}>
      <form
        onSubmit={(event) =>
          void run(event, async () => {
            await onConfirm();
            onClose();
          })
        }
      >
        <p>{message}</p>
        {errorMessage && <p className="error-text">{errorMessage}</p>}
        <FieldErrorList errors={fieldErrors} />
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn danger" disabled={submitting}>
            {submitting ? "Working…" : confirmLabel}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
