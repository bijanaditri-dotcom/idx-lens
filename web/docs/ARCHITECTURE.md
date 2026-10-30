# Architecture

IDX Lens is a TypeScript React dashboard with Next.js App Router routes. The same application source runs in standard Next.js on Vercel/Netlify and in the supplied Vinext/Vite Cloudflare Worker target used by the hosted demo. The default build command targets the Worker; `build:next` targets standard Next.js. Run these builds sequentially: both toolchains may update generated Next.js route types. The independent `typecheck` command uses `tsconfig.check.json` to inspect authored source without mixing generated types.

## Project map

```text
app/
  layout.tsx                 Metadata and global layout
  page.tsx                   Dynamic server-rendered first snapshot
  globals.css                Tailwind 4, glass surfaces, responsive layouts
  api/market/route.ts        Validated market endpoint; optional ?symbol=BBCA
  api/health/route.ts        Minimal non-sensitive health check
components/dashboard/
  dashboard.tsx              Navigation, filters, ranking, watchlist and export
  stock-detail.tsx           All four analysis layers in a native dialog
  charts.tsx                 Recharts visuals and isolated TradingView widget
  dialog.tsx                 Native focus trap, Escape, focus restoration
  ui.tsx                     Shared score, signal and ticker components
hooks/use-market.ts          Polling, aborts, reconnect, validation and backoff
lib/
  types.ts                   Domain contracts
  wire-schema.ts             Runtime validation of server response in browser
  demo.ts                    Deterministic, fixed-date illustrative fixture
  format.ts                  IDR amounts, scores, WIB timestamps
  market-hours.ts            Regular-market sessions in Asia/Jakarta
  analysis/
    indicators.ts            Wilder RSI, EMA, MACD, CMF, support/resistance
    scoring.ts               Layer scores, coverage and actionable-label gates
    sentiment.ts             English/Indonesian lexicon and simple negation
  server/
    schema.ts                Zod validation of provider payloads
    http.ts                  HTTPS, byte limits, timeout and redirect control
    providers.ts             Licensed JSON, optional Yahoo, optional RSS
    market.ts                Provider orchestration, single-flight/cache/fallback
 tests/
  engine.test.ts             Indicator reference values, score/missingness/API
  providers.test.ts          RSS dedupe, invalid feed and HTTP failure tests
 docs/
  ARCHITECTURE.md
  SCORING.md
  PROVIDER_CONTRACT.md
  DEPLOYMENT.md
 .env.example
 vercel.json
 netlify.toml
 pnpm-lock.yaml
 vite.config.ts              Preserved Sites/Vinext Worker integration
 worker/index.ts             Worker entrypoint (unused by standard Next.js)
 scripts/                    Portable starter runtime/build support
```

The supplied starter also retains UI primitives and optional database tooling, which the dashboard does not use. No database, account, trading integration or paid API is needed for the default demo.

## Data path

1. The dynamic page requests the initial server snapshot. If an upstream is down, the client receives the connection/retry view rather than a crashed page.
2. The server chooses one coherent dataset: configured licensed endpoint; otherwise explicitly enabled Yahoo; otherwise the fixed demo.
3. Zod validates the permitted provider contract. Live payloads cannot declare themselves demo data. Symbols, finite numbers, OHLC bounds, chronological unique dates, timestamps, safe HTTPS links, provenance and maximum sizes are checked.
4. Server-configured freshness budgets mark stale observations. The analysis functions compute features and coverage. Optional RSS adds only matched, recent headlines.
5. The browser validates the resulting JSON before replacing the prior snapshot. The client polls every 60 seconds, refreshes on returning to the tab/going online, and suspends scheduled fetches while hidden.
6. The source kind and observation timestamp travel with each layer. Fetched time is separate from observation time. Demo data uses a fixed 27 October 2026 snapshot; refreshing never fabricates a new trade.

## Reliability and limits

- One in-flight upstream refresh and a 55-second isolate-local cache reduce duplicate work. The market clock is recomputed on reads.
- HTTP calls time out at 7 seconds, reject redirects, and enforce body limits (3 MB JSON, 700 KB RSS). The client has a 20-second timeout, exponential retry from 15 seconds up to 5 minutes, plus jitter.
- Explicit upstream failure either retains a marked-stale prior live snapshot with all BUY labels suspended, returns 503 on a cold start, or changes the **entire** dataset to labeled demo when `ALLOW_DEMO_FALLBACK=true`. Individual missing Yahoo symbols are omitted with a warning; they are never padded with sample data.
- RSS failure preserves available provider sentiment and reports a warning. Missing inputs stay null. CMF remains visibly a proxy when foreign flow is absent.
- Watchlists live in browser localStorage with input validation and storage exceptions handled. They do not synchronize between devices. CSV exports include source/coverage/as-of columns and escape spreadsheet formulas.
- Native dialogs trap focus, close on Escape and restore focus. Responsive layouts include a mobile drawer, scrollable tables, visible focus states and reduced-motion support.
- TradingView is loaded only when selected. Its feed is independent of the analysis API; an iframe appearing is not proof that a symbol is entitled. Script failure/timeout offers an external chart link. Provider restrictions inside an iframe remain visible.
- No websocket is claimed: the app is a 60-second polling client. A permitted websocket feed can update the same normalized provider contract behind the server adapter.

## Before scaling a live public service

Use a shared upstream cache/rate limiter at your CDN or gateway: isolate memory is not a distributed quota. Keep vendor keys in the deployment's server environment. The provider URL is an operator-controlled HTTPS setting and must not be exposed as an editable visitor input. Configure authorized exchange redistribution, a maintained holiday calendar, appropriate intraday freshness budgets and operational monitoring. Use a sector/industry benchmark calibration and point-in-time backtest before promoting the research ranking to a trading strategy. None of these claims is simulated by the demo.

Historical OHLC must be internally consistent across corporate actions. The app does not adjust splits/dividends or implement survivorship-bias corrections itself. Daily indicator values can change while the current daily candle is forming. All rankings cover the configured universe, not all IDX listings.

## Stockbit and sentiment extension

`lib/server/sentiment-feeds.ts` aggregates the configured public Stockbit Snips and ANTARA RSS sources and the optional official X recent-search API. Public source status, actual publication timestamps and matched-item counts are returned in `MarketData.sources`. X remains explicitly disabled until an approved developer app/token is configured.

`lib/server/data-store.ts` carries the request's D1 binding through AsyncLocalStorage without importing Cloudflare-specific modules into portable Next.js routes. `feed_cache` provides atomic shared refresh claims; `stockbit_snapshots` is keyed by user and ticker. The Worker installs this context before handling requests. `personal-market.ts` overlays only the current signed-in user's imported observations onto the shared public market snapshot, then reruns analysis. Private imports never enter the shared public cache.

`POST /api/stockbit` accepts the normalized CSV through authenticated same-origin JSON requests and rejects oversized streams, formulas, invalid values and future timestamps. It does not authenticate to Stockbit. See `STOCKBIT_AND_SENTIMENT.md` for units, limits, freshness rules, access prerequisites and standalone deployment limits.
