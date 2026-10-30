import { z } from 'zod';
import { XMLParser } from 'fast-xml-parser';
import type { Article, IntegrationSource, RawStock } from '../types';
import { textSentiment } from '../analysis/sentiment';
import { fetchBounded, jsonUpstream } from './http';
import { cachedFeed } from './data-store';
export const PUBLIC_NEWS_FEEDS=[
  {id:'stockbit-snips',name:'Stockbit Snips',platform:'stockbit' as const,url:'https://snips.stockbit.com/snips-terbaru?format=rss'},
  {id:'antara-bursa',name:'ANTARA · Bursa',platform:'news' as const,url:'https://www.antaranews.com/rss/ekonomi-bursa.xml'},
  {id:'antara-finansial',name:'ANTARA · Finansial',platform:'news' as const,url:'https://www.antaranews.com/rss/ekonomi-finansial.xml'},
  {id:'antara-bisnis',name:'ANTARA · Bisnis',platform:'news' as const,url:'https://www.antaranews.com/rss/ekonomi-bisnis.xml'},
  {id:'cnbc-market',name:'CNBC Indonesia · Market',platform:'news' as const,url:'https://www.cnbcindonesia.com/market/rss/'},
  {id:'detik-finance',name:'Detik · Finance',platform:'news' as const,url:'https://finance.detik.com/rss'},
  {id:'stockwatch',name:'Stockwatch',platform:'news' as const,url:'https://stockwatch.id/feed/'},
];
const aliases:Record<string,string[]>={BBCA:['Bank Central Asia','BCA'],BBRI:['Bank Rakyat Indonesia','BRI'],BMRI:['Bank Mandiri'],BBNI:['Bank Negara Indonesia','BNI'],TLKM:['Telkom Indonesia','Telkom'],ASII:['Astra International'],ANTM:['Aneka Tambang','Antam'],PTBA:['Bukit Asam'],ICBP:['Indofood CBP'],INDF:['Indofood Sukses Makmur'],GOTO:['GoTo Gojek Tokopedia','GoTo'],UNTR:['United Tractors']};
const escapeRegex=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const text=(x:unknown):string=>typeof x==='string'?x:typeof x==='number'?String(x):'';
const clean=(s:string)=>s.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const subsidiaryNames:Record<string,RegExp>={BBRI:/\bBRI\s+(Insurance|Life|Danareksa|Finance|Agro)\b/i,BBCA:/\bBCA\s+(Digital|Finance|Syariah|Life|Sekuritas|Insurance|Multifinance)\b/i,BBNI:/\bBNI\s+(Life|Sekuritas|Finance)\b/i};
type IssuerRef=Pick<RawStock,'symbol'|'name'>;
const ambiguous=new Set(['BANK','DATA','CARE','HOME','REAL','IDEA','CITY','SOUL','GOOD','MEAL','LAND','CASH','GOLD','WIFI','LIVE','TRUE','SAFE','HERO','BALI','LIFE','DEAL','ZONE','NICE','FISH','BLUE','STAR','FAST','FOOD','SAME','COAL','OILS','BABY','BOAT','BEEF','TOOL','DIVA','KOTA','MINE','PADI','POLA']);
const normalizedWords=(s:string)=>' '+s.toLocaleLowerCase('en').replace(/[^\p{L}\p{N}]+/gu,' ').trim()+' ';
let matcherKey='',matchers:{symbol:string;names:string[];full:string;subsidiary?:RegExp}[]=[];
export function relevantSymbols(title:string,stocks:IssuerRef[]):string[]{

  const key=stocks.map(s=>s.symbol+':'+s.name).join('|');
  if(key!==matcherKey){matcherKey=key;matchers=stocks.map(s=>{
    const normalized=s.name.replace(/^PT\.?\s+/i,'').replace(/\s*\(PERSERO\)\s*/ig,' ').replace(/\s+Tbk\.?[,]?(?:\s*PT)?$/i,'').replace(/,\s*PT$/i,'').trim();
    const names=[s.name,...(normalized.length>=7?[normalized]:[]),...(aliases[s.symbol]??[])];
    return {symbol:s.symbol,names:[...new Set(names.map(normalizedWords))],full:normalizedWords(s.name),subsidiary:subsidiaryNames[s.symbol]};
  });}
  const normalized=normalizedWords(title),codes=new Set(title.match(/(?<![A-Za-z0-9])[A-Z]{4}(?![A-Za-z0-9])/g)??[]),explicit=new Set<string>();
  for(const match of title.matchAll(/(?:\$([A-Za-z]{4})(?![A-Za-z0-9])|\(([A-Za-z]{4})\)|\bsaham\s+([A-Za-z]{4})\b)/gi))explicit.add((match[1]??match[2]??match[3]).toUpperCase());
  return matchers.filter(s=>{const exact=(ambiguous.has(s.symbol)?explicit.has(s.symbol):codes.has(s.symbol));if(s.subsidiary?.test(title)&&!exact&&!normalized.includes(s.full))return false;return exact||s.names.some(name=>normalized.includes(name));}).map(s=>s.symbol);
}

export function dedupeArticles(articles:Article[]):Article[]{const seen=new Set<string>();return articles.filter(a=>{const title=a.title.toLowerCase().replace(/[^\p{L}\p{N}]/gu,''),url=a.url??a.id;if(seen.has(title)||seen.has(url))return false;seen.add(title);seen.add(url);return true;});}
export function parseRss(xml:string,stocks:IssuerRef[],publisher?:string,now=Date.now()):Article[]{
  if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('RSS DTD/entities rejected');
  const root=new XMLParser({ignoreAttributes:false,processEntities:true}).parse(xml),raw=root?.rss?.channel?.item??root?.feed?.entry??[],items=Array.isArray(raw)?raw:[raw],articles:Article[]=[];
  for(const item of items.slice(0,100)){
    const title=clean(text(item.title?.['#text']??item.title)).slice(0,500);
    const links=Array.isArray(item.link)?item.link:[item.link];
    const chosen=links.find((x:unknown)=>typeof x==='string'||(x as Record<string,string>)?.['@_rel']==='alternate')??links[0];
    const link=text(chosen?.['@_href']??chosen);let url:URL;try{url=new URL(link);if(url.protocol!=='https:'||url.username||url.password)continue;}catch{continue;}
    url.hash='';['utm_source','utm_medium','utm_campaign','utm_term','utm_content'].forEach(k=>url.searchParams.delete(k));
    const date=new Date(text(item.pubDate??item.published??item.updated));if(!title||!Number.isFinite(date.getTime())||date.getTime()>now||now-date.getTime()>7*86400000)continue;
    const relevance=relevantSymbols(title,stocks);if(!relevance.length||relevance.length>3)continue; // Roundups are not stock-specific sentiment evidence.
    articles.push({id:url.href.slice(0,240),title,url:url.href,publisher:publisher??(text(item.source?.['#text']??item.source).slice(0,100)||url.hostname),publishedAt:date.toISOString(),channel:'news',sentiment:textSentiment(title),relevance});
  }
  return dedupeArticles(articles);
}
function configuredFeeds(){
  if(process.env.SENTIMENT_RSS_URL)return [{id:'custom-rss',name:'Configured news RSS',platform:'news' as const,url:process.env.SENTIMENT_RSS_URL}];
  return process.env.ENABLE_NEWS_SENTIMENT==='true'?PUBLIC_NEWS_FEEDS:[];
}
export async function newsFromRss(stocks:IssuerRef[]):Promise<Article[]>{const results=await Promise.all(configuredFeeds().map(async f=>parseRss(await fetchBounded(f.url,{headers:{Accept:'application/rss+xml, application/atom+xml, text/xml'}},700000),stocks,f.id==='custom-rss'?undefined:f.name)));return dedupeArticles(results.flat());}
const hash=(s:string)=>{let n=2166136261;for(const c of s)n=Math.imul(n^c.charCodeAt(0),16777619);return (n>>>0).toString(36);};
export async function sentimentFeeds(stocks:IssuerRef[]):Promise<{articles:Article[];sources:IntegrationSource[]}>{
  const universe=stocks.map(s=>s.symbol).sort().join(','),feeds=configuredFeeds();
  const results=await Promise.all(feeds.map(async feed=>{
    try{const cached=await cachedFeed<Article[]>(`rss-v4:${hash(feed.url+universe)}`,10*60000,async(previous)=>dedupeArticles([...parseRss(await fetchBounded(feed.url,{headers:{Accept:'application/rss+xml, application/atom+xml, text/xml'}},700000),stocks,feed.name),...(previous??[]).filter(a=>Date.now()-Date.parse(a.publishedAt)<=7*86400000)]).slice(0,1000));return {articles:cached.value,source:{id:feed.id,name:feed.name,platform:feed.platform,status:'active' as const,itemCount:cached.value.length,checkedAt:cached.asOf,detail:`${cached.cached?'Cached RSS':'RSS'} · open publication headlines; retained for 7 days; broad roundups excluded`}};}
    catch{return {articles:[],source:{id:feed.id,name:feed.name,platform:feed.platform,status:'error' as const,itemCount:0,checkedAt:new Date().toISOString(),detail:'Feed unavailable; no sample headlines substituted'}};}
  }));
  const sources:IntegrationSource[]=results.map(r=>r.source),articles=results.flatMap(r=>r.articles);
  if(!feeds.length)sources.push({id:'news',name:'News RSS',platform:'news',status:'disabled',itemCount:0,checkedAt:null,detail:'Enable permitted news RSS sources in server settings'});
  if(process.env.ENABLE_X_SENTIMENT!=='true'||!process.env.X_BEARER_TOKEN)sources.push({id:'x',name:'X · Recent search',platform:'x',status:'disabled',itemCount:0,checkedAt:null,detail:'Optional social feed is off. Open publisher feeds supply sentiment without a Stockbit or X account.'});
  else{
    try{const result=await cachedFeed(`x-v1:${hash(universe)}`,30*60000,()=>postsFromX(stocks),true);articles.push(...result.value);sources.push({id:'x',name:'X · Recent search',platform:'x',status:'active',itemCount:result.value.length,checkedAt:result.asOf,detail:'Official API · 30-minute shared cache; reposts and replies excluded'});}
    catch{sources.push({id:'x',name:'X · Recent search',platform:'x',status:'error',itemCount:0,checkedAt:new Date().toISOString(),detail:'X API unavailable or access/credits missing; no posts fabricated'});}
  }
  // Reassess archived headlines too, so a scorer update applies without refetching.
  return {articles:dedupeArticles(articles).map(a=>({...a,sentiment:textSentiment(a.title)})),sources};
}
const xSchema=z.object({data:z.array(z.object({id:z.string().regex(/^\d+$/),text:z.string(),created_at:z.string().datetime({offset:true})})).optional(),meta:z.object({result_count:z.number().optional()}).optional(),errors:z.array(z.unknown()).optional()});
export async function postsFromX(stocks:IssuerRef[]):Promise<Article[]>{
  if(!process.env.X_BEARER_TOKEN||process.env.ENABLE_X_SENTIMENT!=='true')return [];
  const symbols=stocks.map(s=>s.symbol).filter(s=>/^[A-Z]{4}$/.test(s)).slice(0,20);
  const query=`(${symbols.join(' OR ')}) (saham OR IHSG OR IDX) -is:retweet -is:reply`;
  const params=new URLSearchParams({query,'max_results':'20','tweet.fields':'created_at'});
  const result=xSchema.parse(await jsonUpstream(`https://api.x.com/2/tweets/search/recent?${params}`,{headers:{Authorization:`Bearer ${process.env.X_BEARER_TOKEN}`}}));
  if(result.errors?.length&&!result.data?.length)throw new Error('X search returned an API error');
  const now=Date.now();return dedupeArticles((result.data??[]).flatMap(post=>{const relevance=relevantSymbols(post.text,stocks),date=Date.parse(post.created_at);if(!relevance.length||relevance.length>3||date>now||now-date>7*86400000)return [];return [{id:`x-${post.id}`,title:clean(post.text).slice(0,500),url:`https://x.com/i/web/status/${post.id}`,publisher:'X · Public post',publishedAt:post.created_at,channel:'social' as const,sentiment:textSentiment(post.text),relevance}];}));
}
