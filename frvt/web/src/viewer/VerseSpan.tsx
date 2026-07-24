import { useEffect, useRef, type RefObject } from "react";
import type { VerseSpanOut } from "../api/types";
import { toResolveArgs } from "../lib/bcv";
import { formatVerseLabel } from "../lib/formatRef";
import type { DriveSide } from "./overlay/drawPlan";
import { useViewerSession } from "./ViewerSession";

/** Props for one rendered verse/partial span row. */
export interface VerseSpanProps {
  /** Physical column this span belongs to. */
  side: DriveSide;
  /** Span payload from the chapter cache. */
  span: VerseSpanOut;
  /** True when this span is in the current resolve highlight set. */
  highlighted: boolean;
}

/**
 * Render one verse row with DOM anchors for overlay measurement.
 * Click sets this column's current BCV and marks it as drive.
 */
export function VerseSpan({ side, span, highlighted }: VerseSpanProps) {
  const { setColumnBcv } = useViewerSession();
  const { ref } = toResolveArgs(span.book, span.chapter, span.verse, span.part);

  return (
    <div
      className={`verse-span${highlighted ? " is-highlighted" : ""}`}
      data-side={side}
      data-seq={span.seq}
      data-ref={ref}
      data-verse={span.verse}
      data-part={span.part ?? ""}
      role="button"
      tabIndex={0}
      onClick={() =>
        setColumnBcv(side, {
          book: span.book,
          chapter: span.chapter,
          verse: span.verse,
          part: span.part,
        })
      }
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setColumnBcv(side, {
            book: span.book,
            chapter: span.chapter,
            verse: span.verse,
            part: span.part,
          });
        }
      }}
    >
      <span className="verse-num">{formatVerseLabel(span.verse)}</span>
      <span className="verse-text">{span.content}</span>
    </div>
  );
}

/** Props for the scrollable verse list inside a column. */
export interface VerseListProps {
  side: DriveSide;
  spans: VerseSpanOut[];
  highlightKeys: Set<string>;
  /** Optional external ref to the scrollport (overlay + session). */
  listRef?: RefObject<HTMLDivElement | null>;
}

/**
 * Render chapter spans in ``seq`` order with highlight membership.
 * Registers the scrollport with ViewerSession for follower scrolling.
 */
export function VerseList({ side, spans, highlightKeys, listRef }: VerseListProps) {
  const { registerScrollRoot } = useViewerSession();
  const innerRef = useRef<HTMLDivElement>(null);
  const rootRef = listRef ?? innerRef;

  useEffect(() => {
    registerScrollRoot(side, rootRef.current);
    return () => registerScrollRoot(side, null);
  }, [registerScrollRoot, side, rootRef]);

  return (
    <div className="verse-list" ref={rootRef}>
      {spans.map((span) => (
        <VerseSpan
          key={`${span.id}`}
          side={side}
          span={span}
          highlighted={isSpanHighlighted(span, highlightKeys)}
        />
      ))}
    </div>
  );
}

/** Match resolved highlights by sequence, falling back to reference and part. */
function isSpanHighlighted(span: VerseSpanOut, highlightKeys: Set<string>): boolean {
  if (highlightKeys.has(`seq:${span.seq}`)) {
    return true;
  }
  const { ref } = toResolveArgs(span.book, span.chapter, span.verse, span.part);
  return highlightKeys.has(`ref:${ref}|${span.part ?? ""}`);
}
