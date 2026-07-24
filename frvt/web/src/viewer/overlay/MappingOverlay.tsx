import { useEffect, useRef, type RefObject } from "react";
import type { ResolveResult } from "../../api/types";
import type { DriveSide } from "./drawPlan";
import { OverlayController } from "./OverlayController";

/** Props wiring the SVG host to workspace column scroll roots. */
export interface MappingOverlayProps {
  /** Absolutely positioned workspace that owns overlay coordinates. */
  workspaceRef: RefObject<HTMLElement | null>;
  /** Left column scrollport used for anchor measurement. */
  leftColumnRef: RefObject<HTMLElement | null>;
  /** Right column scrollport used for anchor measurement. */
  rightColumnRef: RefObject<HTMLElement | null>;
  /** Current alignment; null clears connectors when map is on. */
  result: ResolveResult | null;
  /** URL ``map`` toggle — when false, SVG is cleared. */
  mapEnabled: boolean;
  /** URL ``drive`` side owning source_spans. */
  driveSide: DriveSide;
  /** Changes whenever rendered chapter anchors may have moved or been replaced. */
  layoutKey: string;
}

/**
 * SVG host for the mapping overlay.
 * Owns the OverlayController lifecycle and forwards resolve/map/drive updates.
 */
export function MappingOverlay({
  workspaceRef,
  leftColumnRef,
  rightColumnRef,
  result,
  mapEnabled,
  driveSide,
  layoutKey,
}: MappingOverlayProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const controllerRef = useRef<OverlayController | null>(null);

  useEffect(() => {
    const workspace = workspaceRef.current;
    const svg = svgRef.current;
    const left = leftColumnRef.current;
    const right = rightColumnRef.current;
    if (!workspace || !svg || !left || !right) {
      return;
    }
    const controller = new OverlayController(workspace, svg, left, right);
    controllerRef.current = controller;
    controller.setModel({ result, mapEnabled, driveSide });
    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
  }, [
    workspaceRef,
    leftColumnRef,
    rightColumnRef,
    result,
    mapEnabled,
    driveSide,
    layoutKey,
  ]);

  return (
    <svg
      ref={svgRef}
      className="mapping-overlay"
      aria-hidden="true"
      role="presentation"
    />
  );
}
