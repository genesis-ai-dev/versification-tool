import { useEffect, useRef } from "react";
import { ACCENT, MUTED, NEUTRAL, severityColor } from "./model/colors";
import { severityOf, type ScopedRun } from "./model/detail";
import {
  dotPlotLayout,
  drawDotPlot,
  selectedDotKey,
  type DotPlotLayout,
} from "./model/dotPlot";
import type { ComparisonIndex } from "./model/index";
import type { RunHighlight } from "./model/selection";

/** Pixels a dot-plot click may miss a stroke and still select that run. */
const DOT_HIT_SLOP_PX = 8;

/** Layout used before the canvas has a context, so a click selects nothing. */
const EMPTY_LAYOUT: DotPlotLayout = {
  segments: [],
  ticks: [],
  diagonal: [0, 0, 0, 0],
  magnification: 1,
};

/** Props for the side A against side B plot of one book. */
export interface DotPlotProps {
  /** Runs of the selected book. A run missing either side is drawn as a margin tick. */
  runs: ScopedRun[];
  /** Comparison index that supplies chapter lengths and type severities. */
  index: ComparisonIndex;
  /** Exaggerate the offset from the diagonal so single-verse steps are visible. */
  magnify: boolean;
  /** Run to emphasize, and the callback a stroke or tick click calls. */
  highlight: RunHighlight;
}

/**
 * Square plot of side A against side B.
 * A null canvas context leaves the plot blank and ignores clicks.
 * A click selects a margin tick under the pointer, else the nearest deviance stroke.
 * A nearer unchanged stroke does not select.
 */
export function DotPlot({ runs, index, magnify, highlight }: DotPlotProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const layoutRef = useRef<DotPlotLayout>(EMPTY_LAYOUT);
  const pick = highlight.onPick;
  const activeKey = highlight.activeKey;
  useEffect(() => {
    const canvas = ref.current;
    if (canvas === null || canvasContext(canvas) === null) {
      layoutRef.current = EMPTY_LAYOUT;
      return;
    }
    const size = canvas.clientWidth || 360;
    const layout = dotPlotLayout(runs, index, magnify, size);
    layoutRef.current = layout;
    drawDotPlot(canvas, (context) => {
      const ratio = window.devicePixelRatio || 1;
      canvas.width = size * ratio;
      canvas.height = size * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, size, size);
      context.strokeStyle = NEUTRAL;
      context.lineWidth = 1;
      context.strokeRect(14, 4, size - 18, size - 18);
      context.save();
      context.setLineDash([3, 3]);
      context.globalAlpha = 0.55;
      context.strokeStyle = MUTED;
      context.beginPath();
      context.moveTo(layout.diagonal[0], layout.diagonal[1]);
      context.lineTo(layout.diagonal[2], layout.diagonal[3]);
      context.stroke();
      context.restore();
      for (const segment of layout.segments) {
        context.strokeStyle =
          segment.type === "SAME"
            ? MUTED
            : severityColor(severityOf(index, segment.type));
        context.lineWidth = segment.type === "SAME" ? 1.2 : 2.4;
        context.beginPath();
        context.moveTo(segment.x0, segment.y0);
        context.lineTo(segment.x1, segment.y1);
        context.stroke();
      }
      for (const tick of layout.ticks) {
        context.fillStyle =
          tick.type === "SAME" ? MUTED : severityColor(severityOf(index, tick.type));
        context.fillRect(tick.rect[0], tick.rect[1], tick.rect[2], tick.rect[3]);
      }
      const selected = layout.segments.find((segment) => segment.key === activeKey);
      if (selected !== undefined) {
        context.strokeStyle = ACCENT;
        context.lineWidth = 3.5;
        context.beginPath();
        context.moveTo(selected.x0, selected.y0);
        context.lineTo(selected.x1, selected.y1);
        context.stroke();
      }
      const selectedTick = layout.ticks.find((tick) => tick.key === activeKey);
      if (selectedTick !== undefined) {
        context.fillStyle = ACCENT;
        context.fillRect(
          selectedTick.rect[0],
          selectedTick.rect[1],
          selectedTick.rect[2],
          selectedTick.rect[3],
        );
      }
    });
  }, [activeKey, index, magnify, runs]);
  return (
    <canvas
      className="dv-dot"
      ref={ref}
      onClick={(event) => {
        pick(
          selectedDotKey(
            layoutRef.current,
            event.nativeEvent.offsetX,
            event.nativeEvent.offsetY,
            DOT_HIT_SLOP_PX,
          ),
        );
      }}
      onMouseMove={(event) => {
        const key = selectedDotKey(
          layoutRef.current,
          event.nativeEvent.offsetX,
          event.nativeEvent.offsetY,
          DOT_HIT_SLOP_PX,
        );
        event.currentTarget.style.cursor = key === null ? "default" : "pointer";
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.cursor = "default";
      }}
    />
  );
}

/**
 * 2D context for the dot plot, or null when the canvas cannot draw.
 * A host without canvas support throws instead of returning null; that is the same outcome.
 */
function canvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  try {
    return canvas.getContext("2d");
  } catch {
    return null;
  }
}
