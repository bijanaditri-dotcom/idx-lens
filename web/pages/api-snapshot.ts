import { z } from 'zod';
import { analyze } from '../lib/analysis/scoring';
import type { MarketData, RawStock, Stamp } from '../lib/types';
import { marketWireSchema } from '../lib/wire-schema';
import { marketSession } from '../lib/market-hours';

const instant = z.string().datetime({ offset: true });
const positive = z.number().finite().positive();
const quote = z.object({
  price: positive, previousClose: positive.nullable(), currency: z.string().max(16).nullable(),
  marketTime: instant, fetchedAt: instant, source: z.string().min(1).max(160),
}).strict();
const bar = z.object({time:z.string().regex(/^\d{4}-\d{2}-\d{2}$/), open:positive, high:positive, low:positive, close:positive, volume:z.number().finite().int().nonnegative()}).strict();
const instrument = z.object({ticker:z.string(),name:z.string().min(1).max(255),quote,dailyBars:z.array(bar).max(600),omittedDailyBars:z.number().int().nonnegative()}).strict();
export const apiExportSchema = z.object({
  schemaVersion:z.literal(1), exportedAt:instant, quoteMaxAgeSeconds:z.number().int().min(60).max(604800),
  stocks:z.array(instrument).min(1).max(50), index:instrument.nullable(),
}).strict();

export function apiSnapshot(input: unknown, now = new Date()): MarketData {
  const source = apiExportSchema.parse(input);
  if(Date.parse(source.exportedAt)>now.getTime()+300000)throw new Error('Future export timestamp');
  const seen = new Set<string>();
  function stamp(record: z.infer<typeof instrument>): Stamp {
    const observed = Date.parse(record.quote.marketTime), fetched = Date.parse(record.quote.fetchedAt);
    if(observed>fetched+300000 || observed>now.getTime()+300000 || fetched>now.getTime()+300000)throw new Error('Inconsistent or future quote timestamps');
    return {source:record.quote.source,kind:record.quote.source.toLowerCase().includes('yahoo')?'yahoo':'provider',asOf:record.quote.marketTime,stale:now.getTime()-observed>source.quoteMaxAgeSeconds*1000,delayMinutes:null};
  }
  function history(record: z.infer<typeof instrument>) {
    const dates = new Set<string>();
    for(const row of record.dailyBars){
      const parsed=new Date(`${row.time}T00:00:00Z`);
      if(!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10)!==row.time || row.time>new Date(now.getTime()+7*3600000).toISOString().slice(0,10) || dates.has(row.time) || row.low>Math.min(row.open,row.close) || row.high<Math.max(row.open,row.close))throw new Error('Invalid daily history');
      dates.add(row.time);
    }
    return [...record.dailyBars].sort((a,b)=>a.time.localeCompare(b.time));
  }
  const stocks = source.stocks.map(record => {
    if(!/^[A-Z]{4}\.JK$/.test(record.ticker) || seen.has(record.ticker) || record.quote.currency!=='IDR')throw new Error('Invalid/duplicate stock ticker or non-IDR stock price');
    seen.add(record.ticker);
    const raw: RawStock = {
      symbol:record.ticker.slice(0,-3), name:record.name, sector:'Not supplied',
      candles:history(record), quote:stamp(record), fundamentals:null, fundamentalSource:null,
      foreignFlows:[], flowSource:null, articles:[], sentimentSource:null,
    };
    const stock = analyze(raw, now), previous = record.quote.previousClose;
    // A current quote is separate from the last available daily candle.
    return {...stock,price:record.quote.price,change:previous===null?null:record.quote.price-previous,
      changePercent:previous===null?null:(record.quote.price/previous-1)*100,
      recommendation:'INCOMPLETE' as const};
  });
  const observations = source.stocks.map(record=>record.quote.marketTime);
  const fetches = source.stocks.map(record=>record.quote.fetchedAt);
  if(source.index){
    if(source.index.ticker!=='^JKSE')throw new Error('Invalid IHSG ticker');
    observations.push(source.index.quote.marketTime);fetches.push(source.index.quote.fetchedAt);
  }
  const latest = (values:string[]) => values.reduce((a,b)=>Date.parse(a)>Date.parse(b)?a:b);
  const snapshotAt = latest(observations);
  const index = source.index
    ? {symbol:'IHSG',name:'Jakarta Composite Index',candles:history(source.index),quote:stamp(source.index),price:source.index.quote.price,previousClose:source.index.quote.previousClose}
    : {symbol:'IHSG',name:'Jakarta Composite Index',candles:[],quote:{source:'IHSG has not been collected',kind:'unavailable' as const,asOf:snapshotAt,stale:true,delayMinutes:null}};
  const warnings = [
    'Published observations from the private API; this page is not a streaming feed. Provider delay is unknown.',
    'Fundamentals, foreign trading and news are not supplied by this quote export. Recommendations remain incomplete.',
    'Technical indicators use available daily bars only; minute bars are not substituted for daily history.',
    'Market hours are a weekday estimate; the exchange holiday calendar is not connected.',
    `Snapshot exported ${source.exportedAt}. Source observation time and collection time are separate.`,
  ];
  if(!source.index)warnings.push('IHSG is unavailable until an index observation is collected.');
  if(stocks.some(stock=>stock.candles.length===0))warnings.push('Some stocks have no daily history yet; their charts and daily indicators remain unavailable.');
  if(stocks.some(stock=>stock.quote.stale))warnings.push('Some source observations exceed the configured age limit. They remain visible with their original timestamps.');
  if(source.stocks.some(stock=>stock.omittedDailyBars>0))warnings.push('Incomplete or invalid daily OHLCV rows were omitted; no values were imputed.');
  const result: MarketData = {
    mode:'live',fetchedAt:latest(fetches),snapshotAt,quoteMaxAgeSeconds:source.quoteMaxAgeSeconds,
    stocks,index,provider:'Published MySQL / private API snapshot',refreshSeconds:60,
    session:marketSession(now),
    warnings,sources:[{id:'private-api-export',name:'Local API observations',platform:'market',status:'active',itemCount:stocks.length,checkedAt:source.exportedAt,detail:'Whitelisted quote and daily-bar observations exported locally. Database credentials and the API token are not part of this snapshot.'}],
  };
  return marketWireSchema.parse(result) as MarketData;
}
