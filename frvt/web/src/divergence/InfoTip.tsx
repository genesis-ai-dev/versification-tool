import { useEffect, useId, useRef, useState, type ReactNode } from "react";

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
 * Escape and a click outside close the tip without closing the dialog.
 */
export function InfoTip({ label, text, children }: InfoTipProps) {
  const [open, setOpen] = useState(false);
  const tipId = useId();
  const rootRef = useRef<HTMLSpanElement>(null);

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
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
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
      {open && (
        <span id={tipId} role="tooltip" className="dv-tip-body">
          {text}
        </span>
      )}
    </span>
  );
}
