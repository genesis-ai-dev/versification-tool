# Runbook: Run a phase gate

Execute one phase of [frvt-3-test-execution-plan-1.md](../../.spec/frvt-3-test-execution-plan-1.md) and stop on failure.

## Preconditions

- For phases **1–6, 11 (pytest/vitest):** Postgres up (`docker compose up -d` in `frvt/`). Live uvicorn is **not** required.
- For phases **7–10:** Also complete [env-up.md](./env-up.md) so `http://localhost:8000` serves API+UI.
- Phase **0** needs no server (filesystem/import checks only).
- Phase **12** needs Postgres + server + all prior phases green.

## Command

From repo root:

```powershell
cd F:\Projects\FrontierResearch
.\frvt\.venv\Scripts\Activate.ps1
$env:PYTHONPATH = "F:\Projects\FrontierResearch"
python -m frvt.testops.run_suite --phase N
```

Replace `N` with `0` … `12`.

## After a green gate

1. Update [../coverage-matrix.md](../coverage-matrix.md) statuses for cases finished in that phase.
2. Run quality gates on touched code (see execution plan).
3. Proceed to the next phase only when Acceptance in the execution plan is met.

## After a red gate

Follow [defect-loop.md](./defect-loop.md). Do not start the next phase.
