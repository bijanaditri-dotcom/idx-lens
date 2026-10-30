# IDX Lens

A responsive Indonesian equity research dashboard in dark glassmorphism. Built with React 19, TypeScript, Next.js App Router, Tailwind CSS 4, Lucide React, Framer Motion and Recharts, with an optional official TradingView widget.

## Start

```bash
corepack enable
corepack prepare pnpm@11.25.0 --activate
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm run dev:next
```

Open http://localhost:3000. Requires Node.js ≥22.13. The default is a deterministic **illustrative demo**, not live quotes. No API key is required for the demo. Use `pnpm run build:next` and `pnpm run start:next` for standard Next.js production. The default `dev`/`build` scripts target the separate Vinext/Cloudflare hosted Site runtime.

## Included

- IHSG price/volume chart, EMA overlay, range controls and TradingView mode.
- Searchable, sortable, sector/score-filtered screener and gated buy list.
- Browser-persistent watchlist, per-stock four-layer research and source details.
- Fundamental health, RSI/MACD/MA crossovers, foreign flow/CMF and news sentiment.
- CSV export with coverage, observation timestamps, provenance and formula escaping.
- Server adapters for an authorized normalized data provider, optional Yahoo daily-history research, and optional permitted RSS/Atom headlines.
- Timeouts, validation, 60-second polling, exponential reconnect, single-flight caching, stale snapshot retention and explicit whole-dataset demo fallback.
- Accessible native dialogs, keyboard focus, mobile navigation and reduced-motion styles.

## Research model

With full coverage: `Score = 30% fundamental + 35% technical + 20% flow + 15% sentiment`. With partial coverage, available evidence weights are normalized and an independent coverage gate suppresses incomplete actionable labels. BUY requires score ≥75, coverage ≥80%, complete technical data, at least 80% fundamental coverage, fundamental score ≥50 and a non-stale quote. The score is an uncalibrated research ranking, not an expected return or probability.

Free chart embedding does not establish a free real-time IDX backend feed. Prices and exchange data depend on permission, coverage and latency of the configured provider. The app does not scrape Stockbit or X, invent foreign flow, or silently blend demo fields into live stocks.

## Documentation

- [Project structure and architecture](docs/ARCHITECTURE.md)
- [Every scoring formula and missing-data rule](docs/SCORING.md)
- [Provider contract and complete synthetic payload example](docs/PROVIDER_CONTRACT.md)
- [Run locally and deploy to Vercel or Netlify](docs/DEPLOYMENT.md)
- [Automatic prices, fundamentals and news](docs/AUTOMATIC_DATA.md)
- [Public news, optional X API and legacy Stockbit snapshots](docs/STOCKBIT_AND_SENTIMENT.md)

## Checks

```bash
pnpm run typecheck
pnpm test
pnpm run build:next
```

The hosted Site also builds through its preserved Vinext/Vite integration using `pnpm build`. No database or broker integration is required. Default watchlist storage is local to each browser. The configured universe is a research sample, not the entire exchange.

The hosted exchange-wide mode and daily updater are documented in [EXCHANGE_WIDE_RESEARCH.md](docs/EXCHANGE_WIDE_RESEARCH.md). It uses a daily KSEI register, resumable persistent issuer scans, seven open-publication feeds and a dated research shortlist. Catalog coverage and actual data coverage are reported separately.
