import type { IndexData, MarketData, RawStock, Stamp } from '../types';
import { demoIndex, demoStocks, DEMO_AS_OF } from '../demo';
import { analyze } from '../analysis/scoring';
import { marketSession } from '../market-hours';
import { licensedProvider, yahooProvider } from './providers';
import { sentimentFeeds } from './sentiment-feeds';
import { enrichAutomaticFundamentals } from './automatic-fundamentals';
import { getFullMarket } from './full-market';

// Isolate-local single-flight cache. Configure shared rate limiting/caching at the edge for public deployment.
let cache: { data: MarketData; expires: number } | null = null;
let inFlight: Promise<MarketData> | null = null;
let calendar: string[] | null = null;
const maxAgeSeconds = (key: string, fallback: number) => { const n=Number(process.env[key]);return Number.isFinite(n)&&n>=60&&n<=86400000?n:fallback; };
function freshStamp(stamp: Stamp | null, maxAge: number): Stamp | null {
  if(!stamp) return null;
  return { ...stamp, stale:stamp.stale || Date.now()-Date.parse(stamp.asOf)>maxAge*1000 };
}
function normalize(stock: RawStock): RawStock {
  const quote=freshStamp(stock.quote,maxAgeSeconds('QUOTE_MAX_AGE_SECONDS',4*86400))!;
  const seen=new Set<string>();
  return { ...stock,quote, fundamentalSource:freshStamp(stock.fundamentalSource,maxAgeSeconds('FUNDAMENTAL_MAX_AGE_SECONDS',180*86400)), flowSource:freshStamp(stock.flowSource,maxAgeSeconds('FLOW_MAX_AGE_SECONDS',4*86400)),sentimentSource:freshStamp(stock.sentimentSource,7*86400),
    articles:stock.articles.filter(a=>{const key=a.title.toLowerCase().replace(/\W/g,'');if(seen.has(key))return false;seen.add(key);return a.relevance.includes(stock.symbol);}),
  };
}
async function load(): Promise<MarketData> {
  const now=new Date(), warnings:string[]=[];
  let raw:RawStock[],index:IndexData,mode:MarketData['mode']='live',holidays:string[]|null=null,provider='Licensed provider';
  try {
    if(process.env.IDX_PROVIDER_URL) {const data=await licensedProvider();raw=data.stocks;index=data.index;holidays=data.holidays??null;}
    else if(process.env.ENABLE_YAHOO_RESEARCH==='true') {const data=await yahooProvider();raw=data.stocks;index=data.index;provider='Yahoo research adapter';warnings.push('Unofficial Yahoo research feeds. Price delay is not guaranteed. Actual foreign trading requires a separate authorized feed.');if(data.failed)warnings.push(`${data.failed} symbols unavailable; omitted from universe.`);}
    else {raw=demoStocks();index=demoIndex();mode='demo';provider='Illustrative dataset';}
  }catch {
    if(cache && cache.data.mode!=='demo' && process.env.ALLOW_DEMO_FALLBACK!=='true') {
      const old=cache.data;
      return {...old,fetchedAt:now.toISOString(),session:marketSession(now,calendar),stocks:old.stocks.map(s=>analyze({...s,quote:{...s.quote,stale:true},fundamentalSource:s.fundamentalSource?{...s.fundamentalSource,stale:true}:null,flowSource:s.flowSource?{...s.flowSource,stale:true}:null,sentimentSource:s.sentimentSource?{...s.sentimentSource,stale:true}:null})),index:{...old.index,quote:{...old.index.quote,stale:true}},warnings:['Provider unavailable. Last successful snapshot retained and marked stale; all BUY labels suspended.']};
    }
    if(process.env.ALLOW_DEMO_FALLBACK!=='true') throw new Error('Market upstream unavailable; demo fallback is disabled');
    raw=demoStocks();index=demoIndex();mode='demo';provider='Illustrative fallback';warnings.push('Upstream unavailable. The entire dashboard switched to a labeled illustrative dataset.');
  }
  let sources:MarketData['sources']=[];
  if(mode!=='demo') {
    const [financials,sentiment]=await Promise.allSettled([enrichAutomaticFundamentals(raw),sentimentFeeds(raw)]);
    if(financials.status==='fulfilled'){raw=financials.value.stocks;sources.push(...financials.value.sources);warnings.push(...financials.value.warnings);}else warnings.push('Automatic fundamentals temporarily unavailable; existing public prices retained.');
    if(sentiment.status==='fulfilled'){
      const inputs=sentiment.value;sources.push(...inputs.sources);
      raw=raw.map(s=>{const added=inputs.articles.filter(a=>a.relevance.includes(s.symbol));return added.length?{...s,articles:[...s.articles,...added].slice(-100),sentimentSource:{source:'Configured news/social feeds',kind:'rss',asOf:new Date(Math.max(...added.map(a=>Date.parse(a.publishedAt)))).toISOString(),stale:false,delayMinutes:null}}:s;});
    }else warnings.push('Sentiment sources unavailable; available financial and price data retained.');
  }
  if(mode==='demo') warnings.push('Demo snapshot · 27 Oct 2026. All prices, flows, fundamentals and headlines are illustrative.');
  else {raw=raw.map(normalize);index={...index,quote:freshStamp(index.quote,maxAgeSeconds('QUOTE_MAX_AGE_SECONDS',4*86400))!};}
  calendar=holidays;
  if(!holidays) warnings.push('Market hours are a weekday schedule estimate. Exchange holiday calendar is not connected.');
  return {mode,fetchedAt:now.toISOString(),snapshotAt:mode==='demo'?DEMO_AS_OF:index.quote.asOf,stocks:raw.map(s=>analyze(s,mode==='demo'?new Date(DEMO_AS_OF):now)).sort((a,b)=>(b.overallScore??-1)-(a.overallScore??-1)),index,session:marketSession(now,holidays),warnings,provider,refreshSeconds:60,sources};
}
export async function getMarket(): Promise<MarketData> {
  if(process.env.ENABLE_FULL_UNIVERSE==='true')return getFullMarket();
  if(cache && cache.expires>Date.now()) return {...cache.data,session:marketSession(new Date(),calendar)};
  if(inFlight) return inFlight;
  inFlight=load().then(data=>{cache={data,expires:Date.now()+55_000};return data;}).finally(()=>{inFlight=null;});
  return inFlight;
}
