import { apiGet, apiSend } from "./client";
import type { DivergenceReport, DivergenceStatus } from "../divergence/types";

/** Body for creating a comparison of the two open translations. */
export interface DivergenceRequest {
  from_translation_id: string;
  to_translation_id: string;
  from_scheme_id?: string | null;
  to_scheme_id?: string | null;
}

/**
 * Create or reuse a comparison.
 * 200 means the stored report is already ready; 202 means it is still running.
 */
export function createDivergenceReport(
  body: DivergenceRequest,
  signal?: AbortSignal,
): Promise<DivergenceStatus> {
  return apiSend<DivergenceStatus>("/api/divergence/reports", "POST", body, { signal });
}

/** Read progress for a report that is not ready yet. */
export function getDivergenceStatus(
  reportId: string,
  signal?: AbortSignal,
): Promise<DivergenceStatus> {
  return apiGet<DivergenceStatus>(`/api/divergence/reports/${reportId}`, undefined, {
    signal,
  });
}

/** Read the decoded report once status is ready. */
export function getDivergenceData(
  reportId: string,
  signal?: AbortSignal,
): Promise<DivergenceReport> {
  return apiGet<DivergenceReport>(`/api/divergence/reports/${reportId}/data`, undefined, {
    signal,
  });
}
