import type { DriveSide } from "./overlay/drawPlan";

/** Props for the non-interactive drive→follower direction cue. */
export interface DriveDirectionIndicatorProps {
  /** URL ``drive`` side that owns resolve ``from_translation``. */
  drive: DriveSide;
}

/**
 * Centered chrome-seam glyph pointing drive → follower.
 * Decorative only — does not change ``drive`` on interaction.
 */
export function DriveDirectionIndicator({ drive }: DriveDirectionIndicatorProps) {
  const label = drive === "left" ? "Drive: left → right" : "Drive: right → left";
  const glyph = drive === "left" ? "→" : "←";
  return (
    <div className="drive-direction-indicator" aria-label={label}>
      {glyph}
    </div>
  );
}
