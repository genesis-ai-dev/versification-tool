# Runbook: Defect loop

When a phase gate or single case fails because the **product** is wrong, fix the product and re-verify. Do not weaken the test to match a bug.

## Steps

1. **Isolate** — Re-run the smallest failing unit:
   - Pytest: `pytest frvt/tests/path.py -k "keyword" -vv` from `frvt/` with venv + `PYTHONPATH` = repo root
   - Playwright: `npx playwright test e2e/foo.spec.ts -g "TC-…"` from `frvt/web/` with server already up
2. **Classify**
   - Product defect → fix under `frvt/api|resolver|ingest|web/src` (Rules 1–11; **no** phase IDs in product code)
   - Wrong/ambiguous Expected result vs Interim lock (A-04 / R-01–R-10) → **stop and escalate** to owner; do not “fix” by changing locks
   - Flaky e2e → replace sleeps with waits on URL/labels; fix harness if needed (Rule 12 exempt)
3. **Re-run** the isolated test, then the phase gate: `python -m frvt.testops.run_suite --phase N`
4. **Record** a short note in [../coverage-matrix.md](../coverage-matrix.md) if a risk flag applied
5. **Do not commit or push**

## Stop conditions

- Interim algorithm conflict needing owner decision
- Missing fixture that cannot be synthesized from `research/` assets
- Environment broken (Postgres/auth) — repair via [env-up.md](./env-up.md) first
