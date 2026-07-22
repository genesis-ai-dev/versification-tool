import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type RefCallback,
} from 'react'
import type { RelationType } from '../api/contracts'

export interface MappingPoint {
  x: number
  y: number
}

export interface MappingElementGeometry {
  key: string
  x: number
  y: number
  width: number
  height: number
  left: number
  right: number
  top: number
  bottom: number
  centerX: number
  centerY: number
}

export interface MappingViewportGeometry {
  width: number
  height: number
}

export interface MappingGeometrySnapshot {
  viewport: MappingViewportGeometry
  elements: ReadonlyMap<string, MappingElementGeometry>
}

export interface MappingConnection {
  id: string
  relation: RelationType
  sourceKeys: readonly string[]
  targetKeys?: readonly string[]
  ariaLabel?: string
  className?: string
  stroke?: string
  strokeWidth?: number
  opacity?: number
  dashArray?: string
  active?: boolean
  dimmed?: boolean
  hidden?: boolean
}

export interface MappingPathGeometry {
  id: string
  connectionId: string
  relation: RelationType
  sourceKey: string
  targetKey: string | null
  start: MappingPoint
  end: MappingPoint
  path: string
  excludedTerminal: boolean
}

export interface MappingPathOptions {
  curvature?: number
  minimumControlOffset?: number
  excludeLength?: number
}

export interface UseMappingGeometryResult {
  containerRef: RefCallback<HTMLElement>
  registerElement: <T extends HTMLElement = HTMLElement>(
    key: string,
  ) => RefCallback<T>
  unregisterElement: (key: string) => void
  getRegisteredElement: (key: string) => HTMLElement | null
  geometry: MappingGeometrySnapshot
  refresh: () => void
}

const EMPTY_VIEWPORT: MappingViewportGeometry = { width: 0, height: 0 }
const EMPTY_GEOMETRY: MappingGeometrySnapshot = {
  viewport: EMPTY_VIEWPORT,
  elements: new Map(),
}

function elementGeometryEqual(
  left: MappingElementGeometry,
  right: MappingElementGeometry,
): boolean {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height &&
    left.left === right.left &&
    left.right === right.right &&
    left.top === right.top &&
    left.bottom === right.bottom &&
    left.centerX === right.centerX &&
    left.centerY === right.centerY
  )
}

function snapshotEqual(
  left: MappingGeometrySnapshot,
  right: MappingGeometrySnapshot,
): boolean {
  if (
    left.viewport.width !== right.viewport.width ||
    left.viewport.height !== right.viewport.height ||
    left.elements.size !== right.elements.size
  ) {
    return false
  }

  for (const [key, leftElement] of left.elements) {
    const rightElement = right.elements.get(key)
    if (!rightElement || !elementGeometryEqual(leftElement, rightElement)) {
      return false
    }
  }

  return true
}

function toElementGeometry(
  key: string,
  elementRect: DOMRect,
  originX: number,
  originY: number,
): MappingElementGeometry {
  const left = elementRect.left - originX
  const top = elementRect.top - originY
  const width = elementRect.width
  const height = elementRect.height
  const right = left + width
  const bottom = top + height

  return {
    key,
    x: left,
    y: top,
    width,
    height,
    left,
    right,
    top,
    bottom,
    centerX: left + width / 2,
    centerY: top + height / 2,
  }
}

/**
 * Measures registered HTML elements in the viewport coordinate space of a
 * container. All invalidations are coalesced into one animation-frame read.
 */
export function useMappingGeometry(): UseMappingGeometryResult {
  const containerNodeRef = useRef<HTMLElement | null>(null)
  const elementNodesRef = useRef(new Map<string, HTMLElement>())
  const registrationCallbacksRef = useRef(
    new Map<string, RefCallback<HTMLElement>>(),
  )
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const mountedRef = useRef(false)
  const [geometry, setGeometry] = useState<MappingGeometrySnapshot>(EMPTY_GEOMETRY)

  const measure = useCallback(() => {
    animationFrameRef.current = null

    if (!mountedRef.current) {
      return
    }

    const container = containerNodeRef.current
    if (!container) {
      setGeometry((current) =>
        snapshotEqual(current, EMPTY_GEOMETRY) ? current : EMPTY_GEOMETRY,
      )
      return
    }

    const containerRect = container.getBoundingClientRect()
    const originX = containerRect.left + container.clientLeft
    const originY = containerRect.top + container.clientTop
    const elements = new Map<string, MappingElementGeometry>()

    for (const [key, element] of elementNodesRef.current) {
      if (!element.isConnected) {
        continue
      }

      elements.set(
        key,
        toElementGeometry(key, element.getBoundingClientRect(), originX, originY),
      )
    }

    const nextGeometry: MappingGeometrySnapshot = {
      viewport: {
        width: container.clientWidth,
        height: container.clientHeight,
      },
      elements,
    }

    setGeometry((current) =>
      snapshotEqual(current, nextGeometry) ? current : nextGeometry,
    )
  }, [])

  const refresh = useCallback(() => {
    if (typeof window === 'undefined' || animationFrameRef.current !== null) {
      return
    }

    animationFrameRef.current = window.requestAnimationFrame(measure)
  }, [measure])

  const containerRef = useCallback<RefCallback<HTMLElement>>(
    (node) => {
      const previousNode = containerNodeRef.current
      if (previousNode === node) {
        return
      }

      if (previousNode) {
        resizeObserverRef.current?.unobserve(previousNode)
      }

      containerNodeRef.current = node

      if (node) {
        resizeObserverRef.current?.observe(node)
      }

      refresh()
    },
    [refresh],
  )

  const registerElement = useCallback(
    <T extends HTMLElement = HTMLElement>(key: string): RefCallback<T> => {
      if (key.length === 0) {
        throw new Error('Mapping geometry keys must not be empty.')
      }

      const existingCallback = registrationCallbacksRef.current.get(key)
      if (existingCallback) {
        return existingCallback as RefCallback<T>
      }

      let currentNode: HTMLElement | null = null
      const callback: RefCallback<HTMLElement> = (node) => {
        if (currentNode === node) {
          return
        }

        if (currentNode) {
          resizeObserverRef.current?.unobserve(currentNode)
          if (elementNodesRef.current.get(key) === currentNode) {
            elementNodesRef.current.delete(key)
          }
        }

        currentNode = node

        if (node) {
          elementNodesRef.current.set(key, node)
          resizeObserverRef.current?.observe(node)
        }

        refresh()
      }

      registrationCallbacksRef.current.set(key, callback)
      return callback as RefCallback<T>
    },
    [refresh],
  )

  const unregisterElement = useCallback(
    (key: string) => {
      const node = elementNodesRef.current.get(key)
      if (node) {
        resizeObserverRef.current?.unobserve(node)
        elementNodesRef.current.delete(key)
        refresh()
      }
    },
    [refresh],
  )

  const getRegisteredElement = useCallback(
    (key: string) => elementNodesRef.current.get(key) ?? null,
    [],
  )

  useLayoutEffect(() => {
    mountedRef.current = true

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(refresh)
      resizeObserverRef.current = observer

      if (containerNodeRef.current) {
        observer.observe(containerNodeRef.current)
      }
      for (const element of elementNodesRef.current.values()) {
        observer.observe(element)
      }
    }

    window.addEventListener('resize', refresh, { passive: true })
    window.addEventListener('scroll', refresh, {
      capture: true,
      passive: true,
    })
    refresh()

    return () => {
      mountedRef.current = false
      window.removeEventListener('resize', refresh)
      window.removeEventListener('scroll', refresh, true)
      resizeObserverRef.current?.disconnect()
      resizeObserverRef.current = null

      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
    }
  }, [refresh])

  return {
    containerRef,
    registerElement,
    unregisterElement,
    getRegisteredElement,
    geometry,
    refresh,
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

/** Creates a horizontal cubic Bezier path between two measured anchors. */
export function createCubicMappingPath(
  start: MappingPoint,
  end: MappingPoint,
  options: Pick<MappingPathOptions, 'curvature' | 'minimumControlOffset'> = {},
): string {
  const curvature = clamp(options.curvature ?? 0.45, 0, 1)
  const minimumControlOffset = Math.max(options.minimumControlOffset ?? 32, 0)
  const direction = end.x >= start.x ? 1 : -1
  const controlOffset = Math.max(
    Math.abs(end.x - start.x) * curvature,
    minimumControlOffset,
  )
  const firstControlX = start.x + direction * controlOffset
  const secondControlX = end.x - direction * controlOffset

  return `M ${start.x} ${start.y} C ${firstControlX} ${start.y}, ${secondControlX} ${end.y}, ${end.x} ${end.y}`
}

function facingAnchors(
  source: MappingElementGeometry,
  target: MappingElementGeometry,
): { start: MappingPoint; end: MappingPoint } {
  const targetIsRight = target.centerX >= source.centerX

  return {
    start: {
      x: targetIsRight ? source.right : source.left,
      y: source.centerY,
    },
    end: {
      x: targetIsRight ? target.left : target.right,
      y: target.centerY,
    },
  }
}

function availableGeometries(
  keys: readonly string[],
  elements: ReadonlyMap<string, MappingElementGeometry>,
): MappingElementGeometry[] {
  const seen = new Set<string>()
  const result: MappingElementGeometry[] = []

  for (const key of keys) {
    if (seen.has(key)) {
      continue
    }
    seen.add(key)

    const element = elements.get(key)
    if (element) {
      result.push(element)
    }
  }

  return result
}

function connectionPairs(
  relation: RelationType,
  sources: readonly MappingElementGeometry[],
  targets: readonly MappingElementGeometry[],
): Array<{
  source: MappingElementGeometry
  target: MappingElementGeometry | null
}> {
  if (relation === 'exclude' && targets.length === 0) {
    return sources.map((source) => ({ source, target: null }))
  }

  if (sources.length === 0 || targets.length === 0) {
    return []
  }

  if (relation === 'split') {
    return targets.map((target) => ({ source: sources[0], target }))
  }

  if (relation === 'merge') {
    return sources.map((source) => ({ source, target: targets[0] }))
  }

  if (sources.length === 1) {
    return targets.map((target) => ({ source: sources[0], target }))
  }

  if (targets.length === 1) {
    return sources.map((source) => ({ source, target: targets[0] }))
  }

  const pairCount = Math.min(sources.length, targets.length)
  return Array.from({ length: pairCount }, (_, index) => ({
    source: sources[index],
    target: targets[index],
  }))
}

/**
 * Resolves connection declarations into renderable cubic paths. Missing element
 * keys are ignored so asynchronous verse lists can register incrementally.
 */
export function buildMappingPathGeometry(
  snapshot: MappingGeometrySnapshot,
  connections: readonly MappingConnection[],
  options: MappingPathOptions = {},
): MappingPathGeometry[] {
  const paths: MappingPathGeometry[] = []
  const excludeLength = Math.max(options.excludeLength ?? 28, 0)

  connections.forEach((connection, connectionIndex) => {
    if (connection.hidden) {
      return
    }

    const sources = availableGeometries(
      connection.sourceKeys,
      snapshot.elements,
    )
    const targets = availableGeometries(
      connection.targetKeys ?? [],
      snapshot.elements,
    )
    const pairs = connectionPairs(connection.relation, sources, targets)

    pairs.forEach(({ source, target }, pairIndex) => {
      let start: MappingPoint
      let end: MappingPoint
      const excludedTerminal = connection.relation === 'exclude' && !target

      if (target) {
        ;({ start, end } = facingAnchors(source, target))
      } else {
        const direction =
          source.centerX <= snapshot.viewport.width / 2 ? 1 : -1
        start = {
          x: direction > 0 ? source.right : source.left,
          y: source.centerY,
        }
        end = {
          x: start.x + direction * excludeLength,
          y: start.y,
        }
      }

      paths.push({
        id: `${connection.id}:${connectionIndex}:${source.key}:${target?.key ?? 'excluded'}:${pairIndex}`,
        connectionId: connection.id,
        relation: connection.relation,
        sourceKey: source.key,
        targetKey: target?.key ?? null,
        start,
        end,
        path: createCubicMappingPath(start, end, options),
        excludedTerminal,
      })
    })
  })

  return paths
}
