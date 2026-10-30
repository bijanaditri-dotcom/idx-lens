# IDX Lens

An Indonesian stock research project. The working backend collects recent
Yahoo Finance chart quotes and price bars into MySQL and exposes authenticated
read endpoints through FastAPI.

Stage 0 was verified locally on Windows on 30 October 2026: six symbols synced,
`/health` reported a connected database, and authenticated `/v1/quotes` returned
six rows. These are recorded checks, not a promise that the API is currently
running or that the data is real time.

The dashboard source is maintained separately at this stage. This backend
folder does not yet contain a prediction model or a GitHub Pages frontend.

## Start here

For the existing working Windows installation, follow
[the Stage 1 GitHub guide](docs/stage1-github.md). It covers installation of
development dependencies, verification, the first commit, and pushing source
to a new repository.

## Files

| Path | Purpose |
| --- | --- |
| `collector/sync_yahoo.py` | One run of the corrected Yahoo chart HTTP collector; writes quotes, bars, and sync logs. |
| `collector/requirements.txt` | Collector dependencies. The HTTP implementation does not import yfinance. |
| `collector/.env.example` | Placeholder collector configuration; copy only for a new installation. |
| `api/main.py` | FastAPI endpoints and bearer authentication. |
| `api/requirements.txt` | API dependencies. |
| `api/.env.example` | Placeholder local API configuration. |
| `sql/schema.sql` | Database/table creation and six starter symbols; not a database backup. |
| `requirements.txt` | Installs the collector and API requirements together. |
| `requirements-dev.txt` | Runtime dependencies plus pytest and the API test client. |
| `scripts/check_api.py` | Checks the running local API without displaying credentials. |
| `scripts/check_git.py` | Checks staged/tracked files for excluded paths and several common credential patterns. |
| `scripts/freeze_environment.py` | Records exact installed versions for the current OS and Python version. |
| `tests/` | Isolated collector, API, and Git-check tests. No Yahoo requests or MySQL access. |
| `.github/workflows/checks.yml` | Runs checks with Python 3.12 on standard Windows and Linux runners. |
| `docs/` | Setup, scope, integration, and scheduling notes. |

## New installation

Use Python 3.12 and MySQL 8.0.19 or later for the row-alias upserts; the local
working setup used Python 3.12.6 and MySQL 8.0.46. Git is needed for version
control. Node/npm are not required to run this backend.

From the project root in PowerShell:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .\collector\.env.example .\collector\.env
Copy-Item .\api\.env.example .\api\.env
```

Edit the two `.env` files privately in VS Code. Create the database with
`sql/schema.sql` and create the MySQL accounts separately. Use a dedicated
collector account with SELECT/INSERT/UPDATE privileges; use a SELECT-only API
account before exposing an API beyond the local machine. The current local
test reused the collector's database account for the API.

The examples contain placeholders and do not create MySQL accounts or generate
a usable bearer token. Generate a fresh random token privately for a new
installation. Existing installations should retain their working `.env` files.

Before initializing a fresh database, confirm `fundamentals.period_end` in
`sql/schema.sql` is declared `DATE NOT NULL`, because it is part of the primary
key. The Stage 1 add-on preserves your existing schema file. A schema script
with `CREATE TABLE IF NOT EXISTS` does not migrate existing tables.

The Windows MySQL client is typically available at:

```powershell
& 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe' -u root -p
```

At the MySQL prompt, use `SOURCE` with the absolute schema path, using forward
slashes. Database setup is unnecessary when continuing the verified Stage 0
installation.

## Run after reopening VS Code

Open a terminal at the project root. Activation of `.venv` is optional because
the commands use its Python executable directly.

Run the collector once when you want to fetch data:

```powershell
.\.venv\Scripts\python.exe .\collector\sync_yahoo.py
```

For a single-symbol check, append `--ticker BBCA.JK`.

Start the API in a terminal that stays open:

```powershell
.\.venv\Scripts\python.exe -m uvicorn main:app --app-dir .\api --env-file .\api\.env --host 127.0.0.1 --port 8000
```

In another terminal at the same project root:

```powershell
.\.venv\Scripts\python.exe .\scripts\check_api.py --min-quotes 6
```

`Ctrl+C` stops Uvicorn. A `/favicon.ico` 404 from a browser is unrelated to API
health. Starting Uvicorn does not schedule the collector; data changes only
when a collector run succeeds.

## API

| Endpoint | Authentication | Returns |
| --- | --- | --- |
| `GET /health` | None | MySQL reachability, quote count, server time, and latest fetch time. |
| `GET /v1/quotes` | Bearer token | Current stored quote rows; optional ticker and limit. |
| `GET /v1/bars?ticker=BBCA.JK` | Bearer token | Stored OHLCV bars ordered chronologically. |
| `GET /v1/fundamentals?ticker=BBCA.JK` | Bearer token | Stored fundamental metrics, if separately populated. |
| `GET /v1/sync-status` | Bearer token | Recent collector logs. |

`market_time` is the source observation time; `fetched_at` is the collection
time. Both are returned in UTC. The collector does not fill the fundamentals
table, generate research scores, or train predictions.

## Verification and dependencies

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pip check
.\.venv\Scripts\python.exe -m pytest -q
```

Tests use constructed source responses and mocked API database reads. Keep
the running-API check above as the separate local integration check. SQL
upserts must also be verified against MySQL when application SQL changes.

The requirements files specify compatible version ranges. After successful
Windows verification, `scripts/freeze_environment.py` writes a platform-specific
version snapshot, such as `requirements-windows-py312.lock.txt`. Commit that
file for reference. It records all installed distributions and may include
packages left from earlier development. It is not a universal cross-platform
lock or a guarantee of future package availability.

## Project direction

The agreed sequence is **1 → 4 → 5 → (2 + 6) → 3 → 7**, following the completed
Stage 0. See [the roadmap](docs/roadmap.md). Source publication and website
hosting are separate steps. GitHub Pages can serve the future static
dashboard; it does not execute this Python API or MySQL server.

Keep real credentials, database exports, raw downloads, and local model
binaries outside Git. Public release of market data also requires verifying
the source's permitted use; successful access alone does not establish those
permissions.
