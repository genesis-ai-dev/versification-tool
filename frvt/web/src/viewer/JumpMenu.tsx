import { useMemo, useState } from "react";
import { ApiError, describeApiError } from "../api/errors";
import { listDeltas, listMisalignments } from "../api/resolve";
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

/**
 * Jump menu for mapped deltas, misalignments, and arbitrary verses.
 * Navigates using structured ``navigation`` only — never parses ranges.
 */
export function JumpMenu({ side, disabled = false }: JumpMenuProps) {
  const session = useViewerSession();
  const [open, setOpen] = useState(false);
  const [deltas, setDeltas] = useState<DeltaEntry[]>([]);
  const [misalignments, setMisalignments] = useState<MisalignmentEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fromTo = useMemo(() => {
    const from = side === "left" ? session.url.left : session.url.right;
    const to = side === "left" ? session.url.right : session.url.left;
    const fromVers = side === "left" ? session.url.leftVers : session.url.rightVers;
    const toVers = side === "left" ? session.url.rightVers : session.url.leftVers;
    return { from, to, fromVers, toVers };
  }, [session.url, side]);

  const book = side === "left" ? session.url.leftBcv?.book : session.url.rightBcv?.book;

  async function loadEntries(): Promise<void> {
    if (!fromTo.from) {
      return;
    }
    if (!fromTo.to) {
      setDeltas([]);
      setMisalignments([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const overrides = {
        fromVersification: fromTo.fromVers,
        toVersification: fromTo.toVers,
      };
      const [deltaPage, misPage] = await Promise.all([
        listDeltas(fromTo.from, fromTo.to, book, overrides),
        listMisalignments(fromTo.from, fromTo.to, undefined, overrides),
      ]);
      setDeltas(deltaPage.items);
      setMisalignments(misPage.items);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? describeApiError(err)
          : err instanceof Error
            ? err.message
            : "Failed to load jumps",
      );
    } finally {
      setLoading(false);
    }
  }

  function navigateTo(nav: NavRef): void {
    session.setColumnBcv(side, navigationToBcv(nav));
    setOpen(false);
  }

  return (
    <div className="jump-menu">
      <button
        type="button"
        className="btn"
        disabled={disabled || !fromTo.from}
        aria-expanded={open}
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) {
            void loadEntries();
          }
        }}
      >
        Jump
      </button>
      {open && (
        <div className="jump-menu-panel">
          {disabled && (
            <p className="muted">Select a counterpart to load mapping jumps.</p>
          )}
          {loading && <p className="muted">Loading…</p>}
          {error && <p className="error-text">{error}</p>}
          {!loading && (
            <>
              <section>
                <h4>Mapped deltas</h4>
                <ul>
                  {deltas.map((entry) => (
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
                  {deltas.length === 0 && <li className="muted">None</li>}
                </ul>
              </section>
              <section>
                <h4>Misalignments</h4>
                <ul>
                  {misalignments.map((entry) => (
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
                  {misalignments.length === 0 && <li className="muted">None</li>}
                </ul>
              </section>
              <section>
                <h4>Current chapter verses</h4>
                <ul>
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
            </>
          )}
        </div>
      )}
    </div>
  );
}
