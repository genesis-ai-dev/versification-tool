# Runbook: Full suite (autonomous)

Run all phase gates fail-fast after environment is ready. Intended for phase 12 and for regression after large fixes.

## Preconditions

1. Complete [env-up.md](./env-up.md) (Postgres + migrations + UI build + **uvicorn running**).
2. All case bodies implemented; [../coverage-matrix.md](../coverage-matrix.md) has no `pending` / `deferred-*` rows (phase 12 exit criterion).
3. Playwright browsers installed once: `cd frvt/web; npx playwright install chromium`

## Command

```powershell
cd F:\Projects\FrontierResearch
.\frvt\.venv\Scripts\Activate.ps1
$env:PYTHONPATH = "F:\Projects\FrontierResearch"
python -m frvt.testops.run_suite --all
```

`--all` runs phases 0→12 in order and stops at the first non-zero exit.

## After success

- Confirm coverage matrix is fully `done` / `oos-confirmed`
- Run quality gates from the execution plan
- Leave changes uncommitted for owner review

## After failure

- Note the failing phase from the runner output
- Use [defect-loop.md](./defect-loop.md) and [run-phase.md](./run-phase.md)
- Re-run `--all` only after that phase is green again
