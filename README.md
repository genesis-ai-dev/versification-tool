# versification-tool

Versification viewer for Codex and adjacent apps: a FastAPI API, PostgreSQL, and a React UI served from the same process.

All HTTP routes (API, `/docs`, static UI) are gated with HTTP Basic. Default credentials are **local only**.

## Prerequisites

- Docker
- Python 3.11+
- Node.js and npm

## Local run

From a bash shell, with the repository root as `$REPO`:

```bash
cd "$REPO/frvt"
if [ ! -f .env ]; then cp .env.example .env; fi
docker compose up -d

python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m alembic -c alembic.ini upgrade head

cd web
npm ci
npm run build
cd ..

cd "$REPO"
./frvt/.venv/bin/uvicorn frvt.api.main:app --host 0.0.0.0 --port 8000 --app-dir "$REPO"
```

Postgres is published on host port **5433**. Uvicorn must be started from the **repository root** so the `frvt` package imports.

Health check:

```bash
curl -s -u 'admin:Admin123!' http://localhost:8000/api/health
# Expect: {"status":"ok"}
```

### PowerShell (short alternate)

```powershell
cd $REPO\frvt
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
docker compose up -d
.\.venv\Scripts\Activate.ps1
python -m alembic -c alembic.ini upgrade head
cd web; npm ci; npm run build; cd ..
cd $REPO
.\frvt\.venv\Scripts\uvicorn.exe frvt.api.main:app --host 0.0.0.0 --port 8000 --app-dir $REPO
```

## Tests

The backend suite needs the Compose database running (`docker compose up -d`). Run it from `$REPO/frvt` with the repository root on `PYTHONPATH`:

```bash
cd "$REPO/frvt"
PYTHONPATH="$REPO" .venv/bin/python -m pytest -n auto
```

`-n auto` (pytest-xdist) is worth using: the suite is dominated by database work, and each worker gets its own database (`frvt_test_gw0`, `frvt_test_gw1`, …) created and migrated on first use. Drop `-n` when you need `--pdb` or readable per-test output.

Canonical anchors are seeded once per run and committed; every test then runs inside a transaction that is rolled back, so tests never see each other's writes.

## Security

- Every route requires HTTP Basic unless you opt a path out. Defaults: username `admin`, password `Admin123!`. Those values log a **WARNING** at startup and must not be used on a shared or public host. Set `BASIC_AUTH_USERNAME` and `BASIC_AUTH_PASSWORD` first.
- Failed authentication is limited to **10** failures per client IP per **60** seconds, then `429` with `code: too_many_requests`. `BASIC_AUTH_FAILURE_LIMIT=0` or a non-positive `BASIC_AUTH_FAILURE_WINDOW_SECONDS` disables that limiter (failures stay `401`).
- `TRUST_PROXY_HEADERS` defaults to `false`. Enable it **only** behind a trusted proxy (for example an ALB). The limiter then keys on the **rightmost** `X-Forwarded-For` hop.
- `BASIC_AUTH_PUBLIC_PATHS` is a comma-separated list of path prefixes and defaults to empty. Prefix `/` disables the gate for **every** path, including the limiter. Do not set that in production.
- AWS edge controls (WAF, Shield, private subnets, RDS, logging) are **not** implemented in this repository. See the AWS deployment recommendations document in `.spec/`.
