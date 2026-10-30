import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { demoStocks,DEMO_AS_OF,demoIndex } from '../lib/demo';
import { relevantSymbols,parseRss,postsFromX,dedupeArticles,sentimentFeeds } from '../lib/server/sentiment-feeds';
import { parseCsv,parseStockbitCsv,STOCKBIT_COLUMNS,mergeSnapshot,readStockbitSnapshots,saveStockbitSnapshots,applyStockbitSnapshots } from '../lib/server/stockbit-import';
import { runWithDataStore,cachedFeed } from '../lib/server/data-store';
import { analyze } from '../lib/analysis/scoring';
import type { MarketData } from '../lib/types';
const sourceFetch=globalThis.fetch;
const csv=(rows:Record<string,string>[])=>[STOCKBIT_COLUMNS.join(','),...rows.map(row=>STOCKBIT_COLUMNS.map(c=>row[c]??'').join(','))].join('\r\n');
const base={symbol:'BBCA',type:'fundamental',as_of:'2026-10-28T16:15:00+07:00',per:'12.5',roe:'21',pbv:'2'};
function database(){const sql=new DatabaseSync(':memory:');sql.exec(readFileSync('drizzle/0000_black_captain_flint.sql','utf8'));return {sql,db:{prepare(query:string){let values:unknown[]=[];const statement=sql.prepare(query);const api={bind(...args:unknown[]){values=args;return api;},async run(){statement.run(...values as (string|number|null)[]);return {success:true};},async all(){return {results:statement.all(...values as (string|number|null)[])};},async first(){return statement.get(...values as (string|number|null)[])??null;}};return api;},async batch(statements:{run:()=>Promise<unknown>}[]){const results=[];for(const statement of statements)results.push(await statement.run());return results;}} as unknown as D1Database};}

test('News aliases match issuer names and reject embedded ticker strings',()=>{
  assert.deepEqual(relevantSymbols('Laba BCA tumbuh positif',demoStocks()),['BBCA']);
  assert.deepEqual(relevantSymbols('ANTAM membagikan dividen',demoStocks()),['ANTM']);
  assert.deepEqual(relevantSymbols('XBBCA company label',demoStocks()),[]);
});
test('RSS decodes entities, supports Atom and excludes broad ticker roundups',()=>{
  const date=new Date().toISOString(),stocks=demoStocks();
  const atom=`<feed><entry><title>BCA laba &amp; dividen tumbuh</title><link href="https://news.example.test/a" rel="alternate"/><updated>${date}</updated></entry></feed>`;
  assert.equal(parseRss(atom,stocks,'Sample publisher')[0].title,'BCA laba & dividen tumbuh');
  const roundup=`<rss><channel><item><title>BBCA BBRI BMRI BBNI market roundup</title><link>https://news.example.test/b</link><pubDate>${date}</pubDate></item></channel></rss>`;
  assert.equal(parseRss(roundup,stocks).length,0);
});
test('Cross-feed syndication counts one unique headline',()=>{const stock=demoStocks()[0];const a=stock.articles[0];assert.equal(dedupeArticles([a,{...a,id:'other',url:'https://other.example.test/same'}]).length,1);});
test('X is opt-in and fails closed before any billable request without shared caching',async()=>{
  delete process.env.ENABLE_X_SENTIMENT;let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({});};
  try{assert.deepEqual(await postsFromX(demoStocks()),[]);process.env.ENABLE_X_SENTIMENT='true';process.env.X_BEARER_TOKEN='test-placeholder';const result=await sentimentFeeds(demoStocks());assert.equal(result.sources.find(s=>s.id==='x')?.status,'error');assert.equal(calls,0);}finally{globalThis.fetch=sourceFetch;delete process.env.ENABLE_X_SENTIMENT;delete process.env.X_BEARER_TOKEN;}
});
test('X API normalization preserves source link, timestamp and issuer relevance',async()=>{
  process.env.ENABLE_X_SENTIMENT='true';process.env.X_BEARER_TOKEN='test-placeholder';globalThis.fetch=async(input,init)=>{assert.ok(String(input).startsWith('https://api.x.com/2/tweets/search/recent?'));assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer test-placeholder');return Response.json({data:[{id:'12345',text:'Saham BBCA laba tumbuh positif',created_at:new Date().toISOString()},{id:'12346',text:'Unrelated everyday discussion',created_at:new Date().toISOString()}]});};
  try{const articles=await postsFromX(demoStocks());assert.equal(articles.length,1);assert.equal(articles[0].channel,'social');assert.equal(articles[0].url,'https://x.com/i/web/status/12345');}finally{globalThis.fetch=sourceFetch;delete process.env.ENABLE_X_SENTIMENT;delete process.env.X_BEARER_TOKEN;}
});
test('CSV handles BOM, escaped quotes and CRLF; rejects malformed quoted rows',()=>{assert.deepEqual(parseCsv('\uFEFFa,b\r\n"hello, world","a""b"'),[['a','b'],['hello, world','a"b']]);assert.throws(()=>parseCsv('a\n"unclosed'),/Unclosed/);});
test('Stockbit import requires real dates and explicit IDR numbers; no formula or unit inference',()=>{
  const parsed=parseStockbitCsv(csv([base,{symbol:'BBCA',type:'flow',as_of:base.as_of,date:'2026-10-28',foreign_buy_idr:'1000000000',foreign_sell_idr:'750000000'}]));assert.equal(parsed[0].fundamentals?.per,12.5);assert.equal(parsed[0].flows[0].buy,1e9);
  assert.throws(()=>parseStockbitCsv(csv([{...base,per:'=1+1'}])),/numeric/);
  assert.throws(()=>parseStockbitCsv(csv([{...base,as_of:'2099-01-01T00:00:00Z'}])),/future/);
  assert.throws(()=>parseStockbitCsv(csv([{...base,type:'flow',date:'2026-10-28',foreign_buy_idr:'1.5B',foreign_sell_idr:'0'}])),/numeric/);
  assert.throws(()=>parseStockbitCsv(csv([base,base])),/Only one/);
});
test('Older imported snapshots cannot overwrite newer observed data',()=>{const next=parseStockbitCsv(csv([base]))[0],old={...next,fundamentalAsOf:'2026-10-28T17:00:00+07:00',fundamentals:{...next.fundamentals!,per:15}};assert.equal(mergeSnapshot(old,next).fundamentals?.per,15);});
test('D1 snapshot reads and writes isolate users even for the same ticker',async()=>{
  const {db,sql}=database();try{await runWithDataStore(db,async()=>{const a=parseStockbitCsv(csv([base])),b=parseStockbitCsv(csv([{...base,per:'25'}]));await saveStockbitSnapshots('user-a',a);await saveStockbitSnapshots('user-b',b);assert.equal((await readStockbitSnapshots('user-a'))[0].fundamentals?.per,12.5);assert.equal((await readStockbitSnapshots('user-b'))[0].fundamentals?.per,25);assert.deepEqual(await readStockbitSnapshots('user-c'),[]);});}finally{sql.close();}
});
test('Shared cache prevents duplicate refreshes across request contexts',async()=>{const {db,sql}=database();let calls=0;try{await runWithDataStore(db,async()=>{const fetcher=async()=>{calls++;return [1,2,3];};assert.equal((await cachedFeed('test',1800000,fetcher,true)).cached,false);assert.equal((await cachedFeed('test',1800000,fetcher,true)).cached,true);assert.equal(calls,1);});}finally{sql.close();}});

test('Archived news uses current sentiment rules without another publisher request',async()=>{
  const {db,sql}=database(),before={news:process.env.ENABLE_NEWS_SENTIMENT,rss:process.env.SENTIMENT_RSS_URL};let calls=0;
  process.env.ENABLE_NEWS_SENTIMENT='true';process.env.SENTIMENT_RSS_URL='https://news.example.test/feed';
  globalThis.fetch=async()=>{calls++;return new Response(`<rss><channel><item><title>BBCA laba bersih turun 5 persen</title><link>https://news.example.test/decline</link><pubDate>${new Date().toISOString()}</pubDate></item></channel></rss>`);};
  try{await runWithDataStore(db,async()=>{
    const first=await sentimentFeeds(demoStocks());assert.ok(first.articles[0].sentiment<0);
    const row=sql.prepare('SELECT cache_key,payload_json FROM feed_cache').get()!;
    const old=JSON.parse(String(row.payload_json));old[0].sentiment=1;
    sql.prepare('UPDATE feed_cache SET payload_json=? WHERE cache_key=?').run(JSON.stringify(old),String(row.cache_key));
    const next=await sentimentFeeds(demoStocks());assert.ok(next.articles[0].sentiment<0);assert.equal(calls,1);
    assert.equal(next.articles[0].publishedAt,first.articles[0].publishedAt);
    assert.equal(next.sources[0].checkedAt,first.sources[0].checkedAt);
  });}finally{sql.close();globalThis.fetch=sourceFetch;for(const [key,value] of Object.entries({ENABLE_NEWS_SENTIMENT:before.news,SENTIMENT_RSS_URL:before.rss})){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});


test('Subsidiary headlines require an explicit listed parent before scoring that ticker',()=>{
  assert.deepEqual(relevantSymbols('BRI Insurance tingkatkan kepatuhan bisnis',demoStocks()),[]);
  assert.deepEqual(relevantSymbols('BCA Digital mencatat pertumbuhan laba',demoStocks()),[]);
  assert.deepEqual(relevantSymbols('BBRI dukung ekspansi BRI Insurance',demoStocks()),['BBRI']);
});
