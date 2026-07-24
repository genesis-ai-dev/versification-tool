import { apiGet, apiSend, apiUpload } from "./client";
import type { Page, VersificationDetailOut, VersificationOut } from "./types";

/** List versification schemes, optionally filtering to canonical only. */
export function listVersifications(canonical?: boolean): Promise<Page<VersificationOut>> {
  return apiGet<Page<VersificationOut>>("/api/versifications", {
    canonical: canonical === undefined ? undefined : canonical,
    limit: 500,
  });
}

/** Fetch one scheme including its ingredient payload. */
export function getVersification(id: string): Promise<VersificationDetailOut> {
  return apiGet<VersificationDetailOut>(`/api/versifications/${id}`);
}

/** Rename a versification scheme. */
export function updateVersification(
  id: string,
  body: { name?: string },
): Promise<VersificationOut> {
  return apiSend<VersificationOut>(`/api/versifications/${id}`, "PATCH", body);
}

/** Delete a versification scheme when no longer referenced. */
export function deleteVersification(id: string): Promise<void> {
  return apiSend<void>(`/api/versifications/${id}`, "DELETE");
}

/** Upload a standalone VRS or Copenhagen/Burrito versification file. */
export function uploadVersification(
  file: File,
  name?: string,
): Promise<VersificationOut> {
  const form = new FormData();
  form.append("file", file);
  if (name) {
    form.append("name", name);
  }
  return apiUpload<VersificationOut>("/api/versifications/upload", form);
}
