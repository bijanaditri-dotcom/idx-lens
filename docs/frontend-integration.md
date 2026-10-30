# Frontend integration boundary

The current working folder is a backend. Its API supplies quote, bar,
fundamental-table, and sync-log rows. The separately hosted IDX Lens dashboard
has its own application source and normalized research-provider contract.
Pointing that provider setting directly at `/v1/quotes` does not satisfy its
full contract; integration requires a deliberate adapter.

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
