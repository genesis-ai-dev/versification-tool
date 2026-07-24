import type { RelationType, ResolveResult } from '../api/contracts'

interface MappingSummaryProps {
  resolution: ResolveResult | null
  activeSide: 'left' | 'right'
  isLoading?: boolean
}

const relationCopy: Record<
  RelationType,
  { label: string; description: string }
> = {
  one_to_one: {
    label: 'One-to-one',
    description: 'The selected span has a direct counterpart.',
  },
  shift: {
    label: 'Shift',
    description: 'The same span is numbered differently in the other scheme.',
  },
  renumber: {
    label: 'Renumber',
    description: 'The span moves across a chapter or numbering boundary.',
  },
  split: {
    label: 'Split',
    description: 'One selected span corresponds to multiple target spans.',
  },
  merge: {
    label: 'Merge',
    description: 'Multiple source spans correspond to one target span.',
  },
  exclude: {
    label: 'Excluded',
    description: 'The selected span has no counterpart in the target scheme.',
  },
  partial: {
    label: 'Partial',
    description: 'Only a labeled portion of the verse is mapped.',
  },
}

function formatSpans(spans: ResolveResult['source_spans']) {
  if (spans.length === 0) {
    return 'No corresponding span'
  }

  return spans
    .map((span) => (span.part ? `${span.ref}${span.part}` : span.ref))
    .join(', ')
}

export function MappingSummary({
  resolution,
  activeSide,
  isLoading = false,
}: MappingSummaryProps) {
  if (isLoading) {
    return (
      <footer className="mapping-summary is-loading" aria-live="polite">
        <span className="summary-spinner" aria-hidden="true" />
        Resolving the selected span…
      </footer>
    )
  }

  if (!resolution) {
    return (
      <footer className="mapping-summary is-empty" aria-live="polite">
        Select a verse in either column to inspect its mapping.
      </footer>
    )
  }

  const copy = relationCopy[resolution.relation]
  const sourceLabel = activeSide === 'left' ? 'Left' : 'Right'
  const targetLabel = activeSide === 'left' ? 'Right' : 'Left'
  const relationClass = resolution.relation.replaceAll('_', '-')

  return (
    <footer className="mapping-summary" aria-live="polite">
      <div className="summary-relation">
        <span className={`relation-badge relation-${relationClass}`}>
          {copy.label}
        </span>
        <span>{copy.description}</span>
      </div>

      <div className="summary-route">
        <span>
          <small>{sourceLabel}</small>
          <strong>{formatSpans(resolution.source_spans)}</strong>
        </span>
        <span className="summary-arrow" aria-hidden="true">
          →
        </span>
        <span>
          <small>{targetLabel}</small>
          <strong>{formatSpans(resolution.target_spans)}</strong>
        </span>
      </div>
    </footer>
  )
}
