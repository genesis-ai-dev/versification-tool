import { useEffect, useState } from "react";
import { createAssociation } from "../../api/associations";
import { listVersifications } from "../../api/versifications";
import type { VersificationOut } from "../../api/types";
import { ModalShell } from "./ModalShell";
import { FieldErrorList, useModalSubmit } from "./modalHelpers";

/** Props for associating a scheme with a translation. */
export interface AssociateModalProps {
  translationId: string;
  translationName: string;
  /** Scheme ids already associated (excluded from the picker). */
  existingSchemeIds: string[];
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * Associate an existing versification scheme with a translation.
 * Preferred status is unchanged; use the preferred action separately.
 */
export function AssociateModal({
  translationId,
  translationName,
  existingSchemeIds,
  onClose,
  onSuccess,
}: AssociateModalProps) {
  const [schemes, setSchemes] = useState<VersificationOut[]>([]);
  const [schemeId, setSchemeId] = useState("");
  const { submitting, message, fieldErrors, run } = useModalSubmit();

  useEffect(() => {
    void listVersifications()
      .then((page) => {
        const available = page.items.filter((s) => !existingSchemeIds.includes(s.id));
        setSchemes(available);
        if (available[0]) {
          setSchemeId(available[0].id);
        }
      })
      .catch(() => setSchemes([]));
  }, [existingSchemeIds]);

  return (
    <ModalShell title={`Associate scheme — ${translationName}`} onClose={onClose}>
      <form
        onSubmit={(event) =>
          void run(event, async () => {
            await createAssociation(translationId, schemeId);
            onSuccess();
            onClose();
          })
        }
      >
        <label>
          Versification
          <select
            value={schemeId}
            onChange={(event) => setSchemeId(event.target.value)}
            required
          >
            {schemes.length === 0 && <option value="">No schemes available</option>}
            {schemes.map((scheme) => (
              <option key={scheme.id} value={scheme.id}>
                {scheme.name}
                {scheme.canonical ? " (canonical)" : ""}
              </option>
            ))}
          </select>
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
            disabled={submitting || !schemeId}
          >
            Associate
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
