import { useCallback, useEffect, useState } from "react";
import { ApiError, describeApiError } from "../api/errors";
import type { VersificationOut } from "../api/types";
import {
  deleteVersification,
  listVersifications,
  updateVersification,
} from "../api/versifications";
import { ResourceTable } from "../manage/ResourceTable";
import { AssociatedTranslationsCell } from "../manage/AssociatedTranslationsCell";
import { DeleteConfirmModal } from "../manage/modals/DeleteConfirmModal";
import { RenameModal } from "../manage/modals/RenameModal";
import { UploadVersificationModal } from "../manage/modals/UploadVersificationModal";

type Dialog =
  | { kind: "upload" }
  | { kind: "rename"; scheme: VersificationOut }
  | { kind: "delete"; scheme: VersificationOut }
  | null;

/** Versification CRUD page with standalone file upload. */
export function VersificationsManagePage() {
  const [schemes, setSchemes] = useState<VersificationOut[]>([]);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const page = await listVersifications();
      setSchemes(page.items);
      setError(null);
    } catch (caught) {
      setError(toMessage(caught));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const columns = [
    { header: "Name", cell: (row: VersificationOut) => row.name },
    {
      header: "Based on",
      cell: (row: VersificationOut) => row.based_on_name ?? "Root",
    },
    {
      header: "Translation(s)",
      cell: (row: VersificationOut) => (
        <AssociatedTranslationsCell names={row.associated_translation_names} />
      ),
    },
    {
      header: "Kind",
      cell: (row: VersificationOut) => (row.canonical ? "Canonical" : "Custom"),
    },
    {
      header: "Actions",
      cell: (row: VersificationOut) => (
        <div className="row-actions">
          <button
            className="btn"
            onClick={() => setDialog({ kind: "rename", scheme: row })}
          >
            Rename
          </button>
          <button
            className="btn danger"
            onClick={() => setDialog({ kind: "delete", scheme: row })}
          >
            Delete
          </button>
        </div>
      ),
    },
  ];

  return (
    <section className="manage-page">
      <div className="page-heading">
        <div>
          <h1>Versifications</h1>
          <p className="muted">Upload and manage numbering schemes.</p>
        </div>
        <button className="btn primary" onClick={() => setDialog({ kind: "upload" })}>
          Upload versification
        </button>
      </div>
      {error && <div className="banner error-banner">{error}</div>}
      <ResourceTable
        caption="Versifications"
        columns={columns}
        rows={schemes}
        rowKey={(row) => row.id}
        emptyMessage="No versifications available."
      />
      {dialog?.kind === "upload" && (
        <UploadVersificationModal
          onClose={() => setDialog(null)}
          onSuccess={() => void load().then(() => setDialog(null))}
        />
      )}
      {dialog?.kind === "rename" && (
        <RenameModal
          title="Rename versification"
          initialName={dialog.scheme.name}
          onClose={() => setDialog(null)}
          onRename={async (name) => {
            await updateVersification(dialog.scheme.id, { name });
            await load();
          }}
        />
      )}
      {dialog?.kind === "delete" && (
        <DeleteConfirmModal
          title="Delete versification"
          message={`Delete ${dialog.scheme.name}? Associated schemes must be removed first.`}
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await deleteVersification(dialog.scheme.id);
            await load();
          }}
        />
      )}
    </section>
  );
}

/** Normalize API and unexpected failures for page banners. */
function toMessage(error: unknown): string {
  return error instanceof ApiError
    ? describeApiError(error)
    : error instanceof Error
      ? error.message
      : "Unexpected error";
}
