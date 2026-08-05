import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Strip query string for path matching in fetch mocks. */
function pathOf(input: RequestInfo): string {
  return String(input).split("?")[0] ?? String(input);
}

describe("viewer empty and one-translation states", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows empty-state upload CTA when translations.total is 0", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo) => {
      const url = pathOf(input);
      if (url.endsWith("/api/translations")) {
        return jsonResponse({ items: [], total: 0 });
      }
      if (url.endsWith("/api/versifications")) {
        return jsonResponse({ items: [], total: 0 });
      }
      return jsonResponse({ detail: "not found", code: "not_found" }, 404);
    });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: /upload a translation project/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /upload project/i })).toBeInTheDocument();
  });

  it("disables mapping toggle when only one translation is present", async () => {
    const translation = {
      id: "11111111-1111-1111-1111-111111111111",
      name: "Only One",
      language: "en",
      text_direction: "ltr",
      source_format: "usx",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };

    fetchMock.mockImplementation(async (input: RequestInfo) => {
      const url = pathOf(input);
      if (url.endsWith(`/api/translations/${translation.id}/versifications`)) {
        return jsonResponse([
          {
            id: "a1",
            translation_id: translation.id,
            scheme_id: "s1",
            preferred: true,
          },
        ]);
      }
      if (url.endsWith(`/api/translations/${translation.id}/navigation`)) {
        return jsonResponse([{ book: "GEN", chapters: [1] }]);
      }
      if (url.endsWith(`/api/translations/${translation.id}/spans`)) {
        return jsonResponse({
          items: [
            {
              id: "v1",
              seq: 1,
              book: "GEN",
              chapter: 1,
              verse: 1,
              part: null,
              content: "In the beginning",
            },
          ],
          total: 1,
        });
      }
      if (url.endsWith("/api/translations")) {
        return jsonResponse({ items: [translation], total: 1 });
      }
      if (url.endsWith("/api/versifications")) {
        return jsonResponse({
          items: [
            {
              id: "s1",
              name: "eng",
              based_on_name: null,
              based_on_id: null,
              canonical: true,
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-01T00:00:00Z",
            },
          ],
          total: 1,
        });
      }
      if (url.includes("/api/resolve")) {
        throw new Error("resolve must not be called with one translation");
      }
      return jsonResponse({ detail: "not found", code: "not_found" }, 404);
    });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/select a second translation/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^mapping$/i)).toBeDisabled();
    expect(screen.getByLabelText(/left translation/i)).toHaveDisplayValue("Only One");
  });

  it("sends *_versification override after selecting a column scheme", async () => {
    const user = userEvent.setup();
    const left = {
      id: "11111111-1111-1111-1111-111111111111",
      name: "Left",
      language: "en",
      text_direction: "ltr",
      source_format: "usx",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const right = {
      id: "22222222-2222-2222-2222-222222222222",
      name: "Right",
      language: "en",
      text_direction: "ltr",
      source_format: "usx",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const schemeAlt = "33333333-3333-3333-3333-333333333333";

    fetchMock.mockImplementation(async (input: RequestInfo) => {
      const full = String(input);
      const url = pathOf(input);
      if (
        url.endsWith("/api/resolve") &&
        !full.includes("deltas") &&
        !full.includes("misalignments") &&
        !full.includes("jump-books") &&
        !full.includes("/chapter")
      ) {
        return jsonResponse({
          source_spans: [
            { ref: "GEN 1:1", book: "GEN", chapter: 1, verse: 1, seq: 1, part: null },
          ],
          target_spans: [
            { ref: "GEN 1:1", book: "GEN", chapter: 1, verse: 1, seq: 1, part: null },
          ],
          relation: "one_to_one",
          edges: [],
        });
      }
      if (url.match(/\/api\/translations\/.+\/versifications$/)) {
        const tid = url.includes(left.id) ? left.id : right.id;
        return jsonResponse([
          {
            id: `a-${tid}`,
            translation_id: tid,
            scheme_id: "s-pref",
            preferred: true,
          },
          {
            id: `b-${tid}`,
            translation_id: tid,
            scheme_id: schemeAlt,
            preferred: false,
          },
        ]);
      }
      if (url.match(/\/api\/translations\/.+\/navigation$/)) {
        return jsonResponse([{ book: "GEN", chapters: [1] }]);
      }
      if (url.match(/\/api\/translations\/.+\/spans$/)) {
        return jsonResponse({
          items: [
            {
              id: "v1",
              seq: 1,
              book: "GEN",
              chapter: 1,
              verse: 1,
              part: null,
              content: "Text",
            },
          ],
          total: 1,
        });
      }
      if (url.endsWith("/api/resolve/jump-books")) {
        return jsonResponse({ books: [] });
      }
      if (url.endsWith("/api/translations")) {
        return jsonResponse({ items: [left, right], total: 2 });
      }
      if (url.endsWith("/api/versifications")) {
        return jsonResponse({
          items: [
            {
              id: "s-pref",
              name: "Preferred",
              based_on_name: null,
              based_on_id: null,
              canonical: true,
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-01T00:00:00Z",
            },
            {
              id: schemeAlt,
              name: "Alternate",
              based_on_name: "org",
              based_on_id: null,
              canonical: false,
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-01T00:00:00Z",
            },
          ],
          total: 2,
        });
      }
      return jsonResponse({ items: [], total: 0 });
    });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    const schemeSelect = await screen.findByLabelText(/left versification/i);
    await waitFor(() => {
      expect(schemeSelect).not.toBeDisabled();
      expect(schemeSelect.querySelector(`option[value="${schemeAlt}"]`)).not.toBeNull();
    });
    await user.selectOptions(schemeSelect, schemeAlt);

    await waitFor(() => {
      const resolveCalls = fetchMock.mock.calls
        .map((call) => String(call[0]))
        .filter(
          (u) =>
            u.includes("/api/resolve") &&
            !u.includes("deltas") &&
            !u.includes("misalignments") &&
            !u.includes("jump-books") &&
            !u.includes("/chapter"),
        );
      expect(
        resolveCalls.some((u) => u.includes(`from_versification=${schemeAlt}`)),
      ).toBe(true);
    });
  });
});
