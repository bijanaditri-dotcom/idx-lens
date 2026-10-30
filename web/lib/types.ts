export type SourceKind = 'demo' | 'provider' | 'yahoo' | 'rss' | 'import' | 'unavailable';
export type Stamp = { source: string; kind: SourceKind; asOf: string; stale: boolean; delayMinutes: number | null };
export type Candle = { time: string; open: number; high: number; low: number; close: number; volume: number };
export type Fundamentals = {
  per: number | null; pbv: number | null; roe: number | null; der: number | null;
  dividendYield: number | null; marketCap: number | null; revenueGrowth: number | null; netProfitMargin: number | null;
};
export type ForeignFlow = { date: string; buy: number; sell: number };
export type Article = { id: string; title: string; url: string | null; publisher: string; publishedAt: string; channel: 'news' | 'social'; sentiment: number; relevance: string[] };
export type RawStock = {
  symbol: string; name: string; sector: string; candles: Candle[]; quote: Stamp;
  fundamentals: Fundamentals | null; fundamentalSource: Stamp | null; fundamentalNotes?:string[];
  corporateActions?:{dividendsComplete:boolean;dividends:{date:string;amount:number}[];splits:{date:string;numerator:number;denominator:number}[]};
  foreignFlows: ForeignFlow[]; flowSource: Stamp | null; articles: Article[]; sentimentSource: Stamp | null;
};
export type Layer = { score: number | null; coverage: number; available: boolean; note: string };
export type Indicators = {
  rsi: number | null; macd: number | null; macdSignal: number | null; histogram: number | null;
  ema20: number | null; ema50: number | null; sma200: number | null; support: number | null; resistance: number | null;
  cmf: number | null; relativeVolume: number | null; trend: 'Bullish' | 'Bearish' | 'Mixed'; signals: string[];
};
export type Stock = RawStock & {
  historyTruncated?:boolean; averageTurnover20d?:number|null; scanStatus?:'pending'|'ready'|'error'; scanError?:string|null;
  price: number | null; change: number | null; changePercent: number | null; indicators: Indicators;
  layers: { fundamental: Layer; technical: Layer; flow: Layer; sentiment: Layer };
  overallScore: number | null; coverage: number; recommendation: 'BUY' | 'WATCH' | 'AVOID' | 'INCOMPLETE';
  foreignDaily: number | null; foreignWeekly: number | null; bandar: 'Accumulation' | 'Distribution' | 'Neutral' | 'Unavailable';
  sentimentLabel: 'Positive' | 'Neutral' | 'Negative' | 'Unavailable';
};
export type IndexData = { symbol: string; name: string; candles: Candle[]; quote: Stamp; price?:number|null; previousClose?:number|null };
export type MarketSession = { status: 'OPEN' | 'CLOSED' | 'BREAK'; phase: string; calendarVerified: boolean; timeZone: string };
export type IntegrationSource = { id:string; name:string; platform:'stockbit'|'news'|'x'|'market'; status:'active'|'disabled'|'needs_access'|'error'; itemCount:number; checkedAt:string|null; detail:string };
export type MarketData = {
  mode: 'demo' | 'live' | 'mixed'; fetchedAt: string; snapshotAt: string; stocks: Stock[]; index: IndexData;
  quoteMaxAgeSeconds?: number;
  session: MarketSession; warnings: string[]; provider: string; refreshSeconds: number; sources?:IntegrationSource[];
  universe?:{total:number;scanned:number;attemptedToday:number;successfulToday:number;pending:number;failed:number;due:number;stale:number;registrySource:string;registryUrl:string;registryAsOf:string;listingVerified:boolean;lastScanAt:string|null;nextScanAt:string};
  daily?:{date:string;asOf:string;priced:number;total:number;buys:number;method:string;candidates:{symbol:string;name:string;score:number|null;coverage:number;signal:Stock['recommendation'];averageTurnover20d:number|null;reasons:string[]}[]};
  publications?:Article[];
};
