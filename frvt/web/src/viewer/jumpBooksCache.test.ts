import { describe, expect, it } from "vitest";
import { jumpBooksCacheKey } from "./viewerCache";

describe("jumpBooksCacheKey", () => {
  it("includes translation pair and versification overrides", () => {
    expect(jumpBooksCacheKey("a", "b", null, null)).toBe("a|b||");
    expect(jumpBooksCacheKey("a", "b", "from", "to")).toBe("a|b|from|to");
  });
});
