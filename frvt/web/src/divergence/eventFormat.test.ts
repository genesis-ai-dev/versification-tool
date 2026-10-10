import { describe, expect, it } from "vitest";
import { flagText, formatRef, typeLabel } from "./eventFormat";

describe("formatRef", () => {
  it("names a range, a single verse, a cross-chapter span, and a missing side", () => {
    expect(formatRef(["PSA", 60, 1, 60, 12])).toBe("PSA 60:1–12");
    expect(formatRef(["PSA", 60, 1, 60, 1])).toBe("PSA 60:1");
    expect(formatRef(["PSA", 61, 0, 65, 13])).toBe("PSA 61:0–65:13");
    expect(formatRef(null)).toBe("—");
  });
});

describe("typeLabel", () => {
  it("uses the catalog label and returns an unknown id unchanged", () => {
    expect(typeLabel("CHAPTER_MOVE")).toBe("Chapter move");
    expect(typeLabel("OTHER")).toBe("OTHER");
    expect(typeLabel("ONE_SIDED")).toBe("Present on one side only");
    expect(typeLabel("BOOK_ONE_SIDED")).toBe("Book on one side only");
  });
});

describe("flagText", () => {
  it("names the translation a verse is missing from", () => {
    expect(flagText("missingInB", { a: "eng", b: "vul" })).toBe("missing in vul");
  });
});
