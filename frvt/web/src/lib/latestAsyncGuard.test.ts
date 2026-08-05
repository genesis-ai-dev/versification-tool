import { describe, expect, it } from "vitest";
import { createLatestAsyncGuard } from "./latestAsyncGuard";

describe("createLatestAsyncGuard", () => {
  it("treats only the newest generation as latest", () => {
    const guard = createLatestAsyncGuard();
    const first = guard.start();
    const second = guard.start();
    expect(guard.isLatest(first)).toBe(false);
    expect(guard.isLatest(second)).toBe(true);
  });
});
