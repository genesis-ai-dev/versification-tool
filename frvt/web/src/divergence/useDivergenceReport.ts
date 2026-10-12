import { useCallback, useEffect, useState } from "react";
import {
  createDivergenceReport,
  getDivergenceData,
  getDivergenceStatus,
} from "../api/divergence";
import { ApiError } from "../api/errors";
import type { DivergenceRequest } from "../api/divergence";
import type { DivergenceReport, DivergenceStatus } from "./types";

/** What the dialog needs while a comparison is loading or ready. */
export interface DivergenceState {
  status: DivergenceStatus | null;
  report: DivergenceReport | null;
  error: string | null;
  /** Start the comparison again after a failure. */
  retry: () => void;
}

const EMPTY: DivergenceState = {
  status: null,
  report: null,
  error: null,
  retry: () => undefined,
};

/**
 * Create a comparison and poll until it is ready, failed, or the dialog closes.
 * Backoff runs from 500ms to 5s. A stalled job, or one 409 from the data route,
 * posts the comparison again.
 */
export function useDivergenceReport(
  fromTranslationId: string | null,
  toTranslationId: string | null,
  fromSchemeId: string | null,
  toSchemeId: string | null,
  active: boolean,
): DivergenceState {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<Omit<DivergenceState, "retry">>(EMPTY);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    if (!active || fromTranslationId === null || toTranslationId === null) {
      return;
    }
    const controller = new AbortController();
    let timer = 0;
    const request: DivergenceRequest = {
      from_translation_id: fromTranslationId,
      to_translation_id: toTranslationId,
      from_scheme_id: fromSchemeId,
      to_scheme_id: toSchemeId,
    };

    /** Post, then poll. A ready payload ends the loop. */
    const run = async () => {
      try {
        let status = await createDivergenceReport(request, controller.signal);
        setState({ status, report: null, error: null });
        let dataRetries = 0;
        let report: DivergenceReport | null = null;
        while (report === null) {
          let wait = 500;
          while (status.status !== "ready" && status.status !== "failed") {
            await delay(wait, controller.signal);
            wait = Math.min(wait * 2, 5000);
            status = status.stalled
              ? await createDivergenceReport(request, controller.signal)
              : await getDivergenceStatus(status.id, controller.signal);
            setState({ status, report: null, error: null });
          }
          if (status.status === "failed") {
            setState({
              status,
              report: null,
              error: status.error ?? "Comparison failed.",
            });
            return;
          }
          try {
            report = await getDivergenceData(status.id, controller.signal);
          } catch (error) {
            if (
              dataRetries < 1 &&
              error instanceof ApiError &&
              error.status === 409 &&
              !controller.signal.aborted
            ) {
              dataRetries += 1;
              status = await createDivergenceReport(request, controller.signal);
              setState({ status, report: null, error: null });
              continue;
            }
            throw error;
          }
        }
        setState({ status, report, error: null });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        setState({
          status: null,
          report: null,
          error: error instanceof Error ? error.message : "Comparison failed.",
        });
      }
    };
    void run();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };

    /** Wait between polls, and reject when the dialog closes. */
    function delay(ms: number, signal: AbortSignal): Promise<void> {
      return new Promise((resolve, reject) => {
        timer = window.setTimeout(resolve, ms);
        signal.addEventListener(
          "abort",
          () => {
            window.clearTimeout(timer);
            reject(new DOMException("Aborted", "AbortError"));
          },
          { once: true },
        );
      });
    }
  }, [active, attempt, fromTranslationId, toTranslationId, fromSchemeId, toSchemeId]);

  return active ? { ...state, retry } : EMPTY;
}
