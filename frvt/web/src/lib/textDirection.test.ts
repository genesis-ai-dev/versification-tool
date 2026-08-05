import { describe, expect, it } from "vitest";
import type { TranslationOut } from "../api/types";
import { textDirectionForTranslation } from "./textDirection";

function translation(
  overrides: Partial<TranslationOut> = {},
): TranslationOut {
  return {
    id: "t1",
    name: "Sample",
    language: "en",
    text_direction: "ltr",
    source_format: "usx",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("textDirection helpers", () => {
  it("defaults to ltr when translation is missing", () => {
    expect(textDirectionForTranslation(undefined)).toBe("ltr");
  });

  it("returns rtl from translation metadata", () => {
    expect(
      textDirectionForTranslation(translation({ text_direction: "rtl" })),
    ).toBe("rtl");
  });
});
