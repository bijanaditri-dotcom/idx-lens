# Four-layer research score

This is an auditable heuristic, not a forecast probability or a backtested trading model. All sub-scores are clamped to 0–100; all missing values remain null.

Let `up(x,a,b) = 100 × clamp((x−a)/(b−a),0,1)` and `down = 100 − up`.

## 1. Fundamentals — 30% overall weight

| Input | Sub-weight | Score rule |
| --- | ---: | --- |
| PER | 20 | `down(PER,8,30)`; zero if PER ≤0 |
| PBV | 15 | `down(PBV,1,4)`; Financials use upper bound 5; zero if PBV ≤0 |
| ROE % | 20 | `up(ROE,0,25)` |
| DER | 10 | `down(DER,0.3,2)`; zero if DER <0; excluded for Financials |
| Dividend yield % | 10 | `up(yield,0,7)` |
| Revenue growth % | 15 | `up(growth,−10,20)` |
| Net profit margin % | 10 | `up(margin,0,25)`; Financials use upper bound 40 |
| Market capitalization | Descriptive | Displayed, excluded from health score |

The layer is the sub-weighted mean of available inputs. Coverage is available sub-weight divided by applicable sub-weight. Financials have 90 applicable points after DER exclusion and use a bank-style template. Refine the taxonomy for insurers and other financial industries before live use. Growth, margin and valuation cutoffs are configurable code assumptions, not empirical sector percentiles. Financial-statement `asOf` is the statement publication/observation time, not the HTTP fetch time. No stale financials receive score credit.

## 2. Technicals — 35%

| Component | Sub-weight | Rule |
| --- | ---: | --- |
| RSI (14), Wilder smoothing | 25 | `<30:60; 30–<45:75; 45–65:90; >65–70:60; >70:25` |
| MACD histogram | 25 | `>0:85; <0:25; =0:50` |
| Moving-average alignment | 35 | `100/3 × [close>EMA20 + EMA20>EMA50 + EMA50>SMA200]` |
| Relative volume | 15 | Latest volume / prior 20-session mean. Up day: `up(rvol,0.5,2)`; down day: `down(rvol,0.5,2)`; flat day:50 |

RSI seeds its 14 initial gains/losses with their mean, then uses Wilder recurrence. A flat sequence returns 50; only gains returns 100; only losses returns 0. EMAs seed with an SMA and use alpha `2/(period+1)`. MACD = EMA12−EMA26; its signal is EMA9 of valid MACD values. Warm-up values remain unavailable. Full technical coverage generally requires 200 daily bars.

Crossing event flags compare the previous and current daily values:

- RSI crosses back above 30: recovery BUY; below 30 alone: oversold WATCH. Cross down through 70: reversal SELL.
- MACD histogram crosses zero: bullish BUY or bearish SELL.
- SMA50 crosses SMA200: golden BUY or death SELL.
- EMA20 crosses EMA50: separately labeled EMA crossover.

Crossing flags explain events; they do not add a hidden bonus to the weighted score. A current daily bar can be provisional. Support = minimum low of the prior 20 sessions; resistance = their maximum high; the current candle is excluded.

## 3. Smart money / bandarmology — 20%

Actual foreign net flow is `foreign buy IDR − foreign sell IDR`. The weekly value is **five trading sessions**, not a calendar-week total. Five actual dated flow rows must align with the last five candle dates. Missing flow is never synthesized from price or volume.

- 60%: `up(Σ(net foreign) / Σ(foreign buy+sell), −0.15,0.15)` over five aligned sessions. Gross zero is unavailable.
- 40%: `up(CMF20, −0.25,0.25)`.

`CMF20 = Σ[volume × ((close−low)−(high−close))/(high−low)] / Σ(volume)`. Zero range contributes zero money-flow volume; zero total volume is unavailable. CMF measures price-volume pressure; it cannot establish participant identity or actual institutional trades.

With full foreign/CMF coverage: score ≥65 = Accumulation, ≤35 = Distribution, otherwise Neutral. Without full evidence the participant rating is Unavailable; the partial layer score and its 40% coverage remain inspectable.

## 4. Sentiment — 15%

The included RSS baseline:

1. Fetches an explicitly configured permitted RSS/Atom feed on the server.
2. Rejects DTDs/entities, unsafe links, invalid/future dates and entries older than 7 days.
3. Matches a standalone IDX ticker or full configured company name in the headline; broad topics are not attributed to every stock.
4. Removes duplicate normalized titles and URLs; tracking parameters are removed in the RSS adapter.
5. Uses a small English/Indonesian positive/negative lexicon with a three-word negation window. `polarity = clamp(sum(signs)/sqrt(number of matches),−1,1)`. No matched words yields neutral polarity 0.
6. Weights item polarity by `exp(−ageHours/72)`; score = `50+50×weighted polarity`.

Provider articles may carry authorized upstream model polarity within −1…1. The UI discloses provenance. Positive >60; Negative <40; otherwise Neutral. Coverage = `min(unique recent item count/5,1)`. No relevant items means unavailable, not an invented score of 50. This simple baseline is not calibrated for Indonesian financial language, sarcasm, ticker ambiguity or bot amplification. Replace it with a validated model and authorized feed for stronger sentiment inference.

Stockbit/X integrations are extension points through the licensed provider contract. No authentication wall, private stream or site is scraped. Sample headlines are invented and cannot be mistaken for clickable journalism.

## Overall score and eligibility

For layer scores `L`, coverage fractions `c`, and weights `w = (0.30,0.35,0.20,0.15)`:

```text
Score = round(Σ(w × c × L) / Σ(w × c))
Evidence coverage = Σ(w × c)
```

Only available layers enter the denominator. If the denominator is zero, score is null. Coverage does not directly multiply the displayed score; it gates the label. This avoids treating missing feeds as either neutral or negative evidence while preventing a high partial-data score from becoming actionable.

For full coverage, `F=80, T=85, B=70, S=60` gives `24+29.75+14+9 = 76.75`, displayed as 77/100. This is a numeric example, not a real stock recommendation.

Labels use the displayed integer score:

- INCOMPLETE if no score, overall coverage <80%, stale quote, technical coverage <100%, or fundamental coverage <80%.
- Otherwise BUY when score ≥75 **and fundamental score ≥50**.
- Otherwise WATCH when score ≥50; AVOID when score <50.

Client connection failure pauses BUY labels even while retaining the last valid chart. SELL event flags are technical events; the aggregate label uses AVOID rather than a personalized instruction to sell.

## Research references

- [TradingView widget data FAQ](https://www.tradingview.com/widget-docs/faq/data/): widgets do not export values to the scoring engine.
- [TradingView exchange coverage](https://www.tradingview.com/data-coverage/): check current IDX delay/entitlements.
- [IDX official trading hours](https://www.idx.id/en/products-services/trading-hours-and-mechanism/): regular continuous sessions and auctions.
- [Fidelity CMF guide](https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/cmf): interpretation of price-volume pressure.
- [yfinance project notice](https://github.com/ranaroussi/yfinance): unofficial Yahoo use and personal/research context. This project uses direct HTTP, not the Python package.

Thresholds and weights above are this project's explicit design choices. They are not endorsed by the cited sources.
