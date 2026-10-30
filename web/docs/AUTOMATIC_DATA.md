# Automatic data mode

The hosted dashboard uses automatic connected sources. It does not require CSV uploads or manual financial entries. `AUTOMATIC_DATA_ONLY` defaults to true and bypasses legacy personal snapshot overlays. Existing imported records are preserved; the upload form is no longer part of the dashboard flow.

## Sources

- Yahoo chart: actual available daily OHLC/volume and reported dividend/split events; fetched every market snapshot refresh. This is an unofficial personal research endpoint with unknown exchange delay and no SLA.
- Yahoo financial timeseries: reported IDR income, revenue, EPS, equity, debt and ordinary share counts. Set `ENABLE_AUTO_FUNDAMENTALS=true`. Raw financial observations are cached for six hours in the hosted shared cache; derived valuation ratios are recalculated with available market prices. No manual input or extra API key is used by this adapter.
- Stockbit Snips and ANTARA: automatic public news RSS as configured in `STOCKBIT_AND_SENTIMENT.md`.
- Direct Stockbit account/foreign trading feed: not connected without an authorized account/feed integration. An existing Stockbit account does not itself supply this dashboard with a supported delegated credential.
- X: official recent-search adapter remains opt-in and requires an approved developer app/token and applicable API access. No credits or subscriptions are purchased automatically.

## Fundamental calculations

Income and revenue must share a reporting date and window. Prefer trailing twelve months; use an explicitly labeled fiscal-year window only when no matched TTM window exists. Never combine annual EPS with quarterly/TTM earnings. Prefer reported diluted EPS, otherwise reported basic EPS for the same period. Monetary observations must be IDR; shares remain share counts. Missing, incompatible-currency or inconsistent-period observations stay unavailable.

| Metric | Definition |
| --- | --- |
| PER | Available quote / matching reported EPS |
| PBV | Available quote / (latest reported equity / matching ordinary shares) |
| ROE | Matching common-shareholder net income / average equity at period end and one year earlier; non-positive average equity is unavailable |
| DER | Reported total debt / equity on the same balance-sheet date |
| Dividend yield | Reported dividend events in the trailing 365 days / quote; historical per-share amounts are adjusted for later reported splits |
| Market cap (calculated) | Available quote × latest reported ordinary share count; this is not a claim of an independently updated live share count |
| Revenue growth | Matching TTM or fiscal-year revenue relative to the same period end one year earlier |
| Net profit margin | Matching common-shareholder net income / positive revenue |

Percentages are returned in percentage points. P/E, P/B and market-cap inputs affected by a split after the statement date remain unavailable pending updated observations. Unknown dividend event coverage produces null, not a fabricated zero. Reporting dates are shown as period ends, not claimed publication dates; retrieval and quote dates are described separately in the stock detail.

Existing freshness and evidence gates remain in effect. Old statements can remain visible but be excluded from scoring. No indicator weight is relaxed to make incomplete data appear complete. The score remains an uncalibrated research ranking.

## Runtime settings

```text
ENABLE_YAHOO_RESEARCH=true
ENABLE_AUTO_FUNDAMENTALS=true
ENABLE_NEWS_SENTIMENT=true
AUTOMATIC_DATA_ONLY=true
ALLOW_DEMO_FALLBACK=false
```

A licensed `IDX_PROVIDER_URL` retains precedence. Automatic financial enrichment only fills absent fundamentals; it does not override an existing fresh authorized provider layer. Source outages preserve valid price data and identify unavailable financial inputs. Actual foreign buy/sell amounts are never inferred from price-volume proxies.
