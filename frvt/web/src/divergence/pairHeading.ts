/** One translation column in the comparison heading. */
export interface PairSide {
  /** Id used when the catalog has no name for this translation. */
  translationId: string;
  /** Catalog name, or null when that translation is not loaded. */
  translationName: string | null;
  /** Null or empty when this column uses the preferred scheme. */
  schemeId: string | null;
  /** Catalog name for ``schemeId``, or null when that scheme is not loaded. */
  schemeName: string | null;
}

/**
 * Heading for the two open columns.
 * The caller passes the left translation first and the right translation second.
 * A preferred scheme is the word ``default``. A missing catalog name falls back to the id.
 */
export function pairHeading(source: PairSide, target: PairSide): string {
  return `${translationText(source)} (versification: ${versificationText(source)}) → ${translationText(target)} (versification: ${versificationText(target)})`;
}

/** Translation name, or its id when the catalog row has no usable name. */
function translationText(side: PairSide): string {
  const name = side.translationName?.trim() ?? "";
  return name.length > 0 ? name : side.translationId;
}

/**
 * Versification word for one column.
 * A null or blank scheme id is the preferred scheme. Any other id keeps its own name.
 */
function versificationText(side: PairSide): string {
  if (side.schemeId === null || side.schemeId.trim() === "") {
    return "default";
  }
  const name = side.schemeName?.trim() ?? "";
  return name.length > 0 ? name : side.schemeId;
}
