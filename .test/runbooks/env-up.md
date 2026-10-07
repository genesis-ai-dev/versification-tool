# Runbook: Environment up

Bring up Postgres, apply migrations, build the UI, and start the API so pytest and Playwright can run.

## Prerequisites

- Docker running
- Python 3.11+ venv at `frvt/.venv`
- Node.js + npm for `frvt/web`
- `$REPO` set to the clone root

## Steps (bash)

```bash
cd "$REPO/frvt"
if [ ! -f .env ]; then cp .env.example .env; fi

docker compose up -d
docker compose ps

source .venv/bin/activate
python -m alembic -c alembic.ini upgrade head

cd web
npm ci
npm run build
cd ..

cd "$REPO"
./frvt/.venv/bin/uvicorn frvt.api.main:app --host 0.0.0.0 --port 8000 --app-dir "$REPO"
```

PowerShell is the same sequence. Use `.\.venv\Scripts\Activate.ps1`, `Copy-Item .env.example .env`, and `.\frvt\.venv\Scripts\uvicorn.exe` with `--app-dir` set to the clone root.

## Verify

```powershell
curl.exe -s -u admin:Admin123! http://localhost:8000/api/health
# Expect: {"status":"ok"} or equivalent 200 body
```

Default credentials (from `.env.example`): `admin` / `Admin123!`.

## Notes

- Pytest uses database `frvt_test` on the same Postgres instance (`frvt/tests/conftest.py`). The fixture creates it when it is missing. `pytest -n auto` uses one database per worker (`frvt_test_gw0`, `frvt_test_gw1`, …).
- Playwright does **not** start the server. Phases 7–10 require this process to be running.
- To stop the API: Ctrl+C in the uvicorn terminal, or stop the listening PID on port 8000.
- To stop Postgres: `docker compose down` from `frvt/` (keeps volume unless `-v`).
