/** Association fields the launcher needs. */
export interface SchemeAssociation {
  scheme_id: string;
}

/**
 * Whether the toolbar button can open a comparison.
 * A missing scheme id uses the preferred association. A stale id does not.
 */
export function divergenceLauncherEnabled(
  canResolve: boolean,
  leftSchemeId: string | null,
  rightSchemeId: string | null,
  leftAssociations: readonly SchemeAssociation[],
  rightAssociations: readonly SchemeAssociation[],
): boolean {
  if (!canResolve) {
    return false;
  }
  return (
    schemeSelected(leftSchemeId, leftAssociations) &&
    schemeSelected(rightSchemeId, rightAssociations)
  );
}

/** True when the URL did not pin a scheme, or the pin is still associated. */
function schemeSelected(
  schemeId: string | null,
  associations: readonly SchemeAssociation[],
): boolean {
  if (schemeId === null) {
    return true;
  }
  return associations.some((item) => item.scheme_id === schemeId);
}
