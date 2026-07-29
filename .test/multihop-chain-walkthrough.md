# Multi-hop Chain Test Bed — Manual Walkthrough

Manual parity QA for Project B. Case ids match [`PARITY_CASES`](../frvt/testops/fixtures/multihop_chain_fixtures.py).

## Preconditions

1. FRVT server running with Postgres — see [`.test/runbooks/env-up.md`](runbooks/env-up.md) (`docker compose up -d` in `frvt/`, migrations, UI build, uvicorn).
2. Log in through the browser (default credentials in `frvt/.env.example`: `admin` / `Admin123!`).
3. Bootstrap **`org`** anchor present (clean install or migrated DB — normal first startup).

**Note:** `pytest frvt/tests/test_multihop_chain_testbed.py` exercises the **test** database (`frvt_test`) and rolls back after each test. It does **not** seed the database your browser uses. Use the setup steps below for manual QA.

---

## Fixture assets

All paths are relative to the repository root.

| Asset | Path | Used for |
|---|---|---|
| Spanish project zip | `frvt/testops/fixtures/assets/multihop/spanish-org.zip` | Left translation (`spanish-org`) |
| American project zip | `frvt/testops/fixtures/assets/multihop/american-standard-multihop.zip` | Right translation (`american-standard-multihop`) |
| Scheme JSON (×3) | `frvt/testops/fixtures/assets/multihop/schemes/*.json` | Custom versifications uploaded by name |

Regenerate zips and scheme JSON after ingredient changes:

```bash
frvt/.venv/bin/python .test/scripts/write-multihop-assets.py
```

### Scheme inventory

| Display name | `basedOn` | Role in walkthrough |
|---|---|---|
| **`engdemo`** | `org` | Hop-2 chain (not a Viewer text column); **must** exist before `spanish-eng` upload |
| **`spanish-org-ref`** | `org` | Configuration A baseline (`lvers`) — direct Spanish → org mappings |
| **`spanish-eng`** | `engdemo` | Configuration B two-hop (`lvers`) — inferred hop-1 via org pivot |
| **`org`** (bootstrap) | canonical anchor | Right column target (`rvers`) on American translation |

Ingested project zips also create a preferred **`versification ★`** scheme per translation; parity QA uses the custom schemes above (and bootstrap **`org`** on the right), not those defaults.

---

## Corpus setup

Choose **one** path. Validate the result in the UI either way (next section).

### Option A — Manage UI (+ one API step for engdemo)

The Manage UI uploads projects and schemes but cannot create the empty **`engdemo`** translation shell. Run step 1 once via API; the rest can be done in Manage.

**1. engdemo shell (API — required before `spanish-eng` upload)**

```bash
curl -sS -u admin:Admin123! -X POST http://localhost:8000/api/translations \
  -H 'Content-Type: application/json' \
  -d '{"name":"engdemo","language":"en","source_format":"usx"}'
```

Skip if `engdemo` already exists (`409`).

**2. Generate assets** (if `multihop/` folder is missing):

```bash
frvt/.venv/bin/python .test/scripts/write-multihop-assets.py
```

**Translations** — open **`/manage/translations`**.

3. Click **Upload project**.
4. Upload `spanish-org.zip`; set name **`spanish-org`**, language **`es`**.
5. Upload `american-standard-multihop.zip`; set name **`american-standard-multihop`**, language **`en`**.

**Versifications** — open **`/manage/versifications`**.

6. Upload each file in `frvt/testops/fixtures/assets/multihop/schemes/`:
   - `engdemo.json` → name **`engdemo`**
   - `spanish-org-ref.json` → name **`spanish-org-ref`**
   - `spanish-eng.json` → name **`spanish-eng`**

**Associations** — back on **`/manage/translations`**.

7. **`engdemo`** — **Associate** **`engdemo`** scheme; click **Make preferred** on that scheme.
8. **`spanish-org`** — **Associate** **`spanish-org-ref`** and **`spanish-eng`**; **Make preferred** on **`spanish-eng`** (two-hop default; switch `lvers` in Viewer for baseline).
9. **`american-standard-multihop`** — **Associate** bootstrap **`org`** (listed under canonical schemes).

### Option B — Seed script (faster repeat setup)

With the server running:

```bash
frvt/.venv/bin/python .test/scripts/seed-multihop-chain.py
```

Environment overrides: `FRVT_BASE_URL` (default `http://localhost:8000`), `FRVT_BASIC_AUTH` (default `admin:Admin123!`).

The script is idempotent: it reuses existing rows when present and **always re-applies associations and preferred flags**. If you delete a translation or scheme in Manage, a plain re-run recreates missing rows and restores links.

**Replace without wiping everything** (after `write-multihop-assets.py` or manual deletes):

```bash
# Re-ingest Spanish text (e.g. ACT 24:6–7 fix) and restore scheme associations
frvt/.venv/bin/python .test/scripts/seed-multihop-chain.py --replace spanish

# Re-upload custom schemes only (keeps translations)
frvt/.venv/bin/python .test/scripts/seed-multihop-chain.py --replace spanish-org-ref spanish-eng

# Full custom refresh (translations + schemes)
frvt/.venv/bin/python .test/scripts/seed-multihop-chain.py --replace all
```

You can also delete **`spanish-org`** (or schemes) in Manage and run the script **without** `--replace`; missing names are created on the next run.

---

## Validate setup in the UI

Before running parity cases, confirm the corpus looks correct in Manage and Viewer.

### Manage — Translations (`/manage/translations`)

| Check | Expected |
|---|---|
| Rows | **`spanish-org`** (language **es**), **`american-standard-multihop`** (language **en**), **`engdemo`** (language **en**, no spans) |
| **`spanish-org`** schemes | At least ingest **`versification ★`**, **`spanish-org-ref`**, **`spanish-eng`**; **`spanish-eng`** is preferred |
| **`american-standard-multihop`** schemes | Ingest **`versification ★`** plus associated bootstrap **`org`** |
| **`engdemo`** | Associated **`engdemo`** scheme, preferred |

### Manage — Versifications (`/manage/versifications`)

| Check | Expected |
|---|---|
| Custom schemes | **`engdemo`**, **`spanish-org-ref`**, **`spanish-eng`** with **Kind = Custom** |
| **`spanish-eng` Based on** | **`engdemo`** (translation name, not hyphenated) |

### Viewer smoke — open **`/`** (home)

1. **Left** **Translation** → **`spanish-org`**.
2. **Right** **Translation** → **`american-standard-multihop`**.
3. **Left** **Versification** → **`spanish-org-ref`**.
4. **Right** **Versification** → **`org`** (bootstrap canonical — not the ingest default).
5. **Mapping** → **Current**; click a verse in the **left** column (toolbar **`drive: left`**).
6. **Book / Chapter / Verse** → **JHN · 3 · 16**; click **JHN 3:16** on the left.
7. **Expect:** connector to **JHN 3:16** on the right.

If step 7 passes, proceed to the parity procedure below.

---

## Column layout

| Column | Translation | Role |
|---|---|---|
| **Left** | Spanish (`spanish-org` ingest) | Drive column (`drive=left`) |
| **Right** | American (`american-standard-multihop` ingest) | Follower column |

Always set **`rvers`** to the bootstrap **`org`** scheme (associated with the American translation after setup).

## Session defaults

| Control | Default |
|---|---|
| Left **Translation** | **`spanish-org`** |
| Right **Translation** | **`american-standard-multihop`** |
| **Mapping** | **Current** |
| Drive column | **Left** — click a verse in the left text column |
| Right **Versification** | Bootstrap **`org`** |
| Left **Versification** | **`spanish-org-ref`** (config A) or **`spanish-eng`** (config B) per case |

**Verse 0:** In **PSA** chapter **3**, the verse selector shows **`Title (0)`** when a scheme maps the psalm title.

## Parity procedure

For each `P-*` case below:

1. **Navigate** to the book/chapter/verse in the table.
2. Run **Configuration A (baseline)** — set **Left versification** to **`spanish-org-ref`**, click the drive-column verse, note overlay on the **right** (target spans, connector shape, void if exclude).
3. Run **Configuration B (two-hop)** — set **Left versification** to **`spanish-eng`**, same navigation and click, compare **right** column presentation.
4. **Pass** when relation topology and **right-side verse locations** match between A and B.

URL sketch: `?left=<spanish_uuid>&right=<american_uuid>&lvers=<scheme_uuid>&rvers=<org_uuid>&map=1&drive=left&book=...&chapter=...&verse=...`

---

## Parity cases (`P-*`)

### P-ident — identity sanity

| Field | Value |
|---|---|
| **Configuration A `lvers`** | spanish-org-ref |
| **Configuration B `lvers`** | spanish-eng |
| **Navigate to** | **JHN** · chapter **3** · verse **16** |
| **Action** | Click **JHN 3:16** on the **left** (Spanish) |
| **Expect (both configs)** | **One-to-one** alignment; **right** highlights **JHN 3:16**. Single connector. Configurations A and B look the same. |

### P-psa-title — split hop via engdemo

| Field | Value |
|---|---|
| **Configuration A `lvers`** | spanish-org-ref |
| **Configuration B `lvers`** | spanish-eng |
| **Navigate to** | **PSA** · chapter **3** · verse **0** (**Title (0)** in verse list) |
| **Action** | Click **PSA 3:0** / title row on the **left** |
| **Expect (both configs)** | **Same** right-column target verse(s) and connector topology. Baseline maps `PSA 3:0 → 3:2` direct; two-hop goes `3:0 → 3:1 → 3:2` via engdemo — parity requires identical **American/org** presentation. |
| **Note** | Primary non-trivial hop case; visually confirm follower lands on the same **PSA** chapter/verse on the right in A vs B. |

### P-gen-chain — two-step GEN renumber

| Field | Value |
|---|---|
| **Configuration A `lvers`** | spanish-org-ref |
| **Configuration B `lvers`** | spanish-eng |
| **Navigate to** | **GEN** · chapter **2** · verse **10** |
| **Action** | Click **GEN 2:10** on the **left** |
| **Expect (both configs)** | **Same** right-side location (**GEN 2:12** after composed chain in baseline vs hop1+hop2). Connectors may differ in hop count but **follower verse on the right** must match. |

### P-renumber — shared GEN 31:55 → 32:1

| Field | Value |
|---|---|
| **Configuration A `lvers`** | spanish-org-ref |
| **Configuration B `lvers`** | spanish-eng |
| **Navigate to** | **GEN** · chapter **31** · verse **55** |
| **Action** | Click **GEN 31:55** on the **left** |
| **Expect (both configs)** | **Right** follower at **GEN 32:1**. Renumber/chapter-crossing connector. A and B overlays match (hop2-only renumber on engdemo path). |

### P-exclude — ACT omission

| Field | Value |
|---|---|
| **Configuration A `lvers`** | spanish-org-ref |
| **Configuration B `lvers`** | spanish-eng |
| **Navigate to** | **ACT** · chapter **24** · verse **7** |
| **Action** | Click **ACT 24:7** on the **left** |
| **Expect (both configs)** | **Exclude** void on the right (dashed connector to gutter, no target outline). Both configurations empty on the American side for this verse. |

---

## Quick reference — where to click

| Case id | Book | Chapter | Verse | Part / label |
|---|---|---|---|---|
| P-ident | JHN | 3 | 16 | — |
| P-psa-title | PSA | 3 | 0 | Title (0) |
| P-gen-chain | GEN | 2 | 10 | — |
| P-renumber | GEN | 31 | 55 | — |
| P-exclude | ACT | 24 | 7 | — |

---

## Automated regression (optional)

Wiring and parity against `frvt_test` (not the browser DB):

```bash
pytest frvt/tests/test_multihop_chain_testbed.py -q
```

Seed wiring smoke:

```bash
pytest frvt/tests/test_multihop_chain_testbed.py::test_multihop_seed_creates_engdemo_translation -q
```

---

## Maintenance

If `pytest frvt/tests/test_multihop_chain_testbed.py` fails, fix hop ingredients and re-run before this walkthrough.

After builder or USX patch changes:

```bash
frvt/.venv/bin/python .test/scripts/write-multihop-assets.py
frvt/.venv/bin/python .test/scripts/seed-multihop-chain.py --replace spanish american
```

Spanish **`spanish-org.zip`** applies hyphen-milestone splitting (required for **ACT 24:6** and **ACT 24:7** in the Biblica ES sample). American **`american-standard-multihop.zip`** includes an **ACT 24:7** placeholder for exclude overlay QA.

Design reference: [`.spec/visual-demo-corpus-plan.md`](../.spec/visual-demo-corpus-plan.md) (Project B / multi-hop sections).

Seed scripts: [`.test/scripts/write-multihop-assets.py`](scripts/write-multihop-assets.py), [`.test/scripts/seed-multihop-chain.py`](scripts/seed-multihop-chain.py).
