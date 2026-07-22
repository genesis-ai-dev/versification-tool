import { useMemo, type SVGProps } from 'react'
import {
  buildMappingPathGeometry,
  type MappingConnection,
  type MappingGeometrySnapshot,
  type MappingPathOptions,
} from '../hooks/useMappingGeometry'
import type { RelationType } from '../api/contracts'

export interface MappingRelationStyle {
  stroke: string
  strokeWidth: number
  opacity: number
  dashArray?: string
}

export interface MappingOverlayProps
  extends Omit<
    SVGProps<SVGSVGElement>,
    'children' | 'height' | 'role' | 'viewBox' | 'width'
  > {
  geometry: MappingGeometrySnapshot
  connections: readonly MappingConnection[]
  pathOptions?: MappingPathOptions
  relationStyles?: Partial<Record<RelationType, Partial<MappingRelationStyle>>>
  ariaLabel?: string
  excludeMarkerSize?: number
}

const DEFAULT_RELATION_STYLES: Record<RelationType, MappingRelationStyle> = {
  one_to_one: {
    stroke: '#70c9d6',
    strokeWidth: 1.75,
    opacity: 0.88,
  },
  shift: {
    stroke: '#56b6e8',
    strokeWidth: 1.75,
    opacity: 0.92,
    dashArray: '8 5',
  },
  renumber: {
    stroke: '#4f8ff7',
    strokeWidth: 1.75,
    opacity: 0.92,
    dashArray: '3 4',
  },
  split: {
    stroke: '#e2ad57',
    strokeWidth: 2,
    opacity: 0.94,
  },
  merge: {
    stroke: '#a78bfa',
    strokeWidth: 2,
    opacity: 0.94,
  },
  partial: {
    stroke: '#5fd1aa',
    strokeWidth: 1.9,
    opacity: 0.92,
    dashArray: '10 5',
  },
  exclude: {
    stroke: '#ef7189',
    strokeWidth: 1.9,
    opacity: 0.94,
    dashArray: '4 4',
  },
}

function relationClassName(relation: RelationType): string {
  return relation.replaceAll('_', '-')
}

function mergeRelationStyle(
  relation: RelationType,
  overrides: MappingOverlayProps['relationStyles'],
): MappingRelationStyle {
  return {
    ...DEFAULT_RELATION_STYLES[relation],
    ...overrides?.[relation],
  }
}

function joinClassNames(...values: Array<string | undefined>): string | undefined {
  const className = values.filter(Boolean).join(' ')
  return className.length > 0 ? className : undefined
}

/**
 * A presentation-only SVG layer for measured verse mappings. Mount it inside
 * the same positioned container assigned to useMappingGeometry().containerRef.
 */
export function MappingOverlay({
  geometry,
  connections,
  pathOptions,
  relationStyles,
  ariaLabel,
  excludeMarkerSize = 5,
  className,
  style,
  ...svgProps
}: MappingOverlayProps) {
  const paths = useMemo(
    () => buildMappingPathGeometry(geometry, connections, pathOptions),
    [connections, geometry, pathOptions],
  )
  const connectionsById = useMemo(
    () => new Map(connections.map((connection) => [connection.id, connection])),
    [connections],
  )
  const description = useMemo(() => {
    const labels = connections
      .filter((connection) => !connection.hidden && connection.ariaLabel)
      .map((connection) => connection.ariaLabel)
    return labels.length > 0 ? labels.join('. ') : undefined
  }, [connections])
  const markerSize = Math.max(excludeMarkerSize, 0)
  const hasAccessibleName = Boolean(ariaLabel)

  return (
    <svg
      {...svgProps}
      className={joinClassNames('mapping-overlay', className)}
      width="100%"
      height="100%"
      viewBox={`0 0 ${geometry.viewport.width} ${geometry.viewport.height}`}
      preserveAspectRatio="none"
      role={hasAccessibleName ? 'img' : 'presentation'}
      aria-label={ariaLabel}
      aria-hidden={hasAccessibleName ? undefined : true}
      focusable="false"
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        ...style,
      }}
    >
      {hasAccessibleName ? <title>{ariaLabel}</title> : null}
      {hasAccessibleName && description ? <desc>{description}</desc> : null}

      {paths.map((path) => {
        const connection = connectionsById.get(path.connectionId)
        if (!connection) {
          return null
        }

        const relationStyle = mergeRelationStyle(
          connection.relation,
          relationStyles,
        )
        const stroke = connection.stroke ?? relationStyle.stroke
        const baseStrokeWidth =
          connection.strokeWidth ?? relationStyle.strokeWidth
        const strokeWidth = connection.active
          ? baseStrokeWidth * 1.35
          : baseStrokeWidth
        const baseOpacity = connection.opacity ?? relationStyle.opacity
        const opacity = connection.dimmed ? baseOpacity * 0.22 : baseOpacity
        const dashArray = connection.dashArray ?? relationStyle.dashArray
        const pathClassName = joinClassNames(
          'mapping-connection',
          `mapping-connection--${relationClassName(connection.relation)}`,
          connection.active ? 'is-active' : undefined,
          connection.dimmed ? 'is-dimmed' : undefined,
          connection.className,
        )

        return (
          <g
            key={path.id}
            className={pathClassName}
            data-connection-id={connection.id}
            data-relation={connection.relation}
            data-source-key={path.sourceKey}
            data-target-key={path.targetKey ?? undefined}
            opacity={opacity}
          >
            <path
              d={path.path}
              fill="none"
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeDasharray={dashArray}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={path.start.x}
              cy={path.start.y}
              r={connection.active ? 3.5 : 2.5}
              fill={stroke}
              stroke="#0f161f"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
            {!path.excludedTerminal ? (
              <circle
                cx={path.end.x}
                cy={path.end.y}
                r={connection.active ? 3.5 : 2.5}
                fill={stroke}
                stroke="#0f161f"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}

            {path.excludedTerminal && markerSize > 0 ? (
              <g
                stroke={stroke}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              >
                <line
                  x1={path.end.x - markerSize}
                  y1={path.end.y - markerSize}
                  x2={path.end.x + markerSize}
                  y2={path.end.y + markerSize}
                />
                <line
                  x1={path.end.x - markerSize}
                  y1={path.end.y + markerSize}
                  x2={path.end.x + markerSize}
                  y2={path.end.y - markerSize}
                />
              </g>
            ) : null}
          </g>
        )
      })}
    </svg>
  )
}
