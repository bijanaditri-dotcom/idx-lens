# Agreed project sequence

Stage 0 is complete. Continue **1 → 4 → 5 → (2 + 6) → 3 → 7**.
The stage numbers retain the original roadmap labels.

| Stage | Work | Completion evidence |
| --- | --- | --- |
| 0 — complete | Local MySQL, corrected collector, authenticated API. | Six successful syncs, connected health response, six authenticated quotes on 30 October 2026. |
| 1 — current | Clean source, credential exclusions, dependency records, setup guide, verification, GitHub repository. | Local checks, reviewed first commit, push, passing GitHub checks. |
| 4 | Several years of daily stock, IHSG, and selected peer history. | Validated dates, corporate-action handling, missing-data checks, repeatable imports. |
| 5 | XGBoost prototype and simple baselines. | Chronological validation with overlap gaps, untouched holdout, error/direction results. |
| 2 + 6 | Improve UI and add the prediction tab together. | UI displays actual model output, issue/data times, model version, and measured uncertainty. |
| 3 | Public static dashboard through GitHub Pages. | Public URL, working project paths, no client credentials, approved public data. |
| 7 | Reliable scheduled updates. | Logged batch runs, retries, age/status display, repeatable publishing, no overlapping jobs. |

Initial model scope: six starter stocks, IHSG, and a small peer set. Begin with
daily data and a next-five-trading-session return target generated after the
current session closes. Features can include lagged stock/peer/IHSG returns,
volume, volatility, momentum, and relative performance. Every input must have
been available at the forecast's issue time.

Use historical-time splits across all tickers together, compare against a
zero-return baseline, and account for overlapping target windows. Measure
out-of-sample performance before deciding whether forecasts are useful. UI
confidence ranges need measured coverage, and forecasts must not imply
guaranteed outcomes.

The infrastructure target is no additional recurring service charge: local
training/storage first, then a static public dashboard. A cloud job cannot
reach the laptop's `127.0.0.1` database. If daily cloud automation is added,
its inputs must be independently reachable and permitted for that use. The
static website can remain online while the PC is off; its data updates only
when a new snapshot is published. No recurring collector schedule is created
by this Stage 1 kit.
