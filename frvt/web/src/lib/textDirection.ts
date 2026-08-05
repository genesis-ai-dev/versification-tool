import type { TranslationOut } from "../api/types";

/** Scripture column text direction derived from a translation record. */
export type TextDirection = "ltr" | "rtl";

/**
 * Return the HTML ``dir`` attribute value for a translation's verse list.
 * Defaults to ``ltr`` when the translation is unknown.
 */
export function textDirectionForTranslation(
  translation: TranslationOut | undefined,
): TextDirection {
  return translation?.text_direction ?? "ltr";
}
