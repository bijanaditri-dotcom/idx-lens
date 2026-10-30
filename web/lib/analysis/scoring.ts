import type { Fundamentals, Indicators, Layer, RawStock, Stock } from '../types';
import { clamp, indicators, last } from './indicators';
export const WEIGHTS = { fundamental: 0.30, technical: 0.35, flow: 0.20, sentiment: 0.15 } as const;
const valid = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
export const up = (x: number, low: number, high: number) => clamp((x - low) / (high - low) * 100);
const down = (x: number, low: number, high: number) => 100 - up(x, low, high);
const missing = (note: string): Layer => ({ score: null, coverage: 0, available: false, note });
function layer(values: [number | null, number][], note: string): Layer {
  const total = values.reduce((s, [, w]) => s + w, 0), used = values.filter(([v]) => v !== null && valid(v));
  const weight = used.reduce((s, [, w]) => s + w, 0);
  return { score: weight ? Math.round(used.reduce((s, [v, w]) => s + clamp(v!) * w, 0) / weight) : null, coverage: total ? weight / total : 0, available: weight > 0, note };
}
/** Explicit, configurable heuristics. Financial-sector debt/equity is excluded. */
export function fundamentalScore(f: Fundamentals | null, sector: string): Layer {
  if (!f) return missing('Fundamental feed unavailable');
  const bank = sector === 'Financials';
  const values: [number | null, number][] = [
    [valid(f.per) ? f.per <= 0 ? 0 : down(f.per, 8, 30) : null, 20],
    [valid(f.pbv) ? f.pbv <= 0 ? 0 : down(f.pbv, 1, bank ? 5 : 4) : null, 15],
    [valid(f.roe) ? up(f.roe, 0, 25) : null, 20],
    [valid(f.dividendYield) ? up(f.dividendYield, 0, 7) : null, 10],
    [valid(f.revenueGrowth) ? up(f.revenueGrowth, -10, 20) : null, 15],
    [valid(f.netProfitMargin) ? up(f.netProfitMargin, 0, bank ? 40 : 25) : null, 10],
  ];
  if (!bank) values.push([valid(f.der) ? f.der < 0 ? 0 : down(f.der, 0.3, 2) : null, 10]);
  return layer(values, bank ? 'Sector-aware heuristic; bank DER excluded. Market cap is descriptive.' : 'Valuation and health heuristic; market cap is descriptive.');
}
export function analyze(stock: RawStock, now = new Date()): Stock {
  return scoreWithIndicators(stock,indicators(stock.candles),now);
}
/** Reassess a compact persisted snapshot without recalculating indicators from truncated bars. */
export function scoreWithIndicators(stock:RawStock,i:Indicators,now=new Date()):Stock {
  const data = stock.candles, current = last(data), previous = data.at(-2);
  const price = current?.close ?? null, change = current && previous ? current.close - previous.close : null;
  const f = stock.fundamentalSource?.stale ? missing('Fundamental data is stale') : fundamentalScore(stock.fundamentals, stock.sector);
  let rsiScore: number | null = null;
  if (i.rsi !== null) rsiScore = i.rsi < 30 ? 60 : i.rsi < 45 ? 75 : i.rsi <= 65 ? 90 : i.rsi <= 70 ? 60 : 25;
  const t = stock.quote.stale ? missing('Price history is stale') : layer([
    [rsiScore, 25],
    [i.histogram === null ? null : i.histogram > 0 ? 85 : i.histogram < 0 ? 25 : 50, 25],
    [price !== null && i.ema20 !== null && i.ema50 !== null && i.sma200 !== null ? (Number(price > i.ema20) + Number(i.ema20 > i.ema50) + Number(i.ema50 > i.sma200)) / 3 * 100 : null, 35],
    [i.relativeVolume !== null && change !== null ? change > 0 ? up(i.relativeVolume, 0.5, 2) : change < 0 ? down(i.relativeVolume, 0.5, 2) : 50 : null, 15],
  ], 'Daily bars; momentum, trend and relative volume. Intraday bars may be incomplete.');
  const flows = stock.flowSource && !stock.flowSource.stale ? stock.foreignFlows.filter(f=>stock.candles.slice(-5).some(c=>c.time===f.date)).slice(-5) : [];
  const net = flows.map(x => x.buy - x.sell), gross = flows.reduce((s, x) => s + x.buy + x.sell, 0);
  const foreignDaily = flows.length ? last(net)! : null, foreignWeekly = flows.length === 5 ? net.reduce((a, b) => a + b, 0) : null;
  const foreignRatio = gross > 0 && flows.length === 5 ? net.reduce((a, b) => a + b, 0) / gross : null;
  const flow = layer([[foreignRatio !== null ? up(foreignRatio, -0.15, 0.15) : null, 60], [i.cmf !== null && !stock.quote.stale ? up(i.cmf, -0.25, 0.25) : null, 40]], '60% actual five-session foreign flow; 40% CMF price-volume proxy. Proxy alone cannot verify bandar activity.');
  const articles = stock.sentimentSource && !stock.sentimentSource.stale ? stock.articles.filter(a => now.getTime() - Date.parse(a.publishedAt) <= 7 * 86400000 && Date.parse(a.publishedAt) <= now.getTime()) : [];
  let sentiment = missing('No relevant news/social items within seven days');
  if (articles.length) {
    const weighted = articles.map(a => ({ score: a.sentiment, weight: Math.exp(-(now.getTime() - Date.parse(a.publishedAt)) / (72 * 3600000)) }));
    const polarity = weighted.reduce((s, a) => s + a.score * a.weight, 0) / weighted.reduce((s, a) => s + a.weight, 0);
    sentiment = { score: Math.round(50 + clamp(polarity, -1, 1) * 50), coverage: Math.min(articles.length / 5, 1), available: true, note: `${articles.length} unique items; 72h decay; bilingual lexicon, not a calibrated language model.` };
  }
  const layers = { fundamental: f, technical: t, flow, sentiment };
  const coverage = Object.entries(WEIGHTS).reduce((sum, [k, weight]) => sum + layers[k as keyof typeof layers].coverage * weight, 0);
  // Available evidence weights are renormalized; an independent coverage gate suppresses incomplete BUY labels.
  const usedWeight = Object.entries(WEIGHTS).reduce((sum, [k, w]) => sum + (layers[k as keyof typeof layers].score === null ? 0 : w * layers[k as keyof typeof layers].coverage), 0);
  const score = usedWeight ? Math.round(Object.entries(WEIGHTS).reduce((sum, [k, w]) => { const l = layers[k as keyof typeof layers]; return sum + (l.score ?? 0) * w * l.coverage; }, 0) / usedWeight) : null;
  const recommendation = score === null || coverage < 0.8 || stock.quote.stale || t.coverage < 1 || f.coverage < 0.8 ? 'INCOMPLETE' : score >= 75 && f.score! >= 50 ? 'BUY' : score >= 50 ? 'WATCH' : 'AVOID';
  return { ...stock, price, change, changePercent: change !== null && previous?.close ? change / previous.close * 100 : null, indicators: i, layers, overallScore: score, coverage, recommendation, foreignDaily, foreignWeekly,
    bandar: flows.length !== 5 || flow.coverage < 1 ? 'Unavailable' : flow.score! >= 65 ? 'Accumulation' : flow.score! <= 35 ? 'Distribution' : 'Neutral',
    sentimentLabel: sentiment.score === null ? 'Unavailable' : sentiment.score > 60 ? 'Positive' : sentiment.score < 40 ? 'Negative' : 'Neutral',
  };
}
