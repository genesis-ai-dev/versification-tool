import { useEffect, useRef, type RefObject } from "react";
import { textDirectionForTranslation } from "../lib/textDirection";
import type { DriveSide } from "./overlay/drawPlan";
import { ColumnChrome } from "./ColumnChrome";
import { columnHighlightKeys } from "./columnHighlights";
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
  const textDirection = textDirectionForTranslation(
    session.translations.find((t) => t.id === translationId),
  );
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

  const columnBcv = side === "left" ? session.url.leftBcv : session.url.rightBcv;
  const driveBcv =
    session.url.drive === "left" ? session.url.leftBcv : session.url.rightBcv;
  const selectionSettled =
    !session.selectionPending && !session.resolveLoading;
  const highlightKeys = columnHighlightKeys(
    side,
    session.url.drive,
    columnBcv,
    driveBcv,
    spans,
    session.resolveResult,
    session.resolveDriveSide,
    selectionSettled,
  );

  const columnClass =
    session.url.drive === side ? "scripture-column is-source" : "scripture-column";

  if (!translationId) {
    return (
      <section className={columnClass} data-side={side}>
        <ColumnChrome side={side} resolveDisabled />
        <div className="column-placeholder" ref={localRef}>
          Select a second translation
        </div>
      </section>
    );
  }

  return (
    <section className={columnClass} data-side={side}>
      <ColumnChrome side={side} resolveDisabled={resolveDisabled} />
      <VerseList
        side={side}
        spans={spans}
        highlightKeys={highlightKeys}
        textDirection={textDirection}
        listRef={localRef}
      />
    </section>
  );
}
