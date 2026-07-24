import { useRef } from "react";
import { MappingOverlay } from "./overlay/MappingOverlay";
import { ScriptureColumn } from "./ScriptureColumn";
import { useViewerSession } from "./ViewerSession";

/**
 * Two-column workspace with an absolute SVG overlay sibling.
 * Columns scroll independently; overlay measures in workspace coordinates.
 */
export function ViewerWorkspace() {
  const session = useViewerSession();
  const workspaceRef = useRef<HTMLDivElement>(null);
  const leftColumnRef = useRef<HTMLElement | null>(null);
  const rightColumnRef = useRef<HTMLElement | null>(null);
  const leftSpanCount = session.spansFor("left").length;
  const rightSpanCount = session.spansFor("right").length;
  const layoutKey = [
    session.url.leftBcv?.book,
    session.url.leftBcv?.chapter,
    leftSpanCount,
    session.url.rightBcv?.book,
    session.url.rightBcv?.chapter,
    rightSpanCount,
  ].join("|");

  return (
    <div className="viewer-workspace" ref={workspaceRef}>
      <div className="workspace-columns">
        <ScriptureColumn side="left" scrollRef={leftColumnRef} />
        <ScriptureColumn side="right" scrollRef={rightColumnRef} />
      </div>
      <MappingOverlay
        workspaceRef={workspaceRef}
        leftColumnRef={leftColumnRef}
        rightColumnRef={rightColumnRef}
        result={session.resolveResult}
        mapEnabled={session.url.map && session.canResolve}
        driveSide={session.url.drive}
        layoutKey={layoutKey}
      />
    </div>
  );
}
