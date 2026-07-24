/**
 * Basic-auth helpers for Playwright e2e (credentials come from playwright.config).
 * Rule 12 does not apply to harness code; TC ids belong in test titles.
 */

/** Default base URL used when composing absolute API calls from e2e helpers. */
export const defaultBaseUrl = process.env.FRVT_E2E_BASE_URL ?? "http://localhost:8000";

/** Default Basic username mirrored from playwright.config / env. */
export const e2eUsername = process.env.FRVT_E2E_USER ?? "admin";

/** Default Basic password mirrored from playwright.config / env. */
export const e2ePassword = process.env.FRVT_E2E_PASSWORD ?? "Admin123!";
