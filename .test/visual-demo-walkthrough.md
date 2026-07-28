# Visual Demo Corpus — Manual Walkthrough

Manual overlay and jump-menu QA for Project A. Case ids match [`VERIFICATION_CASES`](../frvt/testops/fixtures/visual_demo_ingredients.py) and [`CATEGORY_CASES`](../frvt/testops/fixtures/visual_demo_ingredients.py).

## Preconditions

1. FRVT server running with Postgres — see [`.test/runbooks/env-up.md`](runbooks/env-up.md) (`docker compose up -d` in `frvt/`, migrations, UI build, uvicorn).
2. Log in through the browser (default credentials in `frvt/.env.example`: `admin` / `Admin123!`).
3. Bootstrap canonical anchors present (clean install or migrated DB — normal first startup).

**Note:** `pytest frvt/tests/test_visual_demo_corpus.py` exercises the **test** database (`frvt_test`) and rolls back after each test. It does **not** seed the database your browser uses. Use the setup steps below for manual QA.

---

## Fixture assets

All paths are relative to the repository root.

| Asset | Path | Used for |
|---|---|---|
| EN project zip | `frvt/testops/fixtures/assets/visual-demo-en.zip` | Left translation (`visual-demo-en`) |
| ES project zip | `frvt/testops/fixtures/assets/visual-demo-es.zip` | Right translation (`visual-demo-es`) |
| Scheme JSON (×7) | `frvt/testops/fixtures/assets/schemes/*.json` | Custom versifications uploaded by name |

Regenerate scheme JSON after ingredient changes:

```bash
frvt/.venv/bin/python -c "
import json, pathlib
from frvt.testops.fixtures.visual_demo_ingredients import SCHEME_BUILDERS
out = pathlib.Path('frvt/testops/fixtures/assets/schemes')
out.mkdir(exist_ok=True)
for name, builder in SCHEME_BUILDERS.items():
    (out / f'{name}.json').write_text(json.dumps(builder(), indent=2) + '\n')
print('Wrote', len(SCHEME_BUILDERS), 'files to', out)
"
```

### Scheme inventory

Logical keys (in case tables) map to **display names** shown in Manage and Viewer dropdowns.

| Logical key | Upload / display name | Typical column |
|---|---|---|
| `identity-en` | **`versification ★`** on `visual-demo-en` (ingest preferred scheme) | Left default |
| `identity-es` | **`versification ★`** on `visual-demo-es` | Right default |
| `scheme-a` | `visual-demo-scheme-a` | Left |
| `scheme-b` | `visual-demo-scheme-b` | Right |
| `visual-demo-lxx` | `visual-demo-lxx` | Left (category) |
| `visual-demo-synodal` | `visual-demo-synodal` | Left |
| `visual-demo-nt-omit` | `visual-demo-nt-omit` | Left |
| `psalm-a` | `visual-demo-psalm-a` | Left |
| `psalm-b` | `visual-demo-psalm-b` | Right |

In the Viewer, **Preferred (default)** on a column selects the starred ingest scheme (`identity-en` / `identity-es`).

---

## Corpus setup

Choose **one** path. Validate the result in the UI either way (next section).

### Option A — Manage UI (validates upload flows)

**Translations** — open **`/manage/translations`**.

1. Click **Upload project**.
2. Upload `visual-demo-en.zip`; set name **`visual-demo-en`**, language **`en`**.
3. Repeat for `visual-demo-es.zip` with name **`visual-demo-es`**, language **`es`**.

**Versifications** — open **`/manage/versifications`**.

4. Click **Upload versification** for each file in `frvt/testops/fixtures/assets/schemes/`:
   - Use the filename stem as the display name (e.g. `visual-demo-scheme-a.json` → name **`visual-demo-scheme-a`**).

**Associations** — back on **`/manage/translations`**.

5. For **`visual-demo-en`**, click **Associate** and add all seven custom schemes (one at a time).
6. Repeat for **`visual-demo-es`**.

Each translation should list **eight** schemes: the ingest **`versification ★`** plus the seven `visual-demo-*` uploads.

**Partial spans (C-partial only)** — run from repo root:

```bash
frvt/.venv/bin/python .test/scripts/seed-visual-demo-partials.py
```

Project ingest does not create sub-verse part rows; this script inserts `SIR 36:13` part **a** on both translations.

### Option B — Seed script (faster repeat setup)

With the server running and scheme JSON present:

```bash
.test/scripts/seed-visual-demo.sh
```

Environment overrides: `FRVT_BASE_URL` (default `http://localhost:8000`), `FRVT_BASIC_AUTH` (default `admin:Admin123!`).

The script is idempotent (reuses existing `visual-demo-en` / `visual-demo-es` and scheme names). It prints a logical-key → UUID map for debugging; manual QA should still confirm names in the UI.

Then run the partial-span helper if you need **C-partial**:

```bash
frvt/.venv/bin/python .test/scripts/seed-visual-demo-partials.py
```

---

## Validate setup in the UI

Before running cases, confirm the corpus looks correct in Manage and Viewer.

### Manage — Translations (`/manage/translations`)

| Check | Expected |
|---|---|
| Rows | **`visual-demo-en`** (language **en**) and **`visual-demo-es`** (language **es**) |
| Schemes on each row | Eight entries including **`versification ★`** and all seven **`visual-demo-*`** names |
| Associate affordance | Custom schemes show **Remove** / not only the preferred row |

### Manage — Versifications (`/manage/versifications`)

| Check | Expected |
|---|---|
| Custom schemes | All seven `visual-demo-*` names listed with **Kind = Custom** |
| Based on | **`org`** (or the bootstrap org anchor label) |

### Viewer smoke — open **`/`** (home)

1. **Left** column **Translation** → **`visual-demo-en`**.
2. **Right** column **Translation** → **`visual-demo-es`**.
3. Toolbar shows **`visual-demo-en ↔ visual-demo-es`** and **`drive: left`** after you interact with the left column.
4. **Mapping** toolbar control → **Current** (connectors for the clicked verse).
5. **Left** **Versification** → **`visual-demo-scheme-a`**; **Right** → **`visual-demo-scheme-b`**.
6. **Left** **Book / Chapter / Verse** → **JHN · 3 · 16**; click verse **16** in the left text column.
7. **Expect:** at least one SVG connector; right column scrolls/highlights **JHN 3:16**.

If step 7 passes, proceed to the case tables below.

---

## Session defaults

Apply these in the **Viewer** unless a case says otherwise.

| Control | Default |
|---|---|
| Left **Translation** | **`visual-demo-en`** |
| Right **Translation** | **`visual-demo-es`** |
| **Mapping** (toolbar) | **Current** |
| Drive column | **Left** — click a verse in the left text column; toolbar shows **`drive: left`** |
| **Versification** dropdowns | Set **Left** and **Right** per case (display names in tables below) |
| Navigation | Column **Book → Chapter → Verse** selectors, then click the drive-column verse |

**Verse 0:** In **PSA** chapter **3**, the verse selector shows **`Title (0)`** (not bare `0`) when a scheme with a psalm-title mapping is active on that column.

**Preferred schemes:** When a case lists **`identity-en`** or **`identity-es`**, choose **Preferred (default)** on that column, or explicitly pick **`versification ★`**.

---

## Composition cases (`C-*`)

Each case: set **Left** / **Right versification** as named, navigate, click the drive-column verse, observe overlay and follower scroll.

### C-ident — identity (`one_to_one`)

| Field | Value |
|---|---|
| **Left versification** | `visual-demo-scheme-a` |
| **Right versification** | `visual-demo-scheme-b` |
| **Navigate to** | **JHN** · chapter **3** · verse **16** |
| **Action** | Click **JHN 3:16** in the **left** column |
| **Expect** | One connector; **right** column highlights **JHN 3:16** (same book/chapter/verse). Single outline per side. |
| **Optional** | **Mapping → Hidden** — overlay empty; text highlight remains. Click a verse on the **right** (toolbar **`drive: right`**) and confirm the left follower updates. |

### C-shift — psalm verse shift

| Field | Value |
|---|---|
| **Left versification** | `visual-demo-scheme-a` |
| **Right versification** | **Preferred (default)** on ES |
| **Navigate to** | **PSA** · chapter **3** · verse **1** |
| **Action** | Click **PSA 3:1** on the **left** |
| **Expect** | Shift topology; **right** follower scrolls to **PSA 3:2** (verse number differs by one). One source span, one target span. |
| **Context** | Under scheme-a, PSA 3:1 sits in the `PSA 3:0-8 → 3:1-9` mapped block. |

### C-renumber — chapter boundary

| Field | Value |
|---|---|
| **Left versification** | `visual-demo-scheme-a` |
| **Right versification** | **Preferred (default)** on ES |
| **Navigate to** | **GEN** · chapter **31** · verse **55** (last verse of chapter 31) |
| **Action** | Click **GEN 31:55** on the **left** |
| **Expect** | Renumber/chapter-boundary style alignment; **right** follower jumps to **GEN 32:1** (new chapter). Connector crosses chapter boundary. |

### C-shift-renum — composed shift

| Field | Value |
|---|---|
| **Left versification** | `visual-demo-scheme-a` |
| **Right versification** | `visual-demo-scheme-b` |
| **Navigate to** | **GEN** · chapter **2** · verse **1** |
| **Action** | Click **GEN 2:1** on the **left** |
| **Expect** | Shift relation (scheme-a maps `GEN 2:1 → GEN 2:2`); **right** follower lands on **GEN 2:2**. |

### C-chapter-count — same-chapter unequal range

| Field | Value |
|---|---|
| **Left versification** | `visual-demo-scheme-a` |
| **Right versification** | **Preferred (default)** on ES |
| **Navigate to** | **GEN** · chapter **2** · verse **5** |
| **Action** | Click **GEN 2:5** on the **left** |
| **Expect** | Renumber within chapter (chapter-count category in jump menu); **right** shows **GEN 2:4** from scheme-a mapping `GEN 2:5-7 → GEN 2:4-5`. |

### C-exclude — void terminator

| Field | Value |
|---|---|
| **Left versification** | `visual-demo-scheme-a` |
| **Right versification** | `visual-demo-scheme-b` |
| **Navigate to** | **ACT** · chapter **24** · verse **7** |
| **Action** | Click **ACT 24:7** on the **left** |
| **Expect** | **Exclude** presentation: dashed connector from left span to **void** in the gutter; **no** target outline on the right. Left text visible; right has no matching verse highlight for this alignment. |

### C-merge — many sources → one target

| Field | Value |
|---|---|
| **Left versification** | `visual-demo-scheme-a` |
| **Right versification** | **Preferred (default)** on ES |
| **Navigate to** | **GEN** · chapter **1** · verse **1** |
| **Action** | Click **GEN 1:1** on the **left** |
| **Expect** | **Merge** topology: **multiple** left outlines (GEN 1:1 and GEN 1:2 siblings) converging to **one** right outline at **GEN 1:1**. More than one connector from left hull. |

### C-split — one source → many targets

| Field | Value |
|---|---|
| **Left versification** | **Preferred (default)** on EN |
| **Right versification** | `visual-demo-scheme-b` |
| **Navigate to** | **GEN** · chapter **1** · verse **1** |
| **Action** | Click **GEN 1:1** on the **left** |
| **Expect** | **Split** topology: **one** left outline at **GEN 1:1**; **multiple** right outlines (scheme-b merge inverse maps **GEN 1:10-11 → GEN 1:1**). Fan-out connectors on the right. |

### C-complex — multi-edge hull

| Field | Value |
|---|---|
| **Left versification** | `visual-demo-scheme-a` |
| **Right versification** | `visual-demo-scheme-b` |
| **Navigate to** | **GEN** · chapter **1** · verse **1** |
| **Action** | Click **GEN 1:1** on the **left** |
| **Expect** | **Complex** hull: several spans outlined on **both** sides; **multiple** connector edges with possibly different relation colors. Not a single simple 1:1 line. |

### C-partial — sub-verse part

| Field | Value |
|---|---|
| **Left versification** | `visual-demo-scheme-a` |
| **Right versification** | **Preferred (default)** on ES |
| **Navigate to** | **SIR** · chapter **36** · verse **13** · part **a** |
| **Action** | Choose part **a** in the verse selector if shown; click the **part a** row on the **left** |
| **Expect** | **Partial** relation; outline wraps **only** the part-a span, not the whole verse. Target side shows matching partial alignment. Requires partial-span seed (see setup). |

### C-cancel-jump — misalignment row hidden

| Field | Value |
|---|---|
| **Left versification** | `visual-demo-psalm-a` |
| **Right versification** | `visual-demo-psalm-b` |
| **Navigate to** | **PSA** · chapter **3** · verse **1** |
| **Action** | Open **Jump** on either column → read the **Misalignments** section (do **not** rely on overlay alone). |
| **Expect** | Resolve at **PSA 3:1** is same BCV on both sides after cancel filter; **PSA 3:1** is **absent** from the misalignments list. Overlay may still show connectors when **Mapping** is **Current**. |

---

## Category cases (`CAT-*`)

For each case: set versifications, navigate, open **Jump**, inspect **Misalignments** (rows are prefixed with category labels such as **LXX Psalms:**).

| Case id | Left / Right versification | Navigate to | Look for in Misalignments | Expect |
|---|---|---|---|---|
| **CAT-psalm-title** | `visual-demo-scheme-a` / **Preferred (default)** ES | **PSA 3:1** | **Psalm titles:** | Row for **PSA 3:1** (or navigation ref in psalm-title range) |
| **CAT-lxx** | `visual-demo-lxx` / **Preferred (default)** ES | **PSA 3:0** (**Title (0)**) | **LXX Psalms:** | Row for **PSA 3:0** |
| **CAT-synodal** | `visual-demo-synodal` / **Preferred (default)** ES | **GEN 31:55** | **Synodal:** | Row for **GEN 31:55** |
| **CAT-nt-omit** | `visual-demo-nt-omit` / **Preferred (default)** ES | **ACT 24:7** | **NT omissions:** | Row for **ACT 24:7** |
| **CAT-chapter-boundary** | `visual-demo-scheme-a` / **Preferred (default)** ES | **GEN 31:55** | **Chapter boundaries:** | Row for **GEN 31:55** |
| **CAT-chapter-count** | `visual-demo-scheme-a` / **Preferred (default)** ES | **GEN 2:5** | **Chapter counts:** | Row for **GEN 2:5** |
| **CAT-other** | `visual-demo-scheme-a` / **Preferred (default)** ES | **JHN 3:16** | **Other:** | Row for **JHN 3:16** (or no stronger category) |
| **CAT-cancel** | `visual-demo-psalm-a` / `visual-demo-psalm-b` | **PSA 3:1** | (any category) | **No** row for **PSA 3:1** |

**Tip:** Click a misalignment row to jump; confirm book/chapter/verse selectors and text column match the expected location.

---

## UI mode spot checks

| Check | Setup | Expect |
|---|---|---|
| Verse-0 label | **PSA 3**, **`Title (0)`**, left **`visual-demo-scheme-a`** | Verse selector and gutter show **Title (0)**, not bare **0** |
| Map toggle | **JHN 3:16**, C-ident versifications | **Mapping → Hidden** removes connectors; **Current** restores them |
| Drive column | **GEN 1:1**, C-complex versifications | Click **right** column verse; toolbar **`drive: right`**; left follower updates |

---

## Maintenance

If `pytest frvt/tests/test_visual_demo_corpus.py` fails, fix ingredients and re-run before this walkthrough. Regenerate scheme JSON when ingredients change.

Design reference: [`.spec/visual-demo-corpus-plan.md`](../.spec/visual-demo-corpus-plan.md).

Seed scripts: [`.test/scripts/seed-visual-demo.sh`](scripts/seed-visual-demo.sh), [`.test/scripts/seed-visual-demo-partials.py`](scripts/seed-visual-demo-partials.py).
