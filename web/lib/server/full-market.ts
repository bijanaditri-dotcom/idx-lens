import type { Article, IndexData, MarketData, RawStock, Stamp, Stock } from '../types';
import { analyze,scoreWithIndicators } from '../analysis/scoring';
import { marketSession } from '../market-hours';
import { equityRegistry,type EquityEntry,type EquityRegistry } from './universe';
import { UpstreamHttpError } from './http';
import { cachedFeed } from './data-store';
import { claimResearchBatch,researchCooldown,pauseResearch,researchScheduleRows,ensureResearchUniverse,nextResearchDay,researchDay,researchDetail,researchRows,saveDailyResearch,writeResearchResults,type ResearchRow } from './research-store';
import { yahooHistory } from './providers';
import { deriveFundamentals,yahooFinancialSeries,type UsdIdrRate } from './automatic-fundamentals';
import { sentimentFeeds } from './sentiment-feeds';
const age=(key:string,defaultAge:number)=>{const n=Number(process.env[key]);return Number.isFinite(n)&&n>=60?n:defaultAge;};
const fresh=(s:Stamp|null,seconds:number)=>s?{...s,stale:s.stale||Date.now()-Date.parse(s.asOf)>seconds*1000}:null;
function normalize(s:RawStock):RawStock{return {...s,quote:fresh(s.quote,age('QUOTE_MAX_AGE_SECONDS',4*86400))!,fundamentalSource:fresh(s.fundamentalSource,age('FUNDAMENTAL_MAX_AGE_SECONDS',180*86400)),flowSource:fresh(s.flowSource,4*86400),sentimentSource:fresh(s.sentimentSource,7*86400)};}
function blank(e:EquityEntry,asOf:string):RawStock{return {...e,candles:[],quote:{source:'No public price observation available',kind:'unavailable',asOf,stale:true,delayMinutes:null},fundamentals:null,fundamentalSource:null,foreignFlows:[],flowSource:null,articles:[],sentimentSource:null};}
function withNews(s:RawStock,articles:Article[]):RawStock{const relevant=articles.filter(a=>a.relevance.includes(s.symbol)).slice(0,100);return {...s,articles:relevant,sentimentSource:relevant.length?{source:'Open publication RSS headlines',kind:'rss',asOf:new Date(Math.max(...relevant.map(a=>Date.parse(a.publishedAt)))).toISOString(),stale:false,delayMinutes:null}:null};}
export function reassessSummary(stock:Stock,articles:Article[],now=new Date()):Stock{return {...scoreWithIndicators(normalize(withNews(stock,articles)),stock.indicators,now),historyTruncated:stock.historyTruncated,averageTurnover20d:stock.averageTurnover20d,scanStatus:stock.scanStatus};}
export function dailyShortlist(stocks:Stock[],now=new Date()){
  const priced=stocks.filter(s=>s.price!==null),eligible=priced.filter(s=>!s.quote.stale&&s.layers.technical.coverage===1&&s.layers.fundamental.coverage>=.8&&(s.layers.fundamental.score??0)>=50&&(s.overallScore??0)>=65&&(s.averageTurnover20d??0)>=1e9);
  const candidates=eligible.sort((a,b)=>Number(b.recommendation==='BUY')-Number(a.recommendation==='BUY')||(b.overallScore??0)-(a.overallScore??0)||b.coverage-a.coverage).slice(0,10).map(s=>({symbol:s.symbol,name:s.name,score:s.overallScore,coverage:s.coverage,signal:s.recommendation,averageTurnover20d:s.averageTurnover20d??null,reasons:[`Technical ${s.layers.technical.score}/100 · fundamental ${s.layers.fundamental.score}/100`,`${Math.round(s.coverage*100)}% evidence coverage`,...(s.indicators.signals.slice(0,2)),...(s.recommendation==='INCOMPLETE'?['Research candidate only; the four-layer BUY coverage gate is not met.']:[])]}));
  return {date:researchDay(now),asOf:now.toISOString(),priced:priced.length,total:stocks.length,buys:stocks.filter(s=>s.recommendation==='BUY').length,candidates,method:'Candidates: score ≥65, fresh quote, full technical coverage, fundamental coverage ≥80% and score ≥50, 20-session mean turnover ≥IDR 1 billion. BUY still requires the unchanged four-layer gates. No candidate is required on any day.'};
}
let memory:{expires:number;data:MarketData}|null=null;
let pending:Promise<MarketData>|null=null;
export function invalidateFullMarket(){memory=null;}
export async function getFullMarket():Promise<MarketData>{
  if(memory&&memory.expires>Date.now())return {...memory.data,session:marketSession(new Date(),null)};
  if(pending)return pending;
  pending=loadFullMarket().then(data=>{memory={data,expires:Date.now()+20000};return data;}).finally(()=>{pending=null;});return pending;
}
async function loadFullMarket():Promise<MarketData>{
  const now=new Date(),registry=await equityRegistry();await ensureResearchUniverse(registry);
  const [rows,feeds,indexResult]=await Promise.all([researchRows(),sentimentFeeds(registry.entries),cachedFeed('ihsg-public-index-v2',60000,async()=>({symbol:'IHSG',name:'Jakarta Composite Index',...await yahooHistory('^JKSE')}) as IndexData).catch(()=>({value:{symbol:'IHSG',name:'Jakarta Composite Index',candles:[],quote:{source:'Index observation unavailable',kind:'unavailable',asOf:now.toISOString(),stale:true,delayMinutes:null}} as IndexData}))]);
  const rowMap=new Map(rows.map(r=>[r.symbol,r])),stocks=registry.entries.map(e=>{
    const row=rowMap.get(e.symbol);let result:Stock;
    try{const parsed=row?.summary_json?JSON.parse(row.summary_json) as Stock:null;result=parsed?reassessSummary({...parsed,...e,quote:row?.last_error?{...parsed.quote,stale:true}:parsed.quote},feeds.articles,now):analyze(withNews(blank(e,registry.asOf),feeds.articles),now);}catch{result=analyze(blank(e,registry.asOf),now);}
    return {...result,scanStatus:row?.last_error?'error' as const:row?.last_success_at?'ready' as const:'pending' as const,scanError:row?.last_error??null};
  }).sort((a,b)=>(b.overallScore??-1)-(a.overallScore??-1)||a.symbol.localeCompare(b.symbol));
  const today=researchDay(now),active=registry.entries.map(e=>rowMap.get(e.symbol)),attempted=active.filter(r=>r?.scan_date===today).length,scanned=stocks.filter(s=>s.price!==null).length;
  const universe={total:registry.entries.length,scanned,attemptedToday:attempted,successfulToday:active.filter(r=>r?.scan_date===today&&r.last_success_at&&researchDay(new Date(r.last_success_at))===today&&!r.last_error).length,pending:active.filter(r=>!r?.last_success_at&&!r?.last_error).length,failed:active.filter(r=>r?.last_error).length,due:active.filter(r=>r&&(r.next_scan_at<=now.getTime()||r.lease_until>now.getTime())).length,stale:stocks.filter(s=>s.price!==null&&s.quote.stale).length,registrySource:registry.source,registryUrl:registry.sourceUrl,registryAsOf:registry.asOf,listingVerified:false,lastScanAt:active.map(r=>r?.last_attempt_at??'').sort().at(-1)||null,nextScanAt:new Date(nextResearchDay(now)).toISOString()};
  const financialCount=stocks.filter(s=>s.fundamentalSource&&!s.fundamentalSource.stale).length;
  return {mode:'live',fetchedAt:now.toISOString(),snapshotAt:indexResult.value.quote.asOf,index:{...indexResult.value,quote:fresh(indexResult.value.quote,age('QUOTE_MAX_AGE_SECONDS',4*86400))!},stocks,session:marketSession(now,null),provider:'KSEI registry · Yahoo research · open publications',refreshSeconds:60,universe,daily:dailyShortlist(stocks,now),publications:feeds.articles,sources:[{id:'ksei-universe',name:'KSEI · Equity registry',platform:'market',status:'active',itemCount:registry.entries.length,checkedAt:registry.asOf,detail:'All four-letter local-company share codes in the KSEI register. Registration does not confirm current IDX listing, suspension status, or IHSG membership.'},{id:'yahoo-fundamentals',name:'Yahoo · Automatic fundamentals',platform:'market',status:financialCount?'active':'disabled',itemCount:financialCount,checkedAt:universe.lastScanAt,detail:'Daily resumable scan; reported periods, missing fields and source timestamps remain visible.'},...feeds.sources],warnings:['Public research feeds; price delay is not guaranteed. Catalog coverage is not a claim that every registered security is currently tradable or included in IHSG.','Daily batches retain unavailable and pending symbols in the screener. No mock prices or missing ratios are substituted.','Foreign trading is not supplied by these feeds; CMF remains a price-volume proxy.','Market hours are a weekday schedule estimate; exchange holidays are not verified.']};
}
async function usdIdr():Promise<UsdIdrRate|null>{try{return (await cachedFeed('usd-idr-valuation-v1',3600000,async()=>{const h=await yahooHistory('USDIDR=X');return {value:h.candles.at(-1)!.close,asOf:h.quote.asOf};})).value;}catch{return null;}}
async function fetchStock(entry:EquityEntry,previous:ResearchRow,fx:UsdIdrRate|null):Promise<Stock>{
  const [priceResult,financialResult]=await Promise.allSettled([yahooHistory(`${entry.symbol}.JK`),process.env.ENABLE_AUTO_FUNDAMENTALS==='true'?yahooFinancialSeries(entry.symbol):Promise.resolve(null)]);
  if(priceResult.status==='rejected')throw priceResult.reason;
  if(financialResult.status==='rejected'&&financialResult.reason instanceof UpstreamHttpError&&financialResult.reason.status===429)throw financialResult.reason;
  const history=priceResult.value;let raw:RawStock={...blank(entry,new Date().toISOString()),...history};
  if(process.env.ENABLE_AUTO_FUNDAMENTALS==='true'){
    try{if(financialResult.status!=='fulfilled'||!financialResult.value)throw new Error('Statements unavailable');const derived=deriveFundamentals(raw,financialResult.value,new Date().toISOString(),Date.now(),fx);raw={...raw,fundamentals:derived.fundamentals,fundamentalSource:derived.source,fundamentalNotes:derived.notes};}
    catch{if(previous.detail_json){try{const old=JSON.parse(previous.detail_json) as Stock;raw={...raw,fundamentals:old.fundamentals,fundamentalSource:old.fundamentalSource?{...old.fundamentalSource,stale:true}:null,fundamentalNotes:[...(old.fundamentalNotes??[]),'Statement refresh failed; previous values are retained and marked stale.']};}catch{}}}
  }
  const bars=history.candles.slice(-20),turnover=bars.length===20?bars.reduce((sum,c)=>sum+c.close*c.volume,0)/20:null;
  return {...analyze(normalize(raw)),averageTurnover20d:turnover,scanStatus:'ready'};
}
export async function refreshResearchBatch(limit=8,symbol?:string){
  const registry=await equityRegistry();if(symbol&&!registry.entries.some(e=>e.symbol===symbol))throw new Error('Symbol is not in the public registry');await ensureResearchUniverse(registry);
  const entries=new Map(registry.entries.map(e=>[e.symbol,e])),cooldown=await researchCooldown();
  if(cooldown>Date.now()){const rows=await researchScheduleRows();return {date:researchDay(),rateLimited:true,retryAfterSeconds:Math.ceil((cooldown-Date.now())/1000),attempted:0,succeeded:0,failed:0,remaining:rows.filter(r=>entries.has(r.symbol)&&(r.next_scan_at<=Date.now()||r.lease_until>Date.now())).length,total:registry.entries.length,results:[]};}
  const claimed=await claimResearchBatch(Math.max(1,Math.min(8,limit)),Date.now(),symbol);const fx=claimed.length?await usdIdr():null;
  // Four concurrent issuer fetches; never fan out over the entire exchange in one request.
  const results:({symbol:string;stock:Stock}|{symbol:string;error:string;retryAfterMs?:number})[]=[];let rateLimited=false,retryAfterSeconds=0;
  for(let start=0;start<claimed.length;start+=4){results.push(...await Promise.all(claimed.slice(start,start+4).map(async row=>{
    try{if(rateLimited)return {symbol:row.symbol,error:'Source rate limit; scan paused automatically.',retryAfterMs:retryAfterSeconds*1000};const entry=entries.get(row.symbol);if(!entry)throw new Error('Registry entry unavailable');return {symbol:row.symbol,stock:await fetchStock(entry,row,fx)};}
    catch(error){if(error instanceof UpstreamHttpError&&error.status===429){rateLimited=true;retryAfterSeconds=Math.max(retryAfterSeconds,error.retryAfterSeconds);return {symbol:row.symbol,error:'Source rate limit; scan paused automatically.',retryAfterMs:retryAfterSeconds*1000};}return {symbol:row.symbol,error:'Public price history unavailable or insufficient; retry scheduled. Previous observations, if any, are retained.'};}
  })));}
  await writeResearchResults(results);if(rateLimited)await pauseResearch(Date.now()+retryAfterSeconds*1000);invalidateFullMarket();const rows=await researchScheduleRows(),now=Date.now();
  return {date:researchDay(),rateLimited,retryAfterSeconds,attempted:results.length,succeeded:results.filter(r=>'stock'in r).length,failed:results.filter(r=>'error'in r).length,remaining:rows.filter(r=>entries.has(r.symbol)&&(r.next_scan_at<=now||r.lease_until>now)).length,total:registry.entries.length,results:results.map(r=>({symbol:r.symbol,status:'stock'in r?'ready':'unavailable'}))};
}
export async function getFullStock(symbol:string):Promise<Stock|null>{
  const registry=await equityRegistry(),entry=registry.entries.find(e=>e.symbol===symbol);if(!entry)return null;await ensureResearchUniverse(registry);
  let row=await researchDetail(symbol);
  if(!row?.last_success_at||Date.now()-Date.parse(row.last_success_at)>60000){await refreshResearchBatch(1,symbol);row=await researchDetail(symbol);}
  const feeds=await sentimentFeeds(registry.entries);
  if(!row?.detail_json)return {...analyze(withNews(blank(entry,registry.asOf),feeds.articles)),scanStatus:row?.last_error?'error':'pending',scanError:row?.last_error??null};
  const full=JSON.parse(row.detail_json) as Stock;return {...analyze(normalize(withNews({...full,...entry,quote:row.last_error?{...full.quote,stale:true}:full.quote},feeds.articles))),averageTurnover20d:full.averageTurnover20d,historyTruncated:false,scanStatus:row.last_error?'error':'ready',scanError:row.last_error};
}
export async function finalizeDailyResearch(){invalidateFullMarket();const data=await getFullMarket();await saveDailyResearch(data.daily!.date,{daily:data.daily,universe:data.universe,sourceStatus:data.sources,updatedAt:data.fetchedAt});return {daily:data.daily,universe:data.universe,sources:data.sources};}
