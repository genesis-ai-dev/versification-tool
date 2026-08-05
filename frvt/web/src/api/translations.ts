import { apiGet, apiSend } from "./client";
import type { Page, TranslationOut } from "./types";

/** List all translations (anchors excluded server-side). */
export function listTranslations(): Promise<Page<TranslationOut>> {
  return apiGet<Page<TranslationOut>>("/api/translations", { limit: 500 });
}

/** Fetch one translation by id. */
export function getTranslation(id: string): Promise<TranslationOut> {
  return apiGet<TranslationOut>(`/api/translations/${id}`);
}

/** Rename or update language for a translation. */
export function updateTranslation(
  id: string,
  body: { name?: string; language?: string },
): Promise<TranslationOut> {
  return apiSend<TranslationOut>(`/api/translations/${id}`, "PATCH", body);
}

/** Delete a translation and its spans/associations. */
export function deleteTranslation(id: string): Promise<void> {
  return apiSend<void>(`/api/translations/${id}`, "DELETE");
}
