import { useEffect, useRef, type RefObject } from "react";
import type { DriveSide } from "./overlay/drawPlan";
import { ColumnChrome } from "./ColumnChrome";
import { highlightKeysFor } from "./highlightKeys";
import { VerseList } from "./VerseSpan";
import { useViewerSession } from "./ViewerSession";

/** Props for one scripture column (chrome + verse list or placeholder). */
export interface ScriptureColumnProps {
  side: DriveSide;
  /** Optional ref to the verse-list scrollport for overlay measurement. */
  scrollRef?: RefObject<HTMLElement | null>;
}

/**
 * One viewer column: chrome selectors plus seq-ordered verse list.
 * Shows a placeholder when no translation is selected on this side.
 */
export function ScriptureColumn({ side, scrollRef }: ScriptureColumnProps) {
  const session = useViewerSession();
  const translationId = side === "left" ? session.url.left : session.url.right;
  const spans = session.spansFor(side);
  const resolveDisabled = !session.canResolve;
  const localRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scrollRef) {
      return;
    }
    scrollRef.current = localRef.current;
    return () => {
      scrollRef.current = null;
    };
  });

  const highlightSpans =
    session.resolveResult == null
      ? []
      : session.url.drive === side
        ? session.resolveResult.source_spans
        : session.resolveResult.target_spans;
  const highlightKeys = highlightKeysFor(highlightSpans);

  if (!translationId) {
    return (
      <section className="scripture-column">
        <ColumnChrome side={side} resolveDisabled />
        <div className="column-placeholder" ref={localRef}>
          Select a second translation
        </div>
      </section>
    );
  }

  return (
    <section className="scripture-column">
      <ColumnChrome side={side} resolveDisabled={resolveDisabled} />
      <VerseList
        side={side}
        spans={spans}
        highlightKeys={highlightKeys}
        listRef={localRef}
      />
    </section>
  );
}
