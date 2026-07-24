import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for FRVT e2e suites.
 * The API+UI server must already be running (external server mode — no webServer).
 * Default: http://localhost:8000 with Basic admin / Admin123!
 */
const baseURL = process.env.FRVT_E2E_BASE_URL ?? "http://localhost:8000";
const username = process.env.FRVT_E2E_USER ?? "admin";
const password = process.env.FRVT_E2E_PASSWORD ?? "Admin123!";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 45_000 },
  reporter: [["list"]],
  use: {
    baseURL,
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 800 },
    httpCredentials: { username, password },
    // Send Basic on the first request (avoids challenge round-trips that burn the test budget).
    extraHTTPHeaders: {
      Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
    },
    actionTimeout: 45_000,
    navigationTimeout: 60_000,
    trace: "on-first-retry",
  },
  projects: [
    { name: "smoke", testMatch: /smoke\.spec\.ts/ },
    { name: "viewer", testMatch: /viewer\.spec\.ts/ },
    { name: "overlay", testMatch: /overlay\.spec\.ts/ },
    { name: "manage", testMatch: /manage\.spec\.ts/ },
    { name: "auth", testMatch: /auth\.spec\.ts/ },
  ],
});
