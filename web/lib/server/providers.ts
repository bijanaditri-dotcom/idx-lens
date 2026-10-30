import { z } from 'zod';
import type { Article, Candle, RawStock, Stamp } from '../types';
import { UNIVERSE } from '../demo';
import { jsonUpstream } from './http';
import { candleSchema, providerSchema } from './schema';

export async function licensedProvider() {
  const url = process.env.IDX_PROVIDER_URL;
  if (!url) throw new Error('No licensed provider configured');
  const headers: Record<string,string> = process.env.IDX_PROVIDER_TOKEN ? { Authorization: `Bearer ${process.env.IDX_PROVIDER_TOKEN}` } : {};
  return providerSchema.parse(await jsonUpstream(url,{headers}));
}
const yahooSchema = z.object({ chart: z.object({ result: z.array(z.object({ meta: z.object({ regularMarketTime: z.number(), regularMarketPrice: z.number().optional(), exchangeDataDelayedBy: z.number().optional() }).passthrough(), timestamp: z.array(z.number()), events:z.object({dividends:z.record(z.object({date:z.number(),amount:z.number().finite().nonnegative()})).optional(),splits:z.record(z.object({date:z.number(),numerator:z.number().positive(),denominator:z.number().positive()})).optional()}).optional(), indicators: z.object({ quote: z.array(z.object({ open:z.array(z.number().nullable()),high:z.array(z.number().nullable()),low:z.array(z.number().nullable()),close:z.array(z.number().nullable()),volume:z.array(z.number().nullable()) })) }) })).nullable(), error: z.unknown().nullable() }) });
export async function yahooHistory(symbol: string) {
  // Unofficial personal/research adapter; opt-in only. Never sends Yahoo/Stockbit cookies.
  const data = yahooSchema.parse(await jsonUpstream(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=2y&interval=1d&events=div%2Csplits`,{headers:{'User-Agent':'IDX-Lens-Research/1.0'}}));
  const result = data.chart.result?.[0]; if (!result || data.chart.error) throw new Error('Yahoo chart unavailable');
  const quote = result.indicators.quote[0]; if (!quote) throw new Error('Yahoo OHLC missing');
  const candles: Candle[] = [];
  for (let n=0;n<result.timestamp.length;n++) {
    const candidate = { time: new Date(result.timestamp[n]*1000).toISOString().slice(0,10), open:quote.open[n], high:quote.high[n], low:quote.low[n], close:quote.close[n], volume:quote.volume[n]??0 };
    const parsed = candleSchema.safeParse(candidate); if(parsed.success && (!candles.length || parsed.data.time>candles.at(-1)!.time)) candles.push(parsed.data);
  }
  if(candles.length<2) throw new Error('Yahoo history is insufficient');
  const stamp: Stamp = { source:'Yahoo chart · unofficial', kind:'yahoo', asOf:new Date(result.meta.regularMarketTime*1000).toISOString(), stale:false, delayMinutes:result.meta.exchangeDataDelayedBy ?? null };
  const corporateActions={dividendsComplete:!!result.events,dividends:Object.values(result.events?.dividends??{}).map(d=>({date:new Date(d.date*1000).toISOString(),amount:d.amount})),splits:Object.values(result.events?.splits??{}).map(d=>({date:new Date(d.date*1000).toISOString(),numerator:d.numerator,denominator:d.denominator}))};
  return { candles: candles.slice(-550), quote:stamp,corporateActions };
}
export async function yahooProvider() {
  const settled = await Promise.allSettled(UNIVERSE.map(async ([symbol,name,sector]) => {
    const history=await yahooHistory(`${symbol}.JK`);
    return { symbol,name,sector,...history, fundamentals:null, fundamentalSource:null, foreignFlows:[],flowSource:null,articles:[],sentimentSource:null } satisfies RawStock;
  }));
  const stocks = settled.flatMap(r=>r.status==='fulfilled'?[r.value]:[]);
  if(!stocks.length) {
    const failure=settled.find(r=>r.status==='rejected');
    const reason=failure?.status==='rejected' && failure.reason instanceof Error ? failure.reason.message.slice(0,240) : 'Unknown chart failure';
    console.warn('IDX_YAHOO_UNAVAILABLE', {failed:settled.length,reason});
    throw new Error('Yahoo could not load any symbols');
  }
  const index = {symbol:'IHSG' as const,name:'Jakarta Composite Index',...await yahooHistory('^JKSE')};
  return {stocks,index,failed:settled.filter(r=>r.status==='rejected').length};
}
export { newsFromRss } from './sentiment-feeds';
