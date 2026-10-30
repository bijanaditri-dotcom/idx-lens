# Exchange-wide public research

The hosted dashboard uses `ENABLE_FULL_UNIVERSE=true`, `ENABLE_AUTO_FUNDAMENTALS=true`, `ENABLE_NEWS_SENTIMENT=true`, `ENABLE_YAHOO_RESEARCH=true`, `AUTOMATIC_DATA_ONLY=true`, and `ALLOW_DEMO_FALLBACK=false`.

## Coverage and provenance

The catalog refreshes the public KSEI local-company share register daily. Its bundled recovery snapshot was retrieved on 28 October 2026 and contains 979 unique four-letter company share codes. Four longer special-share codes in the register are excluded. This is a registered-security catalog: it is not an independently verified current IDX listing list or IHSG constituent list. Delisted, suspended, inactive and unpriced codes are retained with explicit missing/stale status. The official IDX stock-list endpoint did not permit access from the research environment; the app does not claim that KSEI registration resolves exchange eligibility.

Source: https://web.ksei.co.id/services/registered-securities/shares

Each daily scan claims at most eight due issuers, with four concurrent issuer fetches. Atomic D1 leases prevent overlapping batches from selecting the same record. Full public price histories and available reported financials are persisted per issuer. Summary responses contain only the last 32 bars; technical indicators were computed on the full history and are preserved when refreshing summary scores. Clicking a ticker fetches its full detail, with a one-minute minimum between issuer refresh attempts. Missing observations never become mock prices or neutral ratios.

A complete initial scan attempts every catalog entry; success is counted separately. Source failures retain older observations and suspend BUY labels. Ordinary failures retry after six hours. A source HTTP 429 pauses the scan globally in D1 for the provider's retry window, with a one-hour fallback. Page visibility does not bypass that pause. Daily recurrence and the foreground resumable scan use the same writer.

## Financial statements

See AUTOMATIC_DATA.md for the ratio definitions. Both IDR and USD statements are accepted. Income, revenue, EPS, prior-period revenue and equity comparisons must use compatible currencies and periods. ROE, NPM, DER and growth use consistent reporting currencies. USD P/E and P/B require a positive, dated USD/IDR observation no older than four days; without it those fields remain missing. Market cap is calculated from the last reported ordinary share count, not independently supplied by the exchange.

## Open publication sentiment

Publisher RSS feeds: Stockbit Snips, ANTARA Bursa, ANTARA Finansial, ANTARA Bisnis, CNBC Indonesia Market, Detik Finance and Stockwatch. No Stockbit account, private stream, X account, CSV or manual text entry is required. Individual publishers can be unavailable independently. A source card reports status, observed matching item count and retrieval time.

Only headline text, original links, publisher names and timestamps are retained. The dashboard does not crawl paywalled bodies or copy full articles. Matching uses registry names, known issuer aliases and explicit codes; common words such as DATA and BANK need an explicit ticker context. Broad roundups mentioning more than three issuers are excluded. Headline and URL deduplication limit syndicated repetitions. The shared cache retains up to 1,000 matched headlines per feed for seven days; this archive starts accumulating when the connector is first used, not retroactively.

Sentiment remains a bilingual headline lexicon with a 72-hour decay. Financial subjects such as profit/laba and debt are neutral by themselves; direction and common adverse events (including data breaches) determine polarity. Archived headlines are rescored with the current rules without another publisher request. Publication and source retrieval labels include their full WIB dates. It does not establish factual accuracy, event impact or the opinion of all market participants. No relevant publication means unavailable sentiment, not a neutral score.

## Daily shortlist

The original four-layer BUY score and 80% coverage gates are unchanged. Daily research candidates additionally require a fresh quote, complete technical coverage, fundamental coverage of at least 80%, fundamental score at least 50, overall score at least 65 and 20-session mean close-times-volume of at least IDR 1 billion. Turnover is an approximation from daily bars. Incomplete candidates are visibly labelled research candidates and never upgraded to BUY. The top ten are ranked with genuine BUY labels first, then score and evidence coverage. No daily pick is forced.

## Endpoints and unattended updates

- GET /api/market: registered catalog, compact available snapshots, progress, public-source status, daily shortlist.
- GET /api/market?symbol=CODE: full observed detail as `{stock}` for a registered four-letter symbol.
- POST /api/research/run with `{limit:8}`: refresh one resumable batch; returns `remaining`, `rateLimited`, `retryAfterSeconds` and per-symbol results.
- GET /api/research/daily: read back the latest persisted report.
- POST /api/research/daily: reassess with current open headlines and persist the dated daily report.
- GET /api/research/instructions: credential-free updater procedure.
- POST /mcp: stateless MCP discovery, `research_status`, `refresh_equity_batch`, `save_daily_research`.

All hosted routes keep the existing owner-private Sites access boundary. Browser writes require a matching Origin; supported service callers use the existing Sites service access and do not receive a visitor identity. Do not make these writers public without adding their own authorization. Daily snapshots are stored in D1, and shared records contain public market observations only; old per-user imports remain isolated and unused in automatic mode.

## Running

Full-universe mode requires the D1 binding; plain Next development without that binding should leave the flag false. For the supported Worker target, build, apply pending local migrations to `.wrangler/state` using the documented Sites D1 command, configure local `.dev.vars` flags, and use the managed preview. Hosting applies the committed schema migrations. A saved cloud schedule runs the same verified updater while the page is closed; foreground polling alone is not unattended scheduling.
