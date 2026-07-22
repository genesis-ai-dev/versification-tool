import type { VerseSpanOut } from '../api/contracts'

export function verseRef(span: VerseSpanOut) {
  return `${span.book} ${span.chapter}:${span.verse}`
}

export function spanElementKey(
  side: 'left' | 'right',
  ref: string,
  part: string | null = null,
) {
  return `${side}:${ref}::${part ?? ''}`
}
