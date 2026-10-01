import { useEffect, useId, useRef, type ReactNode } from "react";

/** Shared modal chrome props for manage/empty-state dialogs. */
export interface ModalShellProps {
  /** Dialog title shown in the header. */
  title: string;
  /** Body content (form fields, confirm copy, etc.). */
  children: ReactNode;
  /** Close without applying (backdrop / cancel). */
  onClose: () => void;
  /** ``default`` is the manage-page width. ``fullscreen`` is the comparison. */
  size?: "default" | "fullscreen";
  /**
   * Called before Escape closes the dialog.
   * Return true when the content consumed the key.
   */
  onEscape?: () => boolean;
}

/**
 * Accessible dialog chrome with backdrop click-to-dismiss.
 * Reused by all manage modals to keep focus and styling consistent.
 */
export function ModalShell({
  title,
  children,
  onClose,
  size = "default",
  onEscape,
}: ModalShellProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const backdropDown = useRef(false);
  const onCloseRef = useRef(onClose);
  const onEscapeRef = useRef(onEscape);
  const headingId = useId();
  onCloseRef.current = onClose;
  onEscapeRef.current = onEscape;

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const modal = modalRef.current;
    const focusableSelector =
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusables = () =>
      Array.from(modal?.querySelectorAll<HTMLElement>(focusableSelector) ?? []);
    focusables()[0]?.focus();

    /** Close on Escape and keep Tab navigation inside the active dialog. */
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (onEscapeRef.current?.()) {
          event.preventDefault();
          return;
        }
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      const items = focusables();
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, []);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        backdropDown.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && backdropDown.current) {
          onClose();
        }
      }}
    >
      <div
        className={size === "fullscreen" ? "modal modal-fullscreen" : "modal"}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        ref={modalRef}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <h3 id={headingId}>{title}</h3>
          <button
            type="button"
            className="btn ghost"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
