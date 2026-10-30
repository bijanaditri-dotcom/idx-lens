# Stockbit and sentiment connections

The dashboard distinguishes a public Stockbit news feed, imported user snapshots, and an authenticated Stockbit account. It does not claim these are the same connection.

## Public news: available without an account token

Set `ENABLE_NEWS_SENTIMENT=true` to read the public Stockbit Snips RSS feed and ANTARA Bursa/Finansial RSS feeds. The server stores links, short headlines, publisher names and actual publication timestamps. Article bodies and private Stockbit streams are not scraped. The RSS sources are cached for 10 minutes, matched to individual issuers by ticker/name/known alias, and deduplicated across feeds. Roundups naming more than three tracked issuers are excluded from per-stock scoring to avoid attributing a market-wide headline to every company.

A source can be active with zero matching items. Missing stock-specific news stays unavailable. A source outage is labeled; sample articles are never substituted. The small bilingual sentiment lexicon is a baseline, not a calibrated financial language model. Headline polarity does not establish a trade's expected return.

## Legacy Stockbit snapshots (optional server path)

The current dashboard uses automatic mode and no longer presents a required CSV upload. Existing snapshot records are retained for compatibility; automatic mode bypasses them. See `AUTOMATIC_DATA.md` for the active setup.

The following describes the legacy snapshot format.

The legacy CSV endpoint accepts the normalized template described below. The template is this dashboard's normalized input format, not a promise that Stockbit offers a native file with identical columns. Map any permitted native export into these fields, or enter observations you are allowed to use. No Stockbit password, trading PIN or session token is requested.

Columns:

```text
symbol,type,as_of,per,pbv,roe,der,dividend_yield,market_cap_idr,revenue_growth,net_profit_margin,date,foreign_buy_idr,foreign_sell_idr
```

- `symbol`: one of the dashboard's configured four-letter tickers.
- `type`: `fundamental` (one row per ticker) or `flow` (one row per trading session).
- `as_of`: the actual source observation timestamp, with timezone, e.g. `2026-10-28T16:15:00+07:00`. Do not use a future timestamp or replace an old observation date with today's upload date.
- Fundamental percentages use percentage points: `20` means 20%. PER/PBV/DER are multiples. Market cap is IDR. Empty numeric cells remain null. No formulas, currency suffixes, or thousands separators are accepted.
- Flow rows require `date`, `foreign_buy_idr`, and `foreign_sell_idr`. Use actual IDR amounts, not shares, lots, total broker turnover or a volume×closing-price estimate. Five dated sessions must align with the latest five price candles for a complete foreign-flow calculation.

Uploads are limited to 150 KB and 50 tickers. Data is saved per signed-in ChatGPT user in the hosted Site's D1 database. Same-origin authenticated writes are required. Older imports cannot replace newer observed snapshots. Uploaded fields do not replace live price history. Newer configured provider observations take priority over older imports.

Imported valuation ratios retain their observation-date values; they are not automatically repriced without underlying EPS/BVPS/share-count data. Update them when price changes matter. Imported fundamental snapshots expire after seven days for scoring; foreign observations use a four-day limit and still require session alignment. Source labels identify manual imports.

The built-in persistent import adapter targets the hosted Cloudflare/D1 Site. A standalone standard Next.js deployment needs an equivalent persistent store and authentication integration; it deliberately rejects imports when these are not configured.

## X: connector implemented, access must be configured

The official recent-search adapter uses `https://api.x.com/2/tweets/search/recent`, a fixed server-controlled ticker query, and a server secret `X_BEARER_TOKEN`. It fetches up to 20 recent posts per refresh, excludes reposts and replies, preserves timestamps and source links, and applies the same issuer relevance and deduplication rules.

It remains inactive unless both `ENABLE_X_SENTIMENT=true` and the Bearer Token are configured. An approved developer app and applicable API access/credits are required. No account or API subscription is purchased by this project.

A D1-backed atomic refresh claim limits requests to once per 30-minute cache interval across Worker instances; failures back off for at least an hour. Without the shared cache, X fails closed before making a request. The UI never exposes the token. API usage can incur charges; verify your plan and budget before enabling it.

## Direct Stockbit account synchronization

No verified account connector or authorized private Stockbit data feed was available during implementation. Direct account synchronization therefore remains unconfigured. A permitted API/feed and its documentation are needed to implement that path. A generic `IDX_PROVIDER_URL` is already supported for an authorized adapter matching `PROVIDER_CONTRACT.md`. Private API reverse-engineering or copying a full-access account session token is not part of this implementation.
