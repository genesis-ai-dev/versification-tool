import { apiGet } from "./client";

/** Lightweight readiness probe used by the shell banner. */
export function getHealth(): Promise<{ status: string }> {
  return apiGet<{ status: string }>("/api/health");
}
