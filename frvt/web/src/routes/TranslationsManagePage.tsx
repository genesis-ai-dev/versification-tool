import { useCallback, useEffect, useState } from "react";
import {
  listAssociations,
  removeAssociation,
  setPreferredAssociation,
} from "../api/associations";
import { ApiError, describeApiError } from "../api/errors";
import {
  deleteTranslation,
  listTranslations,
  updateTranslation,
} from "../api/translations";
import { listVersifications } from "../api/versifications";
import type { AssociationOut, TranslationOut, VersificationOut } from "../api/types";
import { ResourceTable } from "../manage/ResourceTable";
import { AssociateModal } from "../manage/modals/AssociateModal";
import { DeleteConfirmModal } from "../manage/modals/DeleteConfirmModal";
import { RenameModal } from "../manage/modals/RenameModal";
import { UploadProjectModal } from "../manage/modals/UploadProjectModal";

/** Local row model joining a translation with its associations. */
interface TranslationRow {
  translation: TranslationOut;
  associations: AssociationOut[];
}

type ModalState =
  | { kind: "upload" }
  | { kind: "rename"; row: TranslationRow }
  | { kind: "associate"; row: TranslationRow }
  | { kind: "delete"; row: TranslationRow }
  | {
      kind: "removeAssoc";
      row: TranslationRow;
      schemeId: string;
      schemeName: string;
    }
  | null;

/**
 * Manage translations: list, rename, delete, associate, remove association, upload.
 * Preferred associations cannot be removed until another scheme is preferred.
 */
export function TranslationsManagePage() {
  const [rows, setRows] = useState<TranslationRow[]>([]);
  const [schemes, setSchemes] = useState<VersificationOut[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);

  const reload = useCallback(async () => {
    try {
      const [tPage, vPage] = await Promise.all([
        listTranslations(),
        listVersifications(),
      ]);
      setSchemes(vPage.items);
      const withAssoc = await Promise.all(
        tPage.items.map(async (translation) => ({
          translation,
          associations: await listAssociations(translation.id),
        })),
      );
      setRows(withAssoc);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? describeApiError(err) : "Failed to load");
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  function schemeName(schemeId: string): string {
    return schemes.find((s) => s.id === schemeId)?.name ?? schemeId.slice(0, 8);
  }

  /** Make one associated scheme preferred and surface conflicts on the page. */
  async function makePreferred(translationId: string, schemeId: string): Promise<void> {
    try {
      await setPreferredAssociation(translationId, schemeId);
      await reload();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? describeApiError(caught)
          : "Failed to change preferred scheme",
      );
    }
  }

  return (
    <div className="manage-page">
      <header className="manage-header">
        <h1>Translations</h1>
        <button
          type="button"
          className="btn primary"
          onClick={() => setModal({ kind: "upload" })}
        >
          Upload project
        </button>
      </header>
      {error && <p className="error-text">{error}</p>}
      <ResourceTable
        caption="Translations"
        rows={rows}
        rowKey={(row) => row.translation.id}
        emptyMessage="No translations yet — upload a project to begin."
        columns={[
          { header: "Name", cell: (row) => row.translation.name },
          { header: "Language", cell: (row) => row.translation.language },
          {
            header: "Schemes",
            cell: (row) =>
              row.associations.length === 0 ? (
                <span className="muted">None</span>
              ) : (
                <ul className="assoc-list">
                  {row.associations.map((assoc) => (
                    <li key={assoc.id}>
                      {schemeName(assoc.scheme_id)}
                      {assoc.preferred ? " (preferred)" : ""}
                      {!assoc.preferred && (
                        <>
                          {" "}
                          <button
                            type="button"
                            className="linkish"
                            onClick={() =>
                              void makePreferred(row.translation.id, assoc.scheme_id)
                            }
                          >
                            Make preferred
                          </button>
                          {" · "}
                          <button
                            type="button"
                            className="linkish"
                            onClick={() =>
                              setModal({
                                kind: "removeAssoc",
                                row,
                                schemeId: assoc.scheme_id,
                                schemeName: schemeName(assoc.scheme_id),
                              })
                            }
                          >
                            Remove
                          </button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              ),
          },
          {
            header: "Actions",
            cell: (row) => (
              <div className="row-actions">
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => setModal({ kind: "rename", row })}
                >
                  Rename
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => setModal({ kind: "associate", row })}
                >
                  Associate
                </button>
                <button
                  type="button"
                  className="btn danger"
                  onClick={() => setModal({ kind: "delete", row })}
                >
                  Delete
                </button>
              </div>
            ),
          },
        ]}
      />

      {modal?.kind === "upload" && (
        <UploadProjectModal
          onClose={() => setModal(null)}
          onSuccess={() => {
            setModal(null);
            void reload();
          }}
        />
      )}
      {modal?.kind === "rename" && (
        <RenameModal
          title="Rename translation"
          initialName={modal.row.translation.name}
          onClose={() => setModal(null)}
          onRename={async (name) => {
            await updateTranslation(modal.row.translation.id, { name });
            await reload();
          }}
        />
      )}
      {modal?.kind === "associate" && (
        <AssociateModal
          translationId={modal.row.translation.id}
          translationName={modal.row.translation.name}
          existingSchemeIds={modal.row.associations.map((a) => a.scheme_id)}
          onClose={() => setModal(null)}
          onSuccess={() => void reload()}
        />
      )}
      {modal?.kind === "delete" && (
        <DeleteConfirmModal
          title="Delete translation"
          message={`Delete “${modal.row.translation.name}” and its spans/associations?`}
          onClose={() => setModal(null)}
          onConfirm={async () => {
            await deleteTranslation(modal.row.translation.id);
            await reload();
          }}
        />
      )}
      {modal?.kind === "removeAssoc" && (
        <DeleteConfirmModal
          title="Remove association"
          confirmLabel="Remove"
          message={`Remove “${modal.schemeName}” from “${modal.row.translation.name}”?`}
          onClose={() => setModal(null)}
          onConfirm={async () => {
            await removeAssociation(modal.row.translation.id, modal.schemeId);
            await reload();
          }}
        />
      )}
    </div>
  );
}
