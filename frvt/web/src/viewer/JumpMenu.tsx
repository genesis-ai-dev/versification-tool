import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError, describeApiError } from "../api/errors";
import { loadJumpMenu } from "../api/resolve";
import type { DeltaEntry, MisalignmentEntry, NavRef } from "../api/types";
import { formatBcvLabel } from "../lib/formatRef";
import { navigationToBcv } from "./jumpNavigation";
import type { DriveSide } from "./overlay/drawPlan";
import { useViewerSession } from "./ViewerSession";

/** Human labels for misalignment category codes from the server. */
const CATEGORY_LABELS: Record<string, string> = {
  psalm_title: "Psalm titles",
  chapter_boundary: "Chapter boundaries",
  chapter_count: "Chapter counts",
  lxx_psalm: "LXX Psalms",
  synodal: "Synodal",
  nt_omission: "NT omissions",
  other: "Other",
};

/** Props for the per-column jump menu. */
export interface JumpMenuProps {
  /** Column that will receive the jump navigation. */
  side: DriveSide;
  /** Disable when the counterpart translation is missing. */
  disabled?: boolean;
}

/** True when ``err`` is a fetch/AbortController cancellation. */
function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === "AbortError") ||
    (err instanceof Error && err.name === "AbortError")
  );
}

/**
 * Jump menu for mapped deltas, misalignments, and arbitrary verses.
 * Navigates using structured ``navigation`` only — never parses ranges.
 */
export function JumpMenu({ side, disabled = false }: JumpMenuProps) {
  const session = useViewerSession();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [deltas, setDeltas] = useState<DeltaEntry[]>([]);
  const [misalignments, setMisalignments] = useState<MisalignmentEntry[]>([]);
  const [mappedLoading, setMappedLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fromTo = useMemo(() => {
    const from = side === "left" ? session.url.left : session.url.right;
    const to = side === "left" ? session.url.right : session.url.left;
    const fromVers = side === "left" ? session.url.leftVers : session.url.rightVers;
    const toVers = side === "left" ? session.url.rightVers : session.url.leftVers;
    return { from, to, fromVers, toVers };
  }, [session.url, side]);

  const book =
    (side === "left" ? session.url.leftBcv?.book : session.url.rightBcv?.book) ??
    session.spansFor(side)[0]?.book;

  const loadKey = useMemo(
    () =>
      [
        fromTo.from ?? "",
        fromTo.to ?? "",
        fromTo.fromVers ?? "",
        fromTo.toVers ?? "",
        book ?? "",
      ].join("|"),
    [fromTo.from, fromTo.to, fromTo.fromVers, fromTo.toVers, book],
  );

  useEffect(() => {
    if (!open || !fromTo.from || !fromTo.to) {
      return;
    }
    const controller = new AbortController();
    setMappedLoading(true);
    setError(null);
    // Coalesce StrictMode remounts / rapid URL churn into one request.
    const timer = window.setTimeout(() => {
      void loadJumpMenu(
        fromTo.from!,
        fromTo.to!,
        book,
        {
          fromVersification: fromTo.fromVers,
          toVersification: fromTo.toVers,
        },
        { signal: controller.signal },
      )
        .then((page) => {
          if (controller.signal.aborted) {
            return;
          }
          setDeltas(page.deltas.items);
          setMisalignments(page.misalignments.items);
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted || isAbortError(err)) {
            return;
          }
          setError(
            err instanceof ApiError
              ? describeApiError(err)
              : err instanceof Error
                ? err.message
                : "Failed to load jumps",
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setMappedLoading(false);
          }
        });
    }, 75);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, loadKey, fromTo.from, fromTo.to, fromTo.fromVers, fromTo.toVers, book]);

  useEffect(() => {
    if (!open) {
      setMappedLoading(false);
      return;
    }
    // Avoid a flash of "(0) / None" before the load effect runs.
    setMappedLoading(true);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function navigateTo(nav: NavRef): void {
    session.setColumnBcv(side, navigationToBcv(nav));
    setOpen(false);
  }

  return (
    <div className="jump-menu" ref={rootRef}>
      <button
        type="button"
        className="btn"
        disabled={disabled || !fromTo.from}
        aria-expanded={open}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        Jump
      </button>
      {open && (
        <div className="jump-menu-panel">
          {disabled && (
            <p className="muted">Select a counterpart to load mapping jumps.</p>
          )}
          {error && <p className="error-text">{error}</p>}
          <section className="jump-menu-section">
            <h4>
              Mapped deltas
              {!mappedLoading && (
                <span className="jump-menu-count"> ({deltas.length})</span>
              )}
            </h4>
            <ul className="jump-menu-list">
              {mappedLoading && <li className="muted">Loading…</li>}
              {!mappedLoading &&
                deltas.map((entry) => (
                  <li
                    key={`${entry.navigation_ref}-${entry.navigation.part ?? ""}-${entry.relation}`}
                  >
                    <button
                      type="button"
                      className="linkish"
                      onClick={() => navigateTo(entry.navigation)}
                    >
                      {entry.source_ref}
                      {entry.base_ref ? ` → ${entry.base_ref}` : ""}
                    </button>
                  </li>
                ))}
              {!mappedLoading && deltas.length === 0 && <li className="muted">None</li>}
            </ul>
          </section>
          <section className="jump-menu-section">
            <h4>
              Misalignments
              {!mappedLoading && (
                <span className="jump-menu-count"> ({misalignments.length})</span>
              )}
            </h4>
            <ul className="jump-menu-list">
              {mappedLoading && <li className="muted">Loading…</li>}
              {!mappedLoading &&
                misalignments.map((entry) => (
                  <li
                    key={`${entry.category}-${entry.navigation_ref}-${entry.navigation.part ?? ""}-${entry.relation}`}
                  >
                    <button
                      type="button"
                      className="linkish"
                      onClick={() => navigateTo(entry.navigation)}
                    >
                      {CATEGORY_LABELS[entry.category] ?? entry.category}:{" "}
                      {entry.source_ref}
                    </button>
                  </li>
                ))}
              {!mappedLoading && misalignments.length === 0 && (
                <li className="muted">None</li>
              )}
            </ul>
          </section>
          <section className="jump-menu-section">
            <h4>Current chapter verses</h4>
            <ul className="jump-menu-list">
              {session.spansFor(side).map((span) => (
                <li key={span.id}>
                  <button
                    type="button"
                    className="linkish"
                    onClick={() =>
                      navigateTo({
                        book: span.book,
                        chapter: span.chapter,
                        verse: span.verse,
                        part: span.part,
                      })
                    }
                  >
                    {formatBcvLabel(span.book, span.chapter, span.verse, span.part)}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
