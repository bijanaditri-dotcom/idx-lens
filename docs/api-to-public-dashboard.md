# Refresh the public dashboard through the private API

This is a follow-up to the Pages publishing patch. The dashboard stays on
GitHub Pages. MySQL, the Python collector, the API, and its credentials stay
on your Windows PC. A local export reads the authenticated API and writes
only selected market observations to `web/data/api-market.json`.

The Pages build converts this source file into the dashboard's public schema.
The website reads its published `data/market.json` on refresh and polls it
approximately once a minute while visible. It does not call your laptop or
trigger Yahoo collection for every visitor.

## First real-data run

Keep MySQL running. Start the API from the repository root in a terminal that
stays open, if it is not already running:

```powershell
.\.venv\Scripts\python.exe -m uvicorn main:app --app-dir .\api --env-file .\api\.env --host 127.0.0.1 --port 8000
```

In a second terminal at the repository root, collect current source observations:

```powershell
.\.venv\Scripts\python.exe .\collector\sync_yahoo.py
```

Optional: collect an IHSG observation, using the index support already in the
corrected collector:

```powershell
.\.venv\Scripts\python.exe .\collector\sync_yahoo.py --ticker '^JKSE'
```

This inserts the index into the local catalogue, so future default collector
runs can include it. It is an index input, not an additional stock prediction
target. A failed or unavailable index observation is not replaced by a sample.

Export the API results:

```powershell
.\.venv\Scripts\python.exe .\scripts\export_dashboard.py
```

Expect an exported stock count and a report of available daily bars. The
exporter reads the bearer token privately from `api/.env`, calls only the
loopback API, refuses redirects/proxy routing, and does not print the token.
It does not copy database configuration, sync logs, private fields, or browser
watchlists. It validates quote currency, prices, identities, and timestamps.

The exporter retains the previous file on API or validation failure. Read its
error message and resolve it before assuming that a new snapshot was produced.
An unavailable API does not silently switch the dashboard back to sample data.

## Preview the actual export

Stop an existing frontend preview with `Ctrl+C` before rebuilding. Keep the
API terminal open. In the frontend terminal:

```powershell
Set-Location .\web
npx.cmd --yes pnpm@11.25.0 run build:pages
npx.cmd --yes pnpm@11.25.0 run preview:pages
```

Open `http://127.0.0.1:4173/idx-lens/`. The interface should show **Published
snapshot**, the API's observed prices, and their source date. If you are
already in `web/`, omit `Set-Location .\web`.

The quote's observation time and collection time are retained separately.
The default age limit is 15 minutes; older observations remain visible but
are marked old, including outside trading hours. Running an export again
does not alter the original observation time. If your intended product is a
daily research snapshot, choose its age policy explicitly, for example:

```powershell
.\.venv\Scripts\python.exe .\scripts\export_dashboard.py --max-age-minutes 1440
```

Run that Python command from the repository root. Changing the threshold does
not improve source latency or prove that the observation is current.

No daily chart is manufactured from minute bars. Until Stage 4 supplies daily
history, some charts/indicators will be empty. The quote exporter does not
collect fundamentals, verified foreign trading, or news. Those fields remain
unavailable and all recommendations from this adapter remain **INCOMPLETE**.
IHSG is unavailable until an index quote is actually collected. Its values
are index points.

## Publish the first connected version

Confirm the market source permits publishing the observations you intend to
share. Review the generated `web/data/api-market.json` before committing it.
The file is intended to be public market data, not a private configuration.

On GitHub enable **Settings → Pages → Source → GitHub Actions** if you have
not yet done so. The prior Pages patch and this follow-up can be committed
together if the first patch is still uncommitted locally.

From the repository root, stage the application, workflow, export, and tests:

```powershell
git add README.md docs web scripts/export_dashboard.py tests/test_dashboard_export.py .github/workflows/pages.yml
.\.venv\Scripts\python.exe .\scripts\check_git.py --staged
```

After reviewing the staged paths and seeing `PASS`:

```powershell
git commit -m "Publish dashboard observations from the private API"
git push origin main
```

Wait for **Actions → Publish dashboard** to finish successfully. GitHub
displays the public URL in the deployment summary and **Settings → Pages**.
Visitors do not need a ChatGPT account. A build or deployment failure leaves
the last successful published version in place.

## Refresh published prices afterward

Keep the API and MySQL available, then repeat from the repository root:

```powershell
.\.venv\Scripts\python.exe .\collector\sync_yahoo.py
.\.venv\Scripts\python.exe .\scripts\export_dashboard.py
git add web/data/api-market.json
.\.venv\Scripts\python.exe .\scripts\check_git.py --staged
```

After a successful export and check, commit and push the data update:

```powershell
git commit -m "Refresh published market snapshot"
git push origin main
```

The workflow watches `web/**`, so this data commit builds and republishes the
dashboard. There is deployment latency; this is periodic snapshot publishing,
not a streaming quote API. No server schedule or unattended Git push is
created by this patch. Scheduled updates remain the later automation stage.

The public website remains accessible while your PC is off. The last
published prices remain available and become marked old as they age; new
local exports require the PC, MySQL, and API to be running.

An always-on publicly reachable HTTPS API would be a different hosting setup.
GitHub Pages itself cannot run FastAPI/MySQL, and a visitor's `127.0.0.1`
address points at their own computer. Do not put the private bearer token in
browser code to attempt that connection.

## Explicit demo mode for development

Normal production builds require a valid API export. If you deliberately
want the old illustrative preview for interface development, pass
`--mode demo` to `build:pages` or `dev:pages`. It stays visibly labelled demo;
missing or invalid real-data inputs never trigger that mode automatically.

Validation performed for this patch used a local mock API, not your Windows
MySQL server. Real connectivity and source availability are checked when you
run the exporter on your PC.
