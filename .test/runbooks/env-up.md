# Runbook: Environment up

Bring up Postgres, apply migrations, build the UI, and start the API so pytest and Playwright can run.

## Prerequisites

- Docker Desktop running
- Python 3.11+ venv at `frvt/.venv`
- Node.js + npm for `frvt/web`
- Repo root: `F:\Projects\FrontierResearch` (or your clone path)

## Steps (PowerShell)

```powershell
cd F:\Projects\FrontierResearch\frvt

# 1. Env file
if (-not (Test-Path .env)) { Copy-Item .env.example .env }

# 2. Postgres (host port 5433)
docker compose up -d
docker compose ps

# 3. Activate venv
.\.venv\Scripts\Activate.ps1

# 4. Migrations (app DB)
python -m alembic -c alembic.ini upgrade head

# 5. Build UI (served from web/dist by FastAPI)
cd web
npm ci
npm run build
cd ..

# 6. Start API+UI (leave this terminal open)
# From repo root so `frvt.api.main:app` resolves:
cd F:\Projects\FrontierResearch
.\frvt\.venv\Scripts\uvicorn.exe frvt.api.main:app --host 0.0.0.0 --port 8000 --app-dir F:\Projects\FrontierResearch
```

## Verify

```powershell
curl.exe -s -u admin:Admin123! http://localhost:8000/api/health
# Expect: {"status":"ok"} or equivalent 200 body
```

Default credentials (from `.env.example`): `admin` / `Admin123!`.

## Notes

- Pytest uses dedicated DB `frvt_test` on the same Postgres instance (see `frvt/tests/conftest.py`). Compose init SQL should create it; if missing, create manually: `CREATE DATABASE frvt_test;`.
- Playwright does **not** start the server. Phases 7–10 require this process to be running.
- To stop the API: Ctrl+C in the uvicorn terminal, or stop the listening PID on port 8000.
- To stop Postgres: `docker compose down` from `frvt/` (keeps volume unless `-v`).
