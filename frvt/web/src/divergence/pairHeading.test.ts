import { describe, expect, it } from "vitest";
import { pairHeading, type PairSide } from "./pairHeading";

/** A column with the given catalog names. A null scheme id is the preferred scheme. */
function side(
  translationName: string | null,
  schemeId: string | null,
  schemeName: string | null,
  translationId = "translation-id",
): PairSide {
  return { translationId, translationName, schemeId, schemeName };
}

describe("pairHeading", () => {
  it("names both translations and uses default only for the preferred scheme", () => {
    expect(
      pairHeading(
        side("American Standard Version", null, null, "asv"),
        side("Biblica® Open Bible (Simplified)", "chi", "Chinese", "ocb"),
      ),
    ).toBe(
      "American Standard Version (versification: default) → Biblica® Open Bible (Simplified) (versification: Chinese)",
    );
  });

  it("uses the translation id when the catalog name is missing", () => {
    expect(pairHeading(side("  ", null, null, "asv"), side(null, null, null, "ocb"))).toBe(
      "asv (versification: default) → ocb (versification: default)",
    );
  });

  it("uses the scheme id when a selected scheme has no catalog name", () => {
    expect(pairHeading(side("Left", "scheme-1", null), side("Right", "  ", "Ignored"))).toBe(
      "Left (versification: scheme-1) → Right (versification: default)",
    );
  });
});
