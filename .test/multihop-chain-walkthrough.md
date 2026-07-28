# Multi-hop Chain Test Bed — Manual Walkthrough

Manual parity QA for Project B. Case ids match [`PARITY_CASES`](../frvt/testops/fixtures/multihop_chain_fixtures.py).

## Preconditions

1. FRVT server running with Postgres.
2. Bootstrap **`org`** anchor present.
3. Seed the test bed:

```bash
pytest frvt/tests/test_multihop_chain_testbed.py::test_multihop_seed_creates_engdemo_translation -q
```

4. Record from seed output:
   - `spanish_translation_id` → **left** column (Spanish)
   - `american_translation_id` → **right** column (American)
   - `spanish_org_ref_scheme_id`, `spanish_eng_scheme_id`, `org_scheme_id`

## Column layout

| Column | Translation | Role |
|---|---|---|
| **Left** | Spanish (`spanish-org` ingest) | Drive column (`drive=left`) |
| **Right** | American (`american-standard-multihop` ingest) | Follower column |

Always set **`rvers`** to the bootstrap **`org`** scheme UUID (associated with the American translation after seed).

## Parity procedure

For each `P-*` case below:

1. **Navigate** to the book/chapter/verse in the table.
2. Run **Configuration A (baseline)** — set `lvers` to **spanish-org-ref**, click the drive-column verse, note overlay on the **right** (target spans, connector shape, void if exclude).
3. Run **Configuration B (two-hop)** — set `lvers` to **spanish-eng**, same navigation and click, compare **right** column presentation.
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

## Maintenance

If `pytest frvt/tests/test_multihop_chain_testbed.py` fails, fix hop ingredients and re-run before this walkthrough.

Design reference: [`.spec/multihop-chain-testbed-1.md`](../.spec/multihop-chain-testbed-1.md).
