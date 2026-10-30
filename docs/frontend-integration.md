# Frontend integration boundary

The repository contains the Python backend at its root and the imported visual
dashboard in `web/`. The backend API supplies quote, bar, fundamental-table,
and sync-log rows. The dashboard retains its own application server routes and
normalized research-provider contract, documented in `web/docs/PROVIDER_CONTRACT.md`.
Pointing that provider setting directly at `/v1/quotes` does not satisfy its
full contract; integration requires a deliberate adapter.

The source import uses the visual dashboard's hosted version 12, source commit
`b3b9226a99ac0db4bff77d7cede52b4657645d77`. Its platform hosting identity is
excluded from this GitHub copy. Application code, the dependency lockfile, and
placeholder environment template are retained. Importing source does not deploy
the Site or change its access settings.

For the API-connected static frontend, follow
[`api-to-public-dashboard.md`](api-to-public-dashboard.md). The local exporter
reads private API credentials, writes only selected public observations, and
the Pages build converts that export into the UI schema. Public browsers
read a published JSON snapshot; they do not call the laptop's private API.

For the original server-based local UI development, install dependencies in `web/` and use its
`dev:next` script. The default environment starts a labelled demonstration
dataset without a ChatGPT sign-in or a live MySQL connection. Keep the Python
API token in a server environment when adding an adapter.

For the planned free static release, prepare compact public JSON snapshots
from the local pipeline, then let the frontend read those snapshots. Add this
when the history/model outputs are defined. GitHub Pages hosts static files;
it cannot execute FastAPI, MySQL, or an arbitrary Next.js server route.

Keep bearer tokens and database credentials out of browser code, including
frontend environment variables that get embedded during the build. If a
server-backed deployment is chosen later, use a server-side adapter for
authenticated API reads.

Keep source observation time, fetch time, research analysis time, and model
issue time distinct. Show stale/unavailable data honestly. A quote refresh
does not automatically recalculate research scores or retrain a model. The
collector currently provides no complete fundamental/news/foreign-flow feed.
