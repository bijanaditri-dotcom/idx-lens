import { z } from 'zod';
const finite = z.number().finite();
const iso = z.string().datetime({ offset: true }).refine(v => Date.parse(v) <= Date.now()+300000, 'Future timestamp');
const calendarDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(x => !Number.isNaN(Date.parse(x)) && new Date(x).toISOString().slice(0,10) === x, 'Invalid calendar date');
const day = calendarDay.refine(x => Date.parse(x) <= Date.now()+86400000, 'Future trading date');
export const symbolSchema = z.string().regex(/^[A-Z]{4}$/);
export const stampSchema = z.object({ source: z.string().min(1).max(120), kind: z.enum(['provider','yahoo','rss']), asOf: iso, stale: z.boolean().default(false), delayMinutes: finite.min(0).nullable() });
export const candleSchema = z.object({ time: day, open: finite.positive(), high: finite.positive(), low: finite.positive(), close: finite.positive(), volume: finite.nonnegative() }).refine(c => c.high >= Math.max(c.open,c.close) && c.low <= Math.min(c.open,c.close) && c.high >= c.low, 'Invalid OHLC bounds');
const candlesSchema = z.array(candleSchema).min(2).max(600).refine(a => a.every((c,i) => i===0 || c.time > a[i-1].time), 'Candles must have unique, ascending dates');
export const fundamentalsSchema = z.object({ per: finite.nullable(), pbv: finite.nullable(), roe: finite.nullable(), der: finite.nullable(), dividendYield: finite.nullable(), marketCap: finite.positive().nullable(), revenueGrowth: finite.nullable(), netProfitMargin: finite.nullable() });
const urlSchema = z.string().url().refine(s => { const u = new URL(s); return u.protocol==='https:' && !u.username && !u.password; }, 'HTTPS link required');
export const articleSchema = z.object({ id: z.string().min(1).max(240), title: z.string().min(1).max(500), url: urlSchema.nullable(), publisher: z.string().min(1).max(100), publishedAt: iso, channel: z.enum(['news','social']), sentiment: finite.min(-1).max(1), relevance: z.array(symbolSchema).max(50) });
export const rawStockSchema = z.object({ symbol: symbolSchema, name: z.string().min(1).max(100), sector: z.string().min(1).max(50), candles: candlesSchema, quote: stampSchema,
  fundamentals: fundamentalsSchema.nullable(), fundamentalSource: stampSchema.nullable(),
  foreignFlows: z.array(z.object({ date: day, buy: finite.nonnegative(), sell: finite.nonnegative() })).max(30).refine(a=>a.every((x,i)=>i===0 || x.date>a[i-1].date), 'Flows must have unique ascending dates'), flowSource: stampSchema.nullable(),
  articles: z.array(articleSchema).max(100), sentimentSource: stampSchema.nullable(),
}).superRefine((s,ctx)=>{
  if (s.fundamentals && !s.fundamentalSource) ctx.addIssue({code:'custom',message:'Fundamental provenance required'});
  if (s.foreignFlows.length && !s.flowSource) ctx.addIssue({code:'custom',message:'Flow provenance required'});
  if (s.articles.length && !s.sentimentSource) ctx.addIssue({code:'custom',message:'Sentiment provenance required'});
});
export const providerSchema = z.object({ stocks: z.array(rawStockSchema).min(1).max(50).refine(a=>new Set(a.map(s=>s.symbol)).size===a.length, 'Duplicate symbols'), index: z.object({ symbol: z.literal('IHSG'), name: z.string().min(1).max(100), candles: candlesSchema, quote: stampSchema }), holidays: z.array(calendarDay).max(500).optional() });
