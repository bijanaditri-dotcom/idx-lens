import type { Candle, Indicators } from '../types';

export const clamp = (x: number, min = 0, max = 100) => Math.min(max, Math.max(min, x));
export const last = <T,>(values: T[]): T | undefined => values.at(-1);
export const sma = (values: number[], period: number): number | null => values.length < period ? null : values.slice(-period).reduce((a, b) => a + b, 0) / period;

/** SMA-seeded EMA, aligned to the original input; unavailable warm-up values stay null. */
export function emaSeries(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = Array(values.length).fill(null);
  if (values.length < period) return out;
  let value = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = value;
  const alpha = 2 / (period + 1);
  for (let i = period; i < values.length; i++) { value = values[i] * alpha + value * (1 - alpha); out[i] = value; }
  return out;
}

/** Wilder RSI(14); a flat sequence is 50, only gains is 100, only losses is 0. */
export function rsi(values: number[], period = 14): number | null {
  if (values.length <= period) return null;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) { const d = values[i] - values[i - 1]; gain += Math.max(d, 0); loss += Math.max(-d, 0); }
  gain /= period; loss /= period;
  for (let i = period + 1; i < values.length; i++) { const d = values[i] - values[i - 1]; gain = (gain * (period - 1) + Math.max(d, 0)) / period; loss = (loss * (period - 1) + Math.max(-d, 0)) / period; }
  if (gain === 0 && loss === 0) return 50;
  return loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
}

export function macd(values: number[]) {
  const fast = emaSeries(values, 12), slow = emaSeries(values, 26);
  const series = values.map((_, i) => fast[i] !== null && slow[i] !== null ? fast[i]! - slow[i]! : null);
  const valid = series.filter((x): x is number => x !== null);
  const signals = emaSeries(valid, 9);
  const value = last(valid) ?? null, signal = last(signals) ?? null;
  return { value, signal, histogram: value !== null && signal !== null ? value - signal : null, previousHistogram: valid.length >= 10 && signals.at(-2) != null ? valid.at(-2)! - signals.at(-2)! : null };
}

export function chaikinMoneyFlow(candles: Candle[], period = 20): number | null {
  if (candles.length < period) return null;
  const rows = candles.slice(-period), volume = rows.reduce((sum, c) => sum + c.volume, 0);
  if (volume === 0) return null;
  return rows.reduce((sum, c) => sum + (c.high === c.low ? 0 : ((c.close - c.low) - (c.high - c.close)) / (c.high - c.low)) * c.volume, 0) / volume;
}

export function indicators(candles: Candle[]): Indicators {
  const prices = candles.map(c => c.close), price = last(prices), currentRsi = rsi(prices);
  const e20 = emaSeries(prices, 20), e50 = emaSeries(prices, 50), e200 = sma(prices, 200);
  const ema20 = last(e20) ?? null, ema50 = last(e50) ?? null, m = macd(prices);
  const previousRsi = rsi(prices.slice(0, -1)), previousSma200 = sma(prices.slice(0, -1), 200);
  const sma50 = sma(prices, 50), previousSma50 = sma(prices.slice(0, -1), 50);
  const signals: string[] = [];
  if (previousRsi !== null && currentRsi !== null && previousRsi < 30 && currentRsi >= 30) signals.push('RSI recovery · BUY');
  else if (currentRsi !== null && currentRsi < 30) signals.push('RSI oversold · WATCH');
  if (previousRsi !== null && currentRsi !== null && previousRsi > 70 && currentRsi <= 70) signals.push('RSI reversal · SELL');
  if (m.histogram !== null && m.previousHistogram !== null) {
    if (m.previousHistogram <= 0 && m.histogram > 0) signals.push('MACD crossover · BUY');
    if (m.previousHistogram >= 0 && m.histogram < 0) signals.push('MACD crossover · SELL');
  }
  if (sma50 !== null && e200 !== null && previousSma50 !== null && previousSma200 !== null) {
    if (previousSma50 <= previousSma200 && sma50 > e200) signals.push('Golden cross · BUY');
    if (previousSma50 >= previousSma200 && sma50 < e200) signals.push('Death cross · SELL');
  }
  if (ema20 !== null && ema50 !== null && e20.at(-2) != null && e50.at(-2) != null && e20.at(-2)! <= e50.at(-2)! && ema20 > ema50) signals.push('EMA 20/50 crossover · BUY');
  if (ema20 !== null && ema50 !== null && e20.at(-2) != null && e50.at(-2) != null && e20.at(-2)! >= e50.at(-2)! && ema20 < ema50) signals.push('EMA 20/50 crossover · SELL');
  const prior = candles.slice(-21, -1), baseline = candles.slice(-21, -1);
  const averageVolume = baseline.length === 20 ? baseline.reduce((s, c) => s + c.volume, 0) / 20 : 0;
  return {
    rsi: currentRsi, macd: m.value, macdSignal: m.signal, histogram: m.histogram, ema20, ema50, sma200: e200,
    support: prior.length === 20 ? Math.min(...prior.map(c => c.low)) : null,
    resistance: prior.length === 20 ? Math.max(...prior.map(c => c.high)) : null,
    cmf: chaikinMoneyFlow(candles), relativeVolume: averageVolume > 0 ? last(candles)!.volume / averageVolume : null,
    trend: price != null && ema20 !== null && ema50 !== null && e200 !== null ? (price > ema20 && ema20 > ema50 && ema50 > e200 ? 'Bullish' : price < ema20 && ema20 < ema50 && ema50 < e200 ? 'Bearish' : 'Mixed') : 'Mixed', signals,
  };
}
