import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { apiGet } from "./client";

const apiDir = dirname(fileURLToPath(import.meta.url));

/** Collect TypeScript sources under ``src/api`` for static credential checks. */
function apiSourceFiles(): string[] {
  return readdirSync(apiDir)
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .map((name) => join(apiDir, name));
}

describe("credentials never logged", () => {
  it("TC-UI-026: api sources never log Authorization headers or passwords", () => {
    const offenders: string[] = [];
    for (const path of apiSourceFiles()) {
      const source = readFileSync(path, "utf8");
      if (/console\.(log|debug|info|warn|error)\s*\(/.test(source)) {
        if (/Authorization|password|passwd|Basic\s+/i.test(source)) {
          offenders.push(path);
        }
      }
      if (/headers\s*:\s*\{[^}]*Authorization/s.test(source)) {
        offenders.push(`${path} (sets Authorization header)`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("TC-UI-026: apiGet fetch path does not console-log request credentials", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await apiGet<{ ok: boolean }>("/api/health");

    const allCalls = [...log.mock.calls, ...debug.mock.calls, ...info.mock.calls, ...warn.mock.calls, ...error.mock.calls]
      .flat()
      .map(String);
    expect(allCalls.some((msg) => /Authorization|password|Basic\s+/i.test(msg))).toBe(
      false,
    );

    log.mockRestore();
    debug.mockRestore();
    info.mockRestore();
    warn.mockRestore();
    error.mockRestore();
    vi.unstubAllGlobals();
  });
});
