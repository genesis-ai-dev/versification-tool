import { test, expect } from "@playwright/test";

/**
 * Auth and OOS login-route e2e (Basic via Playwright httpCredentials).
 * Phase gate project: auth (run with smoke for phase 7).
 */
test.describe("Auth e2e", () => {
  test("TC-AUTH-002: root loads with Basic and no in-app login form", async ({
    page,
  }) => {
    const response = await page.goto("/");
    expect(response, "navigation should return a response").not.toBeNull();
    expect(response!.status()).toBeLessThan(400);
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Viewer", exact: true })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Translations", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Versifications", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel(/username|password|email/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /sign in|log in|login/i })).toHaveCount(
      0,
    );
  });

  test("TC-OOS-003: no custom login route", async ({ page }) => {
    await page.goto("/login");
    // Unknown routes redirect to viewer; there is no login form route.
    await expect(page).toHaveURL(/\/($|\?)/);
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
    await expect(page.locator("form").filter({ hasText: /password/i })).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: /sign in|log in|login/i }),
    ).toHaveCount(0);
  });

  test("TC-AUTH-013: auth-failure banner after repeated 401s", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();

    let apiHits = 0;
    await page.route("**/api/**", async (route) => {
      apiHits += 1;
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Unauthorized", code: "unauthorized" }),
        headers: { "WWW-Authenticate": 'Basic realm="FRVT"' },
      });
    });

    // Force catalog refresh / navigation that issues API calls after credentials "fail".
    await page.getByRole("link", { name: "Translations" }).click();
    await page.getByRole("link", { name: "Viewer" }).click();
    await expect.poll(() => apiHits, { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
    await expect(
      page.getByText("Authentication required — reload and sign in"),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /sign in|log in|login/i })).toHaveCount(
      0,
    );
  });
});
