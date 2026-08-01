/**
 * Format a verse number for display gutters and selectors.
 * Verse ``0`` renders as ``Title (0)``; other values stay numeric.
 */
export function formatVerseLabel(verse: number): string {
  if (verse === 0) {
    return "Title (0)";
  }
  return String(verse);
}

/**
 * Format a verse gutter or selector label, appending a sub-verse part when present.
 * Machine/API values remain separate via ``toResolveArgs``.
 */
export function formatVerseGutterLabel(verse: number, part?: string | null): string {
  const base = formatVerseLabel(verse);
  return part ? `${base}${part}` : base;
}

/**
 * Format a display label for a structured BCV (optional part suffix).
 * Machine/API values remain separate via ``toResolveArgs``.
 */
export function formatBcvLabel(
  book: string,
  chapter: number,
  verse: number,
  part?: string | null,
): string {
  const verseLabel = formatVerseLabel(verse);
  const base = `${book} ${chapter}:${verseLabel}`;
  return part ? `${base}${part}` : base;
}
