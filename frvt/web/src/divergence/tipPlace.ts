/** Gap between a trigger and the tip that opens under it, in pixels. */
const TIP_GAP_PX = 4;

/** Space kept between a tip and the viewport edge, in pixels. */
const TIP_MARGIN_PX = 8;

/** Where a tip sits in the viewport. */
export interface TipPlace {
  /** Left edge, in viewport pixels. */
  left: number;
  /** Top edge, in viewport pixels. */
  top: number;
}

/** Width and height of the viewport a tip must stay inside. */
export interface TipViewport {
  /** Viewport width, in pixels. */
  width: number;
  /** Viewport height, in pixels. */
  height: number;
}

/**
 * Pull a tip back inside the viewport.
 * A tip that already fits is left where it is, so it may still cross the dialog.
 * Use this for a tip whose position is already chosen, such as a hover tip.
 */
export function keepOnScreen(
  left: number,
  top: number,
  width: number,
  height: number,
  viewport: TipViewport,
): TipPlace {
  let x = left;
  let y = top;
  if (x + width > viewport.width - TIP_MARGIN_PX) {
    x = viewport.width - TIP_MARGIN_PX - width;
  }
  if (x < TIP_MARGIN_PX) {
    x = TIP_MARGIN_PX;
  }
  if (y + height > viewport.height - TIP_MARGIN_PX) {
    y = viewport.height - TIP_MARGIN_PX - height;
  }
  if (y < TIP_MARGIN_PX) {
    y = TIP_MARGIN_PX;
  }
  return { left: x, top: y };
}

/**
 * Place a tip just under its trigger, moving it above the trigger when the
 * viewport is too short. It may cross the dialog. Only the viewport pulls it back.
 */
export function placeTip(anchor: DOMRect, tip: DOMRect, viewport: TipViewport): TipPlace {
  let top = anchor.bottom + TIP_GAP_PX;
  const above = anchor.top - TIP_GAP_PX - tip.height;
  if (top + tip.height > viewport.height - TIP_MARGIN_PX && above >= TIP_MARGIN_PX) {
    top = above;
  }
  return keepOnScreen(anchor.left, top, tip.width, tip.height, viewport);
}
