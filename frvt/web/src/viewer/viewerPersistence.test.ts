import { afterEach, describe, expect, it } from "vitest";
import {
  VIEWER_STORAGE_KEY,
  hasExplicitViewerParams,
  loadViewerSearch,
  saveViewerSearch,
  sanitizeViewerSearch,
} from "./viewerPersistence";

describe("viewerPersistence", () => {
  afterEach(() => {
    localStorage.removeItem(VIEWER_STORAGE_KEY);
  });

  it("round-trips save and load", () => {
    const search = "left=a&right=b&drive=left&map=1";
    saveViewerSearch(search);
    expect(loadViewerSearch()).toBe(search);
  });

  it("detects explicit translation params", () => {
    expect(hasExplicitViewerParams("")).toBe(false);
    expect(hasExplicitViewerParams("drive=left&map=1")).toBe(false);
    expect(hasExplicitViewerParams("left=a&drive=left")).toBe(true);
    expect(hasExplicitViewerParams("right=b&drive=left")).toBe(true);
  });

  it("sanitize drops unknown translation and versification ids", () => {
    const search =
      "left=gone&right=keep&lvers=bad-scheme&rvers=good-scheme&drive=left&map=1";
    const sanitized = sanitizeViewerSearch(search, {
      translationIds: new Set(["keep"]),
      versificationIds: new Set(["good-scheme"]),
    });
    const params = new URLSearchParams(sanitized);
    expect(params.get("left")).toBeNull();
    expect(params.get("right")).toBe("keep");
    expect(params.get("lvers")).toBeNull();
    expect(params.get("rvers")).toBe("good-scheme");
  });
});
