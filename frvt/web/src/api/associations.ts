import { apiGet, apiSend } from "./client";
import type { AssociationOut } from "./types";

/** List schemes associated with a translation. */
export function listAssociations(translationId: string): Promise<AssociationOut[]> {
  return apiGet<AssociationOut[]>(`/api/translations/${translationId}/versifications`);
}

/** Associate an existing scheme with a translation. */
export function createAssociation(
  translationId: string,
  schemeId: string,
): Promise<AssociationOut> {
  return apiSend<AssociationOut>(
    `/api/translations/${translationId}/versifications`,
    "POST",
    { scheme_id: schemeId },
  );
}

/** Make an association the preferred (default) scheme for a translation. */
export function setPreferredAssociation(
  translationId: string,
  schemeId: string,
): Promise<AssociationOut> {
  return apiSend<AssociationOut>(
    `/api/translations/${translationId}/versifications/${schemeId}/preferred`,
    "PUT",
  );
}

/** Remove a non-preferred association from a translation. */
export function removeAssociation(
  translationId: string,
  schemeId: string,
): Promise<void> {
  return apiSend<void>(
    `/api/translations/${translationId}/versifications/${schemeId}`,
    "DELETE",
  );
}
