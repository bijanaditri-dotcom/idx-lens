# Run and deploy IDX Lens

## Requirements

Node.js 22.13 or newer and pnpm 11.25.0. The repository includes its exact dependency lockfile. `packageManager` selects the package manager version; use Corepack where available, or install that pnpm version from the official npm registry.

## Run locally with standard Next.js

```bash
corepack enable
corepack prepare pnpm@11.25.0 --activate
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm run dev:next
```

Open `http://localhost:3000`. No keys are needed. The default page explicitly shows a fixed illustrative dataset, including the demo date, rather than calling it live IDX data.

If Corepack is not installed with your Node distribution, install/activate pnpm using its official setup instructions. Do not mix npm/yarn lockfiles with the included pnpm lockfile.

For a production Next.js build:

```bash
pnpm run typecheck
pnpm test
pnpm run build:next
pnpm run start:next
```

`pnpm dev` and `pnpm build` are the separate Vinext/Worker commands retained for the hosted Site target. Use the `:next` scripts on Vercel or Netlify. Do not set static-export mode: the market API requires server execution.

## Vercel — personal, non-commercial deployment

1. Extract the source and push it to a repository you control. Keep `.env.local` and all credentials untracked. The sample `.env.example` is safe to commit.
2. Sign in to Vercel and select **Add New → Project → Import Git Repository**.
3. Choose **Next.js** as Framework Preset and Node.js 22 or a newer supported version.
4. Keep the included `vercel.json`: install command `pnpm install --frozen-lockfile`, build command `pnpm run build:next`, and dev command `pnpm run dev:next`. Let the Next.js preset manage the output directory; no static-directory override is needed.
5. Deploy without market credentials to verify the labeled demo first.
6. In **Project Settings → Environment Variables**, configure the authorized feed variables below. Redeploy after changing environment variables. Verify the **Data connections** dialog and source observation timestamps.
7. Check `/api/health` for process health and `/api/market` for actual source/freshness information. Exercise provider downtime before depending on a live deployment.

Vercel Hobby is free for personal, non-commercial projects and has usage limits. A commercial dashboard needs an appropriate paid plan. Free hosting does not grant free market data or exchange redistribution rights.

## Netlify — alternative

1. Push the same repository to Git and select **Add new project → Import an existing project** in Netlify.
2. Select your repository. Netlify detects Next.js and applies its supported framework integration automatically.
3. Use the included `netlify.toml`: build command `pnpm run build:next`, publish directory `.next`, Node.js 22. The `packageManager` field/lockfile specify pnpm.
4. Add server environment variables in the Netlify project settings, then deploy.
5. Verify the same health, market and UI source checks. Do not deploy the Worker `dist` output or treat `.next` as plain static HTML.

Netlify's current plan quotas and usage billing apply. Check them before public deployment; heavy polling traffic can exhaust any free tier.

## Configure data

| Variable | Purpose | Default |
| --- | --- | --- |
| IDX_PROVIDER_URL | Permitted HTTPS endpoint implementing the complete normalized contract | Unset |
| IDX_PROVIDER_TOKEN | Server-only bearer credential for that endpoint | Unset |
| ENABLE_YAHOO_RESEARCH | Opt into unofficial Yahoo daily-chart research mode | false |
| SENTIMENT_RSS_URL | Permitted direct HTTPS RSS/Atom feed | Unset |
| ALLOW_DEMO_FALLBACK | Explicitly replace entire failed dataset with labeled demo | false |
| QUOTE_MAX_AGE_SECONDS | Freshness budget for actual observation time | 345600 (4 days) |
| FLOW_MAX_AGE_SECONDS | Freshness budget for foreign-flow observation time | 345600 |
| FUNDAMENTAL_MAX_AGE_SECONDS | Statement observation/publication freshness | 15552000 (180 days) |

The four-day quote default supports **daily-history research**, including ordinary weekends; it is not an intraday latency target. For a licensed intraday feed use, for example, a budget consistent with your contracted delay and handle exchange closures through your provider. The UI always shows the actual source timestamp and known/unknown delay. A verified holiday calendar comes from the licensed provider payload, never from the local computer's timezone.

Provider selection is deterministic: licensed URL → otherwise explicitly enabled Yahoo → otherwise demo. An outage does not silently change a live stock's missing fields to sample values. See `PROVIDER_CONTRACT.md` for all fields and null semantics.

## TradingView widget

The TradingView switch embeds the official Advanced Chart widget for the chosen IDX symbol and preserves its attribution. Embedding does not provide a backend prices/indicators API. Widget symbol rights and exchange delays apply independently. If embedding fails, the widget panel offers an external TradingView link and the app's primary analysis chart remains available.

## Validation performed

Automated tests cover RSI reference values and degenerate series, EMA/MACD warm-up, golden cross detection, look-back-only support/resistance, missing/stale score gates, foreign-flow alignment, negative valuation cases, recency/negation, calendar boundaries, upstream validation, RSS deduplication/security, API errors and coherent provider fallback. Browser verification covers the rendered overview, chart controls, filtering, detail layers and watchlist interactions. The default demo requires no external data availability.

A production build validates code and bundling; it does not validate a vendor's live IDX entitlement, completeness, latency or historical data quality. The live custom provider and external Yahoo/RSS feeds require their own deployment-specific end-to-end verification.

## Official references, checked 28 October 2026

- [Next.js deployment](https://nextjs.org/docs/app/getting-started/deploying)
- [Vercel configuration](https://vercel.com/docs/project-configuration)
- [Vercel Hobby restrictions](https://vercel.com/docs/plans/hobby)
- [Netlify Next.js](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/)
- [TradingView widget data FAQ](https://www.tradingview.com/widget-docs/faq/data/)
- [IDX data services](https://www.idx.id/en/products/idx-data-services/)
