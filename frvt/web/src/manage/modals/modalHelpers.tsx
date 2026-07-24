/* eslint-disable react-refresh/only-export-components -- shared modal hook and renderer */

import { useState, type FormEvent } from "react";
import { ApiError } from "../../api/errors";
import type { FieldError } from "../../api/types";

/** Render field-level ingest/validation errors inside an open modal. */
export function FieldErrorList({ errors }: { errors?: FieldError[] }) {
  if (!errors || errors.length === 0) {
    return null;
  }
  return (
    <ul className="field-errors">
      {errors.map((err) => (
        <li key={`${err.field}-${err.message}`}>
          <strong>{err.field}</strong>: {err.message}
        </li>
      ))}
    </ul>
  );
}

/** Capture ApiError details for modal display. */
export function captureModalError(
  error: unknown,
  setMessage: (msg: string) => void,
  setFieldErrors: (errors: FieldError[] | undefined) => void,
): void {
  if (error instanceof ApiError) {
    setMessage(error.message);
    setFieldErrors(error.errors);
    return;
  }
  setMessage(error instanceof Error ? error.message : "Unexpected error");
  setFieldErrors(undefined);
}

/** Tiny helper to track submitting state around an async form handler. */
export function useModalSubmit() {
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldError[] | undefined>();

  async function run(event: FormEvent, action: () => Promise<void>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    setFieldErrors(undefined);
    try {
      await action();
    } catch (error) {
      captureModalError(error, setMessage, setFieldErrors);
    } finally {
      setSubmitting(false);
    }
  }

  return { submitting, message, fieldErrors, run };
}
