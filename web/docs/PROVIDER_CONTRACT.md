# Connect an authorized IDX provider

The working demo needs no credentials. For live analysis, the app accepts a vendor-neutral normalized HTTPS endpoint at `IDX_PROVIDER_URL`. Set `IDX_PROVIDER_TOKEN` if that endpoint requires a bearer token. It is read only by server modules; no `NEXT_PUBLIC_` token exists.

This endpoint is an adapter contract, not an assertion that a free exchange-wide API exists. Map fields from a provider you are permitted to use. Licensed foreign-flow, fundamentals and redistribution entitlements are separate from the ability to embed a free chart.

## Request

```http
GET <IDX_PROVIDER_URL>
Authorization: Bearer <IDX_PROVIDER_TOKEN>
Accept: application/json
```

The URL is static, operator-controlled and HTTPS-only. Redirects are rejected, timeout is 7 seconds and body is capped at 3 MB. Only the fixed Yahoo host can be requested through the Yahoo adapter. Visitors cannot submit arbitrary upstream URLs or ticker universes.

## Response structure

`docs/provider.example.json` is a complete **shape example**, generated from the sample fixture with provider-style provenance; it is synthetic and must not be used as a production feed. `lib/server/schema.ts` is the executable contract.

```ts
{
  stocks: RawStock[], // 1–50 unique four-letter uppercase IDX tickers
  index: {
    symbol: 'IHSG',
    name: string,
    candles: Candle[],
    quote: Stamp
  },
  holidays?: string[] // complete maintained holiday calendar, YYYY-MM-DD
}
```

Each `RawStock` includes symbol, name, normalized sector, and:

| Field | Required data |
| --- | --- |
| candles | 2–600 ascending unique daily bars; preferably ≥250; time YYYY-MM-DD; OHLC strictly positive; volume shares ≥0 |
| quote | Stamp whose `asOf` is the actual last observation time |
| fundamentals | Object of 8 nullable metrics, or null when unavailable |
| fundamentalSource | Stamp, mandatory when fundamentals exist |
| foreignFlows | Ascending unique daily `{date,buy,sell}` rows, in IDR; up to 30 |
| flowSource | Stamp, mandatory for nonempty flows |
| articles | Up to 100 unique authorized headlines/items |
| sentimentSource | Stamp, mandatory for nonempty articles |

Every stamp:

```ts
{
  source: string,                  // <=120 characters, clear provider identity
  kind: 'provider'|'yahoo'|'rss',  // external payloads cannot claim demo status
  asOf: string,                   // ISO-8601 with timezone, not future
  stale: boolean,
  delayMinutes: number|null       // actual provider delay, null if unknown
}
```

Missing layers use `null` source and null/empty data. A timestamp must refer to the source data's observation/publication, not merely the time your adapter ran. Quote and flow timestamps should reflect latest actual exchange trading. Fundamental timestamps should reflect the financial statement release or observation. Externally supplied stale flags are preserved and can only become more conservative.

Fundamental object fields: `per`, `pbv`, `roe`, `der`, `dividendYield`, `marketCap`, `revenueGrowth`, `netProfitMargin`. All may be null. Ratios PER/PBV/DER are multiples. ROE, yield, growth and margin are **percentage points** (20 = 20%, not 0.20). Market cap is IDR. Do not turn missing ratios into zeros. Negative PER/PBV remain negative so the engine can explicitly penalize invalid valuation cases.

Use sector `Financials` to select the bank-style DER exclusion. Other sector labels are display/filter metadata; this is not an IDX industry-classification service. Map your provider's taxonomy explicitly. Ensure consistent adjusted OHLC around corporate actions. The app does not combine a live quote with invented historical bars.

Article fields:

```ts
{
  id: string,
  title: string,
  url: string|null,               // HTTPS only; never javascript/data links
  publisher: string,
  publishedAt: string,            // actual source timestamp, ISO with timezone
  channel: 'news'|'social',
  sentiment: number,              // validated polarity in [-1,1]
  relevance: string[]             // explicitly attributed uppercase IDX tickers
}
```

Use licensed Stockbit/X/social feeds here only when authorized. The baseline RSS adapter scores headlines itself; provider items can carry a validated model's polarity.

## Optional Yahoo adapter

Set `ENABLE_YAHOO_RESEARCH=true` and leave `IDX_PROVIDER_URL` empty. The adapter requests daily history for the 12 symbols in `lib/demo.ts` using `TICKER.JK`, and `^JKSE` for IHSG. That universe is a selection of symbols, not simulated market data in Yahoo mode. The HTTP endpoint is unofficial and has no SLA; it may return 401/429 or change schema. The app omits failed symbols, reports them, and does not backfill them from demo.

Fundamentals and actual foreign flows remain unavailable in this mode. A CMF proxy alone contributes only 40% flow-layer coverage. No fabricated foreign trading or neutral financial ratios are inserted. Delay is taken from provider metadata where present and otherwise unknown. Using an unofficial endpoint does not grant a redistribution license.

## Optional RSS adapter

Set `SENTIMENT_RSS_URL` to a permitted HTTPS RSS/Atom endpoint that returns a direct 200 response. No access key is required by this implementation; for authenticated feeds, normalize them behind your own authorized adapter. RSS runs only with a non-demo market dataset, preserving the demo's coherent provenance. The adapter checks up to 100 items and headlines only, then filters by ticker/company name and seven-day recency. It does not scrape article bodies.

## API behavior

- `GET /api/market`: entire configured universe with analyzed layers.
- `GET /api/market?symbol=BBCA`: one stock, same cached snapshot.
- Bad symbols or unknown parameters: 400; unavailable symbol:404.
- Cold upstream outage without demo opt-in:503 and Retry-After:60.
- `GET /api/health`: process health, not upstream freshness.

A successful HTTP response can still contain explicitly demo or stale data: inspect `mode`, `quote.kind`, `quote.stale`, `asOf`, per-layer coverage and warnings. Never infer live exchange status from HTTP 200.
