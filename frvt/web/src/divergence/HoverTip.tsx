import type { ReactNode } from "react";
import { useHoverTip, type HoverTipState } from "./useHoverTip";

/** Props for the tip box drawn from a ``useHoverTip`` result. */
export interface HoverTipBodyProps {
  /** The open tip, or null while none is shown. */
  tip: HoverTipState | null;
}

/**
 * Tip box for a ``useHoverTip`` state, or nothing while the tip is closed.
 * It renders in place with ``position: fixed``, so a clipping ancestor such as a
 * truncated label does not cut it off, and it stays inside the dialog's stacking context.
 */
export function HoverTipBody({ tip }: HoverTipBodyProps) {
  if (tip === null) {
    return null;
  }
  return (
    <span className="dv-hover-tip" role="tooltip" style={{ left: tip.x, top: tip.y }}>
      {tip.text}
    </span>
  );
}

/** Props for inline content that shows a delayed tip on hover. */
export interface HoverTipProps {
  /** Full text shown in the tip. */
  text: string;
  /** Visible content the pointer hovers. */
  children: ReactNode;
  /**
   * Class on the visible wrapper.
   * Use it to ellipsize a translation name. The tip itself stays fixed, so this
   * clip does not hide the full name. Do not combine it with a transform, filter,
   * or contain, because those would trap the tip inside the clipped name.
   */
  className?: string;
}

/**
 * Inline wrapper that shows ``text`` in a tip after the pointer rests on ``children``.
 * Use it for content cut short on screen, such as a long translation name.
 * Leaving the content cancels or closes the tip. The tip is fixed so a clipping
 * class on the wrapper does not cut it off.
 */
export function HoverTip({ text, children, className }: HoverTipProps) {
  const { tip, show, hide } = useHoverTip();
  return (
    <span
      className={className}
      onPointerEnter={(event) => show(text, event.clientX, event.clientY)}
      onPointerLeave={hide}
    >
      {children}
      <HoverTipBody tip={tip} />
    </span>
  );
}
