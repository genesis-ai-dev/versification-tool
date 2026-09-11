# Batch Mapping API

**Status:** Authoritative contract for the batch verse-mapping endpoints
**Audience:** Implementers and reviewers of [frvt-8-acceptance-criteria-1.md](./frvt-8-acceptance-criteria-1.md)
**Scope:** `GET /api/resolve/range` and `POST /api/resolve/verses`. Existing single-verse and chapter resolve routes are unchanged.

These two endpoints map verses between two translations' numbering schemes in one request: either a closed range of from/to partial references, or an explicit list of references. Authentication, error envelope, pagination bounds, and BCV grammar follow [frvt-3-http-api-spec-1.md](./frvt-3-http-api-spec-1.md) except where this document says otherwise.

---

## 1. Acceptance criteria map

| Criterion | Where it lives |
| --- | --- |
| 1.1 Range of verses, from/to BCV | [§3](#3-get-apiresolverange) |
| 1.1.2 Partial references (book, chapter, verse) | [§3.1](#31-partial-reference-grammar) |
| 1.2 Set of verse IDs | [§4](#4-post-apiresolveverses) |
| 2 Versification optional | [§5](#5-versification-defaulting) |
| 2.1 Prefer the translation's preferred scheme | [§5](#5-versification-defaulting) |
| 2.2 Fall back to canonical `org` | [§5](#5-versification-defaulting) |

---

## 2. Shared response

Both endpoints return `BatchResolveOut`.

```json
{
  "items": [
    {
      "ref": "GEN 1:1",
      "result": { "source_spans": [], "target_spans": [], "relation": "one_to_one", "edges": [] },
      "error": null
    }
  ],
  "total": 1,
  "from_versification": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  "to_versification": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
}
```

| Field | Meaning |
| --- | --- |
| `items[].ref` | The requested reference string, exactly as submitted (range expansion emits `BOOK C:V`). |
| `items[].result` | A `ResolveResult` identical to `GET /api/resolve` when that member succeeded; otherwise JSON `null`. |
| `items[].error` | `{ "code": "<ErrorCode>", "detail": "..." }` when that member failed; otherwise JSON `null`. |
| `total` | Range: size of the full expansion **before** `limit`/`offset`. Set: `len(refs)`. |
| `from_versification` | Scheme id actually used on the from side. |
| `to_versification` | Scheme id actually used on the to side. |

Exactly one of `result` / `error` is non-null on each entry. Both keys are always present.

Per-verse failures do not change the HTTP status. The request is `200` as long as translations, schemes, range bounds, and size limits are valid. A chain problem (cycle, no shared ancestor) is **not** per-verse: it fails the whole request with `422` before any entries are built.

There is no emit-once alignment dedupe. Duplicate requested refs produce duplicate entries.

---

## 3. `GET /api/resolve/range`

Resolve every covered whole verse in a closed interval of the from-translation's stored spans.

**Query:**

| Name | Required | Notes |
| --- | --- | --- |
| `from_translation` | yes | uuid |
| `to_translation` | yes | uuid |
| `from_ref` | yes | Partial reference ([§3.1](#31-partial-reference-grammar)) |
| `to_ref` | yes | Partial reference |
| `from_versification` | no | uuid override |
| `to_versification` | no | uuid override |
| `limit` | no | Default `100`, max `500`. Same rules as other paginated endpoints. |
| `offset` | no | Default `0`. Negative treated as `0`. |

**Success:** `200` `BatchResolveOut`. `items` are the sliced expansion in USX book order, then chapter, then verse. `total` is the unsliced expansion length. An empty window is `200` with `{items: [], total: 0}` and the resolved scheme ids.

### 3.1 Partial-reference grammar

`from_ref` and `to_ref` match `BOOK`, `BOOK C`, or `BOOK C:V` after strip.

- `BOOK` is a three-character USFM code `[A-Z1-6]{3}` that appears in the server's USX book order. Unknown codes are `422 validation_failed`.
- No part suffix (`GEN 3:5a` is `400 bad_request`).
- No range marker (`GEN 1-2` or `GEN 1:1-3` is `400 bad_request`).
- Verse `0` is legal (Psalm titles).

Omitted chapter or verse is open toward that bound's own side:

| Input | Lower bound | Upper bound |
| --- | --- | --- |
| `GEN` | First stored verse of `GEN` | Last stored verse of `GEN` |
| `GEN 3` | First stored verse of `GEN 3` | Last stored verse of `GEN 3` |
| `GEN 3:5` | Exactly `GEN 3:5` | Exactly `GEN 3:5` |

Examples: `from_ref=GEN` starts at the first stored verse of Genesis; `to_ref=EXO 3` ends at the last stored verse of Exodus chapter 3; `to_ref=EXO 3:5` ends at `EXO 3:5` inclusive.

If the computed lower bound sorts after the upper bound (`EXO` to `GEN`, or `GEN 5` to `GEN 2`), the request is `422 validation_failed`.

### 3.2 Expansion

The interval is filled from **stored `verse_span` rows of `from_translation`**, never from a scheme `maxVerses` ingredient.

1. Restrict to whole-verse rows (`part IS NULL`) whose book lies in the USX-order window from the from-book through the to-book.
2. Include the stored `(book, chapter, verse)` of each such row.
3. When `verse_range` is set (combined milestone), also include every constituent verse of that range. A row stored at `GEN 1:1` with `verse_range = "GEN 1:1-2"` therefore yields both `GEN 1:1` and `GEN 1:2`.
4. Drop coordinates outside the closed bound interval. Deduplicate by `(book, chapter, verse)`.
5. Sort by USX book order, then chapter, then verse. Format as `BOOK C:V`.

A metadata-only translation (no spans) expands to an empty list.

Pagination slices this ordered list after expansion. Resolve runs only on the page.

### 3.3 Combined milestones

A combined USX milestone is one `verse_span` row at the **anchor** verse (`min` of the range) with `verse_range` set. Expansion still emits an entry for every constituent.

Those constituents resolve through the stored anchor: `GEN 1:1` and `GEN 1:2` of a `GEN 1:1-2` milestone return the same `result` payload under different `ref` keys.

---

## 4. `POST /api/resolve/verses`

Resolve an explicit list of references in request order.

**Body (`BatchVerseRequest`):**

```json
{
  "from_translation": "<uuid>",
  "to_translation": "<uuid>",
  "refs": ["GEN 1:1", "GEN 1:2"],
  "from_versification": null,
  "to_versification": null
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `from_translation` | yes | uuid |
| `to_translation` | yes | uuid |
| `refs` | yes | 1–500 strings. Grammar is the same as `GET /api/resolve` `ref`: `BOOK C:V` or same-chapter `BOOK C:V-V`. |
| `from_versification` | no | uuid override |
| `to_versification` | no | uuid override |

Empty `refs` or more than 500 items: `422 validation_failed` (Pydantic, or the same status from the component if Pydantic is bypassed).

**Success:** `200` `BatchResolveOut`. `items` follow `refs` order, including duplicates. `total` equals `len(refs)`. A malformed member (`GEN 1:1a`, unknown grammar) becomes an entry `error` with `code` `bad_request`; siblings still resolve.

Sub-verse parts are out of scope: there is no `part` field on the body or per ref.

---

## 5. Versification defaulting

Each side independently:

1. Explicit `from_versification` / `to_versification` if present. Missing scheme → `404 not_found`. Present but not associated with that translation → `409 conflict`.
2. Else the translation's preferred association.
3. Else the canonical scheme named `org` (`canonical = true`).

Step 3 applies **only** to these two batch endpoints. `GET /api/resolve`, `GET /api/resolve/chapter`, navigation, and jump-menu routes still return `409 conflict` when a translation has no preferred scheme.

The response echoes the scheme ids that were actually used, so a caller can tell whether the `org` fallback fired.

---

## 6. Status codes

Inherited Basic-auth failures (`401`, `429`) match the rest of the API.

| Status | `code` | When |
| --- | --- | --- |
| `200` | — | Request accepted. Individual members may still carry `error`. |
| `400` | `bad_request` | `from_ref` / `to_ref` does not match the partial-reference grammar (embedded part, range marker, truncated `GEN 3:`). |
| `401` | `unauthorized` | Missing or invalid Basic credentials. |
| `404` | `not_found` | Unknown translation, or unknown override scheme id. |
| `409` | `conflict` | Override scheme is not associated with that translation. |
| `422` | `validation_failed` | `to_ref` sorts before `from_ref`; unknown book code; `limit` outside `1..500`; `refs` empty or longer than 500; the two schemes share no ancestor or a scheme chain contains a cycle. |
| `429` | `too_many_requests` | Failed-auth limiter. |

### 6.1 Examples

**`400` malformed `from_ref`:**

```json
{ "detail": "Invalid BCV reference: 'GEN 3:'", "code": "bad_request" }
```

(Exact `detail` text follows the parser message.)

**`404` unknown translation:**

```json
{ "detail": "Translation 00000000-0000-0000-0000-000000000000 not found.", "code": "not_found" }
```

**`409` override not associated:**

```json
{ "detail": "Versification is not associated with the translation.", "code": "conflict" }
```

**`422` reversed range:**

```json
{ "detail": "Range end before start.", "code": "validation_failed" }
```

**`422` `limit=501`:**

```json
{ "detail": "Query parameter limit must be at most 500.", "code": "validation_failed" }
```

**`401`:**

```json
{ "detail": "Missing or invalid credentials.", "code": "unauthorized" }
```

---

## 7. Performance and logging

Scheme chains are built **once per request** and reused for every member. Span enrichment still issues a few queries per verse, so a 500-verse page is on the order of two thousand SQL round-trips. Interactive callers should keep the default page size (`100`).

Each public method logs at `DEBUG` on entry, including the per-verse worker and the resolver's `assemble()`. A full 500-verse page therefore emits well over a thousand `DEBUG` lines. `LOG_LEVEL` defaults to `DEBUG`; raise it for batch workloads. This is a logging-policy trade-off, not a defect.

---

## 8. Non-goals

- Database schema change or migration
- Scheme-to-scheme mapping without translation ids
- Sub-verse part handling on either endpoint
- Alignment dedupe (that remains specific to `GET /api/resolve/chapter`)
- Changing `selected_scheme_ref()` for existing endpoints
- TypeScript client or UI
