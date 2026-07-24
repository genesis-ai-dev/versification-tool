import { describe, expect, it } from "vitest";
import { parseViewerSearch, serializeViewerSearch } from "../viewer/viewerUrl";
import { columnToResolveArgs } from "../lib/bcv";

describe("viewer URL resolve mapping", () => {
  it("maps drive=left to from=left / to=right", () => {
    const url = parseViewerSearch("left=aaa&right=bbb&lb=GEN&lc=1&lv=1&drive=left&map=1");
    expect(url.drive).toBe("left");
    const args = columnToResolveArgs(url.leftBcv!);
    expect(args.ref).toBe("GEN 1:1");
    expect(args.part).toBeNull();
  });

  it("maps drive=right to from=right / to=left with separate part", () => {
    const url = parseViewerSearch(
      "left=aaa&right=bbb&rb=SIR&rc=36&rv=13&rp=a&drive=right&lvers=s1&rvers=s2",
    );
    expect(url.drive).toBe("right");
    expect(url.leftVers).toBe("s1");
    expect(url.rightVers).toBe("s2");
    const args = columnToResolveArgs(url.rightBcv!);
    expect(args).toEqual({ ref: "SIR 36:13", part: "a" });
    expect(args.ref.includes("a")).toBe(false);
  });

  it("round-trips map and versification params", () => {
    const original = parseViewerSearch("left=a&right=b&map=0&lvers=x&drive=right");
    const encoded = serializeViewerSearch(original);
    const again = parseViewerSearch(encoded);
    expect(again.map).toBe(false);
    expect(again.leftVers).toBe("x");
    expect(again.drive).toBe("right");
  });
});
