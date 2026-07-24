import type { KeyboardEvent } from 'react'
import type { RelationType, VerseSpanOut } from '../api/contracts'
import { spanElementKey, verseRef } from './verseUtils'

interface VerseRowProps {
  side: 'left' | 'right'
  span: VerseSpanOut
  isSelected: boolean
  isMapped: boolean
  relation?: RelationType
  onSelect: (span: VerseSpanOut) => void
  registerElement: (key: string, element: HTMLElement | null) => void
}

function handleActivation(
  event: KeyboardEvent<HTMLElement>,
  activate: () => void,
) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    activate()
  }
}

export function VerseRow({
  side,
  span,
  isSelected,
  isMapped,
  relation,
  onSelect,
  registerElement,
}: VerseRowProps) {
  const reference = verseRef(span)
  const elementKey = spanElementKey(side, reference, span.part)
  const relationClass = relation?.replaceAll('_', '-')
  const classNames = [
    'verse-row',
    isSelected ? 'is-selected' : '',
    isMapped ? 'is-mapped' : '',
    relationClass ? `relation-${relationClass}` : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <article
      ref={(element) => registerElement(elementKey, element)}
      className={classNames}
      data-span-key={elementKey}
      tabIndex={0}
      role="button"
      aria-pressed={isSelected}
      aria-label={`Select ${reference}${span.part ? ` part ${span.part}` : ''}`}
      onClick={() => onSelect(span)}
      onKeyDown={(event) => handleActivation(event, () => onSelect(span))}
    >
      <span className="verse-number" aria-hidden="true">
        {span.verse}
        {span.part ? <small>{span.part}</small> : null}
      </span>
      <p>{span.content}</p>
    </article>
  )
}
