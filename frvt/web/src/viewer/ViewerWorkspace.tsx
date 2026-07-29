import { useMemo, useRef } from "react";
import { DriveDirectionIndicator } from "./DriveDirectionIndicator";
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
  const driveBcv =
    session.url.drive === "left" ? session.url.leftBcv : session.url.rightBcv;
  const layoutKey = [
    session.url.leftBcv?.book,
    session.url.leftBcv?.chapter,
    leftSpanCount,
    session.url.rightBcv?.book,
    session.url.rightBcv?.chapter,
    rightSpanCount,
    session.url.mapMode,
    session.chapterResolveItems?.length ?? 0,
  ].join("|");

  const overlayDriveBcv = useMemo(
    () =>
      driveBcv
        ? {
            book: driveBcv.book,
            chapter: driveBcv.chapter,
            verse: driveBcv.verse,
            part: driveBcv.part,
          }
        : null,
    [driveBcv],
  );

  return (
    <div className="viewer-workspace" ref={workspaceRef}>
      <div className="workspace-columns">
        <ScriptureColumn side="left" scrollRef={leftColumnRef} />
        <ScriptureColumn side="right" scrollRef={rightColumnRef} />
      </div>
      {session.canResolve ? <DriveDirectionIndicator drive={session.url.drive} /> : null}
      <MappingOverlay
        workspaceRef={workspaceRef}
        leftColumnRef={leftColumnRef}
        rightColumnRef={rightColumnRef}
        result={session.resolveResult}
        chapterResults={session.chapterResolveItems}
        mapMode={session.url.mapMode}
        driveSide={session.url.drive}
        driveBcv={overlayDriveBcv}
        layoutKey={layoutKey}
      />
    </div>
  );
}
