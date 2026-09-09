import { describe, expect, it } from "vitest";
import { ApiError, describeApiError } from "./errors";

describe("ApiError", () => {
  it("maps a 400 envelope into status, detail, and code", async () => {
    const response = new Response(
      JSON.stringify({ detail: "bad ref", code: "bad_request" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
    const error = await ApiError.fromResponse(response);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(400);
    expect(error.code).toBe("bad_request");
    expect(error.message).toBe("bad ref");
    expect(describeApiError(error)).toBe("bad ref");
  });

  it("maps a 500 envelope and falls back when body is missing", async () => {
    const withBody = await ApiError.fromResponse(
      new Response(JSON.stringify({ detail: "boom", code: "internal_error" }), {
        status: 500,
      }),
    );
    expect(withBody.status).toBe(500);
    expect(withBody.code).toBe("internal_error");
    expect(describeApiError(withBody)).toBe("boom");

    const empty = await ApiError.fromResponse(new Response("", { status: 500 }));
    expect(empty.code).toBe("internal_error");
    expect(empty.status).toBe(500);
  });

  it("maps a 429 envelope to too_many_requests instead of bad_request", async () => {
    const error = await ApiError.fromResponse(
      new Response(
        JSON.stringify({
          detail: "Too many failed authentication attempts.",
          code: "too_many_requests",
        }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      ),
    );
    expect(error.status).toBe(429);
    expect(error.code).toBe("too_many_requests");
    expect(error.message).toBe("Too many failed authentication attempts.");
  });

  it("preserves field errors for 422 modal display", async () => {
    const error = await ApiError.fromResponse(
      new Response(
        JSON.stringify({
          detail: "validation failed",
          code: "validation_failed",
          errors: [{ field: "custom.vrs", message: "missing" }],
        }),
        { status: 422 },
      ),
    );
    expect(error.errors).toEqual([{ field: "custom.vrs", message: "missing" }]);
  });
});
