import type { Article, Candle, IndexData, RawStock, Stamp } from './types';
export const DEMO_AS_OF = '2026-10-27T08:00:00.000Z';
const stamp = (source: string): Stamp => ({ source, kind: 'demo', asOf: DEMO_AS_OF, stale: false, delayMinutes: null });
export const UNIVERSE = [
  ['BBCA','Bank Central Asia','Financials',9450], ['BBRI','Bank Rakyat Indonesia','Financials',4250],
  ['BMRI','Bank Mandiri','Financials',5975], ['TLKM','Telkom Indonesia','Telecommunications',2940],
  ['ASII','Astra International','Industrials',5125], ['ANTM','Aneka Tambang','Materials',1780],
  ['ICBP','Indofood CBP','Consumer staples',11325], ['PTBA','Bukit Asam','Energy',2850],
  ['BBNI','Bank Negara Indonesia','Financials',4820], ['INDF','Indofood Sukses Makmur','Consumer staples',7350],
  ['GOTO','GoTo Gojek Tokopedia','Technology',68], ['UNTR','United Tractors','Industrials',26850],
] as const;
const round = (n: number) => Math.round(n * 100) / 100;
export function demoCandles(end: number, seed = 0, count = 280): Candle[] {
  const dates: string[] = [], day = new Date('2026-10-27T00:00:00Z');
  while (dates.length < count) { if (![0, 6].includes(day.getUTCDay())) dates.unshift(day.toISOString().slice(0, 10)); day.setUTCDate(day.getUTCDate() - 1); }
  const rising = ![7,10].includes(seed), drift = rising ? 0.00085 : -0.00045;
  const series = dates.map((_, i) => Math.exp(drift * i + Math.sin(i * 0.17 + seed) * 0.016 + Math.sin(i * 0.51 + seed * 2) * 0.007));
  const scale = end / series.at(-1)!;
  return dates.map((time, i) => {
    const close = round(series[i] * scale), open = round((i ? series[i-1] : series[i]) * scale);
    const range = end * (0.004 + (Math.sin(i * 0.4 + seed) + 1) * 0.003);
    const bias = rising ? 0.68 : 0.30;
    return { time, open, close, high: round(Math.max(open, close) + range * (1-bias)), low: round(Math.min(open, close) - range * bias), volume: Math.round((15e6 + seed * 6e6) * (1 + 0.4 * Math.sin(i * 1.7 + seed)) + (i === dates.length-1 ? 14e6 : 0)) };
  });
}
export function demoArticles(symbol: string, index: number): Article[] {
  const headlines = [
    `${symbol} reports strong profit growth as margins improve`,
    `${symbol} dividend outlook draws renewed investor interest`,
    `${symbol} expansion plans support a positive earnings outlook`,
    `Analysts review ${symbol} valuation ahead of the next earnings update`,
    `${symbol} records growth despite near-term market risk`,
  ];
  return headlines.map((title, i) => ({ id: `demo-${symbol}-${i}`, title, url: null, publisher: ['Market Wire · Sample','IDX Research · Sample','Investor Daily · Sample'][i%3], publishedAt: new Date(Date.parse(DEMO_AS_OF) - (i * 5 + index + 1) * 3600000).toISOString(), channel: 'news', sentiment: i === 3 ? 0 : i === 4 ? 0.1 : 0.66 - index * 0.025, relevance: [symbol] }));
}
export function demoStocks(): RawStock[] {
  return UNIVERSE.map(([symbol, name, sector, price], i) => {
    const days = demoCandles(price, i), good = ![7,10].includes(i);
    return { symbol, name, sector, candles: days, quote: stamp('Illustrative daily bars'),
      fundamentals: { per: i===10 ? -22 : 9.1 + i * 0.9, pbv: 1.3 + i * 0.13, roe: i===10 ? -11 : 24.8 - i * 0.7, der: sector==='Financials' ? 4.3 : 0.4 + i * 0.08, dividendYield: i===10 ? 0 : 4.8 + i * 0.12, marketCap: price * (3.5e10 + i * 1.1e9), revenueGrowth: i===10 ? 4.1 : 18.1 - i * 0.6, netProfitMargin: sector==='Financials' ? 34.6 - i * 0.5 : i===10 ? -8.4 : 22.4 - i * 0.4 },
      fundamentalSource: stamp('Illustrative financial statements'),
      foreignFlows: days.slice(-5).map((c, j) => { const buy = (110 + i * 19 + j * 11) * 1e9; return { date: c.time, buy, sell: buy * (good ? 0.70 + 0.025*j : 1.34) }; }),
      flowSource: stamp('Illustrative foreign trading'), articles: demoArticles(symbol, i), sentimentSource: stamp('Illustrative headlines — not actual reporting'),
    };
  });
}
export function demoIndex(): IndexData { return { symbol: 'IHSG', name: 'Jakarta Composite Index', candles: demoCandles(7642.84, 16), quote: stamp('Illustrative IHSG') }; }
