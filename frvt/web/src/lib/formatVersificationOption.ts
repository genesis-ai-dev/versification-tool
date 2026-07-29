/**
 * Build native ``<option>`` display text for a column versification choice.
 * Appends ``(based on …)`` when a parent scheme name is known, then optional preferred ★.
 */
export function formatVersificationOptionLabel(args: {
  name: string;
  basedOnName: string | null;
  preferred: boolean;
}): string {
  const base = args.basedOnName
    ? `${args.name} (based on ${args.basedOnName})`
    : args.name;
  return args.preferred ? `${base} ★` : base;
}
