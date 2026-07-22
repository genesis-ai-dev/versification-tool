import type { RelationType } from '../api/contracts'

export type OverlayMode = 'focused' | 'all' | 'off'

export interface MappingExampleOption {
  id: string
  label: string
  description: string
  relation: RelationType
}

interface ViewerToolbarProps {
  examples: MappingExampleOption[]
  selectedExampleId: string
  overlayMode: OverlayMode
  isLoading?: boolean
  onExampleChange: (exampleId: string) => void
  onOverlayModeChange: (mode: OverlayMode) => void
}

const relationLabels: Record<RelationType, string> = {
  one_to_one: 'One-to-one',
  shift: 'Shift',
  renumber: 'Renumber',
  split: 'Split',
  merge: 'Merge',
  exclude: 'Excluded',
  partial: 'Partial',
}

const overlayModes: Array<{ value: OverlayMode; label: string }> = [
  { value: 'focused', label: 'Focused' },
  { value: 'all', label: 'All' },
  { value: 'off', label: 'Off' },
]

function relationClass(relation: RelationType) {
  return relation.replaceAll('_', '-')
}

export function ViewerToolbar({
  examples,
  selectedExampleId,
  overlayMode,
  isLoading = false,
  onExampleChange,
  onOverlayModeChange,
}: ViewerToolbarProps) {
  const selectedExample = examples.find(
    (example) => example.id === selectedExampleId,
  )

  return (
    <header className="viewer-toolbar">
      <div className="brand" aria-label="Versification Viewer">
        <div className="brand-mark" aria-hidden="true">
          <span />
          <span />
        </div>
        <div className="brand-copy">
          <strong>Versification Viewer</strong>
          <span>Mapping research workspace</span>
        </div>
      </div>

      <div className="toolbar-primary">
        <label className="toolbar-field">
          <span>Example</span>
          <select
            value={selectedExampleId}
            disabled={isLoading}
            onChange={(event) => onExampleChange(event.target.value)}
          >
            {examples.map((example) => (
              <option key={example.id} value={example.id}>
                {example.label}
              </option>
            ))}
          </select>
        </label>

        {selectedExample ? (
          <div className="example-context" title={selectedExample.description}>
            <span
              className={`relation-dot relation-${relationClass(selectedExample.relation)}`}
            />
            <span>{selectedExample.description}</span>
          </div>
        ) : null}
      </div>

      <div className="overlay-control" aria-label="Mapping overlay visibility">
        <span className="overlay-control-label">Connections</span>
        <div className="segmented-control">
          {overlayModes.map((mode) => (
            <button
              key={mode.value}
              type="button"
              className={overlayMode === mode.value ? 'is-active' : undefined}
              aria-pressed={overlayMode === mode.value}
              onClick={() => onOverlayModeChange(mode.value)}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relation-legend" aria-label="Mapping relationship legend">
        {(Object.keys(relationLabels) as RelationType[]).map((relation) => (
          <span key={relation} className="legend-item">
            <span
              className={`relation-dot relation-${relationClass(relation)}`}
              aria-hidden="true"
            />
            {relationLabels[relation]}
          </span>
        ))}
      </div>
    </header>
  )
}
