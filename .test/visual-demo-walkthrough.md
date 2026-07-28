# Visual Demo Corpus — Manual Walkthrough

Manual overlay and jump-menu QA for Project A. Case ids match [`VERIFICATION_CASES`](../frvt/testops/fixtures/visual_demo_ingredients.py) and [`CATEGORY_CASES`](../frvt/testops/fixtures/visual_demo_ingredients.py).

## Preconditions

1. FRVT server running with Postgres (`docker compose up -d` in `frvt/`).
2. Bootstrap canonical anchors present (clean install or migrated DB).
3. Seed the corpus with **partial spans** (required for `C-partial`):

```bash
pytest frvt/tests/test_visual_demo_corpus.py::test_seed_visual_demo_corpus_wiring -q
```

The e2e helper `seedVisualDemoCorpus` ingests zips and schemes but does **not** insert `SIR 36:13` part `a` rows — use pytest seed for full coverage.

4. Record translation UUIDs and scheme UUIDs from seed output (logical keys below).

## Fixture inventory

| Logical scheme key | Upload name | Typical column |
|---|---|---|
| `identity-en` | (ingested EN VRS) | Left default |
| `identity-es` | (ingested ES VRS) | Right default |
| `scheme-a` | `visual-demo-scheme-a` | Left |
| `scheme-b` | `visual-demo-scheme-b` | Right |
| `visual-demo-lxx` | `visual-demo-lxx` | Left (category) |
| `visual-demo-synodal` | `visual-demo-synodal` | Left |
| `visual-demo-nt-omit` | `visual-demo-nt-omit` | Left |
| `psalm-a` | `visual-demo-psalm-a` | Left |
| `psalm-b` | `visual-demo-psalm-b` | Right |

Translations: **EN** = `visual-demo-en`, **ES** = `visual-demo-es` (from seed).

## Session defaults

1. Viewer: **EN left**, **ES right** (`left` / `right` URL params = translation UUIDs).
2. URL: `map=1`, `drive=left` unless a case says otherwise.
3. Set `lvers` / `rvers` to the scheme UUID for the logical keys in each case table.
4. Use column book → chapter → verse selectors to reach the **Navigate to** location, then **click the drive-column verse** (left when `drive=left`).

**Verse 0:** In PSA chapter 3, verse **0** appears as **Title (0)** in the verse list (scheme-a includes a psalm-title mapping).

---

## Composition cases (`C-*`)

Each row lists where to go, which schemes to select, and what to verify visually.

### C-ident — identity (`one_to_one`)

| Field | Value |
|---|---|
| **lvers** | `scheme-a` |
| **rvers** | `scheme-b` |
| **Navigate to** | **JHN** · chapter **3** · verse **16** |
| **Action** | Click **JHN 3:16** in the **left** column |
| **Expect** | One connector; **right** column highlights **JHN 3:16** (same book/chapter/verse). Single outline per side. |
| **Optional** | Set `map=0` — overlay empty; text highlight remains. Repeat with `drive=right` (click right verse, left follows). |

### C-shift — psalm verse shift

| Field | Value |
|---|---|
| **lvers** | `scheme-a` |
| **rvers** | `identity-es` |
| **Navigate to** | **PSA** · chapter **3** · verse **1** |
| **Action** | Click **PSA 3:1** on the **left** |
| **Expect** | Shift topology; **right** follower scrolls to **PSA 3:2** (verse number differs by one). One source span, one target span. |
| **Context** | Under scheme-a, PSA 3:1 sits in the `PSA 3:0-8 → 3:1-9` mapped block. |

### C-renumber — chapter boundary

| Field | Value |
|---|---|
| **lvers** | `scheme-a` |
| **rvers** | `identity-es` |
| **Navigate to** | **GEN** · chapter **31** · verse **55** (last verse of chapter 31) |
| **Action** | Click **GEN 31:55** on the **left** |
| **Expect** | Renumber/chapter-boundary style alignment; **right** follower jumps to **GEN 32:1** (new chapter). Connector crosses chapter boundary. |

### C-shift-renum — composed shift

| Field | Value |
|---|---|
| **lvers** | `scheme-a` |
| **rvers** | `scheme-b` |
| **Navigate to** | **GEN** · chapter **2** · verse **1** |
| **Action** | Click **GEN 2:1** on the **left** |
| **Expect** | Shift relation (scheme-a maps `GEN 2:1 → GEN 2:2`); **right** follower lands on **GEN 2:2**. |

### C-chapter-count — same-chapter unequal range

| Field | Value |
|---|---|
| **lvers** | `scheme-a` |
| **rvers** | `identity-es` |
| **Navigate to** | **GEN** · chapter **2** · verse **5** |
| **Action** | Click **GEN 2:5** on the **left** |
| **Expect** | Renumber within chapter (chapter-count category in jump menu); **right** shows **GEN 2:4** from scheme-a mapping `GEN 2:5-7 → GEN 2:4-5`. |

### C-exclude — void terminator

| Field | Value |
|---|---|
| **lvers** | `scheme-a` |
| **rvers** | `scheme-b` |
| **Navigate to** | **ACT** · chapter **24** · verse **7** |
| **Action** | Click **ACT 24:7** on the **left** |
| **Expect** | **Exclude** presentation: dashed connector from left span to **void** in the gutter; **no** target outline on the right. Left text visible; right has no matching verse highlight for this alignment. |

### C-merge — many sources → one target

| Field | Value |
|---|---|
| **lvers** | `scheme-a` |
| **rvers** | `identity-es` |
| **Navigate to** | **GEN** · chapter **1** · verse **1** |
| **Action** | Click **GEN 1:1** on the **left** |
| **Expect** | **Merge** topology: **multiple** left outlines (GEN 1:1 and GEN 1:2 siblings) converging to **one** right outline at **GEN 1:1**. More than one connector from left hull. |

### C-split — one source → many targets

| Field | Value |
|---|---|
| **lvers** | `identity-en` |
| **rvers** | `scheme-b` |
| **Navigate to** | **GEN** · chapter **1** · verse **1** |
| **Action** | Click **GEN 1:1** on the **left** (identity-en scheme) |
| **Expect** | **Split** topology: **one** left outline at **GEN 1:1**; **multiple** right outlines (scheme-b merge inverse maps **GEN 1:10-11 → GEN 1:1**). Fan-out connectors on the right. |

### C-complex — multi-edge hull

| Field | Value |
|---|---|
| **lvers** | `scheme-a` |
| **rvers** | `scheme-b` |
| **Navigate to** | **GEN** · chapter **1** · verse **1** |
| **Action** | Click **GEN 1:1** on the **left** |
| **Expect** | **Complex** hull: several spans outlined on **both** sides; **multiple** connector edges with possibly different relation colors. Not a single simple 1:1 line. |

### C-partial — sub-verse part

| Field | Value |
|---|---|
| **lvers** | `scheme-a` |
| **rvers** | `identity-es` |
| **Navigate to** | **SIR** · chapter **36** · verse **13** · part **a** |
| **Action** | Select part **a** if the UI exposes it; click the **part a** row on the **left** |
| **Expect** | **Partial** relation; outline wraps **only** the part-a span, not the whole verse. Target side shows matching partial alignment. Requires pytest seed (part rows inserted in DB). |

### C-cancel-jump — misalignment row hidden

| Field | Value |
|---|---|
| **lvers** | `psalm-a` |
| **rvers** | `psalm-b` |
| **Navigate to** | **PSA** · chapter **3** · verse **1** |
| **Action** | Open **jump menu** → misalignments (all categories). Do **not** rely on overlay alone. |
| **Expect** | Resolve at **PSA 3:1** is same BCV on both sides after cancel filter; **PSA 3:1** is **absent** from the misalignments list. Overlay may still show connectors if `map=1`. |

---

## Category cases (`CAT-*`)

For each case: set schemes as noted, **navigate to the book/chapter/verse**, open the **jump menu**, apply the **category filter**, and confirm the entry is present or absent.

| Case id | lvers / rvers | Navigate to | Jump filter | Expect in list |
|---|---|---|---|---|
| **CAT-psalm-title** | `scheme-a` / `identity-es` | **PSA 3:1** | `psalm_title` | Row for **PSA 3:1** (or navigation ref in psalm-title range) |
| **CAT-lxx** | `visual-demo-lxx` / `identity-es` | **PSA 3:0** (Title (0)) | `lxx_psalm` | Row for **PSA 3:0** — scheme name must contain `lxx` |
| **CAT-synodal** | `visual-demo-synodal` / `identity-es` | **GEN 31:55** | `synodal` | Row for **GEN 31:55** |
| **CAT-nt-omit** | `visual-demo-nt-omit` / `identity-es` | **ACT 24:7** | `nt_omission` | Row for **ACT 24:7** |
| **CAT-chapter-boundary** | `scheme-a` / `identity-es` | **GEN 31:55** | `chapter_boundary` | Row for **GEN 31:55** |
| **CAT-chapter-count** | `scheme-a` / `identity-es` | **GEN 2:5** | `chapter_count` | Row for **GEN 2:5** |
| **CAT-other** | `scheme-a` / `identity-es` | **JHN 3:16** | `other` | Row for **JHN 3:16** (or no stronger category) |
| **CAT-cancel** | `psalm-a` / `psalm-b` | **PSA 3:1** | (any / all) | **No** row for **PSA 3:1** in misalignments |

**Tip:** Click a jump entry to navigate; confirm the viewer lands on the expected book/chapter/verse.

---

## UI mode spot checks

| Check | Navigate to | Expect |
|---|---|---|
| Verse-0 label | **PSA 3:0** with `scheme-a` on left | Gutter shows **Title (0)** not bare `0` |
| Map toggle | **JHN 3:16**, `C-ident` schemes | `map=0` hides connectors; `map=1` restores |
| Drive column | **GEN 1:1**, `C-complex` | `drive=right`: click right column; left follower updates |

---

## Maintenance

If `pytest frvt/tests/test_visual_demo_corpus.py` fails, fix ingredients and re-run before this walkthrough.

Design reference: [`.spec/visual-demo-corpus-1.md`](../.spec/visual-demo-corpus-1.md).
