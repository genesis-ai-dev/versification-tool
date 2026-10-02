/**
 * Circled info mark for a layer explanation.
 * The tip button supplies the accessible name, so this graphic stays hidden
 * from assistive tech.
 */
export function InfoIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="dv-info-icon">
      <circle
        cx="8"
        cy="8"
        r="6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      <circle cx="8" cy="5.15" r="0.85" fill="currentColor" />
      <path d="M8 7.25v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
