import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { keepOnScreen, type TipPlace } from "./tipPlace";
import { useHoverTip, type HoverTipState } from "./useHoverTip";

/** Props for the tip box drawn from a ``useHoverTip`` result. */
export interface HoverTipBodyProps {
  /** The open tip, or null while none is shown. */
  tip: HoverTipState | null;
}

/**
 * Tip box for a ``useHoverTip`` state, or nothing while the tip is closed.
 * It is drawn on the document body, so a clipping ancestor such as the dialog
 * or a truncated label does not cut it off. It may extend past the dialog.
 */
export function HoverTipBody({ tip }: HoverTipBodyProps) {
  const tipRef = useRef<HTMLSpanElement>(null);
  const [place, setPlace] = useState<TipPlace | null>(null);
  useLayoutEffect(() => {
    const node = tipRef.current;
    if (tip === null || node === null) {
      return;
    }
    const box = node.getBoundingClientRect();
    setPlace(
      keepOnScreen(tip.x, tip.y, box.width, box.height, {
        width: window.innerWidth,
        height: window.innerHeight,
      }),
    );
  }, [tip]);
  if (tip === null) {
    return null;
  }
  return createPortal(
    <span
      ref={tipRef}
      className="dv-hover-tip"
      role="tooltip"
      style={{ left: place?.left ?? tip.x, top: place?.top ?? tip.y }}
    >
      {tip.text}
    </span>,
    document.body,
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
   * Use it to ellipsize a translation name. The tip is drawn on the document
   * body, so this clip does not hide the full name.
   */
  className?: string;
}

/**
 * Inline wrapper that shows ``text`` in a tip after the pointer rests on ``children``.
 * Use it for content cut short on screen, such as a long translation name.
 * Leaving the content cancels or closes the tip. The tip is drawn on the
 * document body, so a clipping class on the wrapper does not cut it off.
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
