import { describe, expect, it } from "vitest";
import { formatVersificationOptionLabel } from "./formatVersificationOption";

describe("formatVersificationOptionLabel", () => {
  it("appends based-on when present", () => {
    expect(
      formatVersificationOptionLabel({
        name: "English",
        basedOnName: "org",
        preferred: false,
      }),
    ).toBe("English (based on org)");
  });

  it("places preferred star after the full based-on label", () => {
    expect(
      formatVersificationOptionLabel({
        name: "English",
        basedOnName: "org",
        preferred: true,
      }),
    ).toBe("English (based on org) ★");
  });

  it("omits based-on for root schemes", () => {
    expect(
      formatVersificationOptionLabel({
        name: "org",
        basedOnName: null,
        preferred: false,
      }),
    ).toBe("org");
  });

  it("keeps preferred star on root schemes without based-on", () => {
    expect(
      formatVersificationOptionLabel({
        name: "org",
        basedOnName: null,
        preferred: true,
      }),
    ).toBe("org ★");
  });
});
