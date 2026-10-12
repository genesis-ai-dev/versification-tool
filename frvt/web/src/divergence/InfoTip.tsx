import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { placeTip, type TipPlace } from "./tipPlace";

/** Props for an explanation that opens from a legend item. */
export interface InfoTipProps {
  /** Accessible name for the trigger. */
  label: string;
  /** Explanation shown while the tip is open. */
  text: string;
  /** Trigger content, usually a short label. */
  children: ReactNode;
}

/**
 * Click-to-open explanation.
 * The tip is drawn on the document body, so the dialog cannot clip it, and it
 * may extend past the dialog. Escape and a click outside close the tip without
 * closing the dialog.
 */
export function InfoTip({ label, text, children }: InfoTipProps) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<TipPlace | null>(null);
  const tipId = useId();
  const rootRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    /** Follow the trigger while the dialog scrolls or the window changes size. */
    const update = () => {
      const button = rootRef.current?.querySelector("button");
      const tip = tipRef.current;
      if (button === null || button === undefined || tip === null) {
        return;
      }
      setPlace(
        placeTip(button.getBoundingClientRect(), tip.getBoundingClientRect(), {
          width: window.innerWidth,
          height: window.innerHeight,
        }),
      );
    };
    update();
    window.addEventListener("resize", update);
    document.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      document.removeEventListener("scroll", update, true);
    };
  }, [open, text]);

  useEffect(() => {
    if (!open) {
      return;
    }
    /** Close this tip only. The dialog keeps its own Escape handler. */
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.stopPropagation();
      event.preventDefault();
      setOpen(false);
    };
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || tipRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  return (
    <span className="dv-tip" ref={rootRef}>
      <button
        type="button"
        className="dv-tip-trigger"
        aria-expanded={open}
        aria-controls={tipId}
        aria-label={label}
        onClick={() => setOpen((value) => !value)}
      >
        {children}
      </button>
      {open &&
        createPortal(
          <span
            id={tipId}
            ref={tipRef}
            role="tooltip"
            className="dv-tip-body"
            style={place === null ? undefined : { left: place.left, top: place.top }}
          >
            {text}
          </span>,
          document.body,
        )}
    </span>
  );
}
