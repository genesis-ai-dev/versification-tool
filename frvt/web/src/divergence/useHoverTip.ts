import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Wait before a hover tip appears.
 * A native title waits about 500ms, and that wait cannot be changed. This is half of it.
 */
const HOVER_TIP_DELAY_MS = 250;

/** Pixels between the pointer and the tip, so the tip does not cover what it describes. */
const HOVER_TIP_OFFSET_PX = 12;

/** An open hover tip and where it sits in the viewport. */
export interface HoverTipState {
  /** Sentence shown beside the pointer. */
  text: string;
  /** Horizontal viewport position, already offset from the pointer. */
  x: number;
  /** Vertical viewport position, already offset from the pointer. */
  y: number;
}

/** What ``useHoverTip`` hands to the component that owns the tip. */
export interface HoverTipControls {
  /** The open tip, or null while none is shown. */
  tip: HoverTipState | null;
  /** Arm a tip for ``text`` at a pointer position. It opens after the delay. */
  show: (text: string, x: number, y: number) => void;
  /** Cancel a pending tip and close an open one. */
  hide: () => void;
}

/**
 * Delayed pointer tip shared by the donut slices and the column's side names.
 * Use it where a native ``title`` is not allowed, which is everywhere inside the dialog.
 * ``show`` and ``hide`` keep their identity across renders, so they are safe effect
 * dependencies. A pending timer is cleared on unmount. Render ``tip`` with ``HoverTipBody``.
 */
export function useHoverTip(): HoverTipControls {
  const [tip, setTip] = useState<HoverTipState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Drop a pending tip. An open tip is left as it is. */
  const cancel = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);
  /** Close an open tip and drop a pending one. */
  const hide = useCallback(() => {
    cancel();
    setTip(null);
  }, [cancel]);
  /**
   * Start the wait for a tip at the pointer.
   * A tip already waiting or open is replaced, so moving between slices does not
   * leave the previous sentence up.
   */
  const show = useCallback(
    (text: string, x: number, y: number) => {
      hide();
      timer.current = setTimeout(() => {
        timer.current = null;
        setTip({ text, x: x + HOVER_TIP_OFFSET_PX, y: y + HOVER_TIP_OFFSET_PX });
      }, HOVER_TIP_DELAY_MS);
    },
    [hide],
  );
  useEffect(() => cancel, [cancel]);
  return { tip, show, hide };
}
