import test from 'node:test';
import assert from 'node:assert/strict';
import { demoCandles, demoStocks, DEMO_AS_OF, demoIndex } from '../lib/demo';
import { emaSeries, rsi, sma, macd, indicators, chaikinMoneyFlow } from '../lib/analysis/indicators';
import { analyze, fundamentalScore, WEIGHTS } from '../lib/analysis/scoring';
import { textSentiment } from '../lib/analysis/sentiment';
import { marketSession } from '../lib/market-hours';
import { providerSchema, candleSchema, symbolSchema } from '../lib/server/schema';
import { marketWireSchema } from '../lib/wire-schema';
import { GET } from '../app/api/market/route';
import { getMarket } from '../lib/server/market';
const near=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);
const at=new Date(DEMO_AS_OF);
const input=()=>structuredClone(demoStocks()[2]);

test('Wilder RSI matches published reference sequence and handles flat/one-sided markets',()=>{
  const closes=[44.34,44.09,44.15,43.61,44.33,44.83,45.10,45.42,45.84,46.08,45.89,46.03,45.61,46.28,46.28];
  near(rsi(closes)!,70.46413502109705);
  assert.equal(rsi(Array(30).fill(10)),50);assert.equal(rsi(Array.from({length:30},(_,i)=>i)),100);assert.equal(rsi(Array.from({length:30},(_,i)=>30-i)),0);assert.equal(rsi([1,2]),null);
});
test('EMA uses an SMA seed and has no values during its warm-up',()=>{
  assert.deepEqual(emaSeries([1,2,3,4,5],3),[null,null,2,3,4]);assert.equal(sma([1,2],3),null);
});
test('MACD matches independently calculated constant and linear histories',()=>{
  const flat=macd(Array(100).fill(12));near(flat.value!,0);near(flat.signal!,0);near(flat.histogram!,0);
  const linear=macd(Array.from({length:100},(_,i)=>i+1));near(linear.value!,7);near(linear.signal!,7);assert.equal(macd(Array(30).fill(10)).signal,null);
});
test('Golden cross uses actual previous/current SMA50/SMA200 crossing',()=>{
  const original=demoCandles(100,1,250);
  const candles=original.map((c,i)=>({...c,open:i===249?102:100,high:i===249?103:101,low:i===249?101:99,close:i===249?102:100}));
  assert.ok(indicators(candles).signals.includes('Golden cross · BUY'));
  assert.ok(!indicators(candles.slice(0,-1)).signals.includes('Golden cross · BUY'));
});
test('Support/resistance exclude the latest bar; CMF handles zero range/zero volume',()=>{
  const rows=demoCandles(100,0,30);rows[29]={...rows[29],high:9999,low:1};
  assert.ok(indicators(rows).resistance!<9999);assert.ok(indicators(rows).support!>1);
  assert.equal(chaikinMoneyFlow(Array(20).fill({time:'2026-01-01',open:1,high:1,low:1,close:1,volume:10})),0);
  assert.equal(chaikinMoneyFlow(rows.map(c=>({...c,volume:0}))),null);
});
test('Full-coverage score equals documented weighted layer score',()=>{
  const s=analyze(input(),at);const expected=Math.round(Object.entries(WEIGHTS).reduce((sum,[k,w])=>sum+s.layers[k as keyof typeof s.layers].score!*w,0));
  assert.equal(s.overallScore,expected);near(s.coverage,1);assert.equal(s.recommendation,'BUY');
});
test('Absent fundamentals/foreign/sentiment never produce an actionable BUY',()=>{
  const s=input();s.fundamentals=null;s.fundamentalSource=null;s.foreignFlows=[];s.flowSource=null;s.articles=[];s.sentimentSource=null;
  const a=analyze(s,at);assert.equal(a.layers.fundamental.score,null);assert.equal(a.foreignDaily,null);assert.equal(a.foreignWeekly,null);assert.equal(a.bandar,'Unavailable');assert.equal(a.layers.flow.coverage,.4);assert.equal(a.recommendation,'INCOMPLETE');assert.ok(a.coverage<.8);
});
test('Stale prices and sources suspend actionable recommendations',()=>{
  const s=input();s.quote.stale=true;s.fundamentalSource!.stale=true;s.flowSource!.stale=true;s.sentimentSource!.stale=true;
  const a=analyze(s,at);assert.equal(a.recommendation,'INCOMPLETE');assert.equal(a.overallScore,null);assert.equal(a.foreignWeekly,null);
});
test('Foreign weekly flow needs five actual dates aligned to price sessions',()=>{
  const s=input();s.foreignFlows[0].date='2025-01-01';const a=analyze(s,at);assert.equal(a.foreignWeekly,null);assert.equal(a.bandar,'Unavailable');
  const empty=input();empty.foreignFlows=empty.foreignFlows.map(f=>({...f,buy:0,sell:0}));assert.equal(analyze(empty,at).bandar,'Unavailable');
});
test('Loss-making PER and negative book value receive zero valuation credit',()=>{
  const s=input(),good=fundamentalScore(s.fundamentals,'Financials');const bad=fundamentalScore({...s.fundamentals!,per:-5,pbv:-1},'Financials');assert.ok(bad.score!<good.score!);
  const a=fundamentalScore({...s.fundamentals!,der:999},'Financials');assert.equal(a.score,good.score);
});
test('Sentiment negation, no matches and expired news preserve missingness',()=>{
  assert.ok(textSentiment('laba tumbuh positif')>0);assert.ok(textSentiment('profit growth')>0);assert.ok(textSentiment('not strong')<0);assert.equal(textSentiment('company announces meeting'),0);
  const s=input();s.articles=s.articles.map(a=>({...a,publishedAt:'2026-01-01T00:00:00.000Z'}));assert.equal(analyze(s,at).layers.sentiment.score,null);
});
test('Financial subjects do not cancel profit declines or make neutral statements positive',()=>{
  assert.ok(textSentiment('Laba bersih turun 5 persen')<0);
  assert.ok(textSentiment('Net profit declines')<0);
  assert.ok(textSentiment('Data pelanggan FORE bocor')<0);
  assert.ok(textSentiment('Laba bersih menyusut')<0);
  assert.ok(textSentiment('Laba bersih membaik seiring pemulihan')>0);
  assert.equal(textSentiment('Perusahaan melaporkan laba bersih Rp21 triliun'),0);
  assert.equal(textSentiment('Company reports debt and profit'),0);
});
test('IDX clock honors WIB, Friday lunch, auctions, weekends and provider holidays',()=>{
  assert.equal(marketSession(new Date('2026-10-28T02:00:00Z')).status,'OPEN');
  assert.equal(marketSession(new Date('2026-10-30T04:45:00Z')).status,'BREAK');
  assert.equal(marketSession(new Date('2026-10-30T07:00:00Z')).status,'OPEN');
  assert.equal(marketSession(new Date('2026-10-28T08:50:00Z')).phase,'Closing auction');
  assert.equal(marketSession(new Date('2026-10-31T03:00:00Z')).status,'CLOSED');
  assert.equal(marketSession(new Date('2026-10-28T03:00:00Z'),['2026-10-28']).status,'CLOSED');
  assert.equal(marketSession(new Date()).calendarVerified,false);
});
test('Validation rejects malformed symbols, bad OHLC and unprovenanced provider data',()=>{
  for(const value of ['../etc','BBCA.JK','bbca','<script>','^JKSE'])assert.equal(symbolSchema.safeParse(value).success,false);
  assert.equal(candleSchema.safeParse({time:'2026-10-01',open:10,high:9,low:8,close:10,volume:1}).success,false);
  const source=input();source.quote.kind='provider';source.fundamentalSource!.kind='provider';source.flowSource!.kind='provider';source.sentimentSource!.kind='provider';
  const index=demoIndex();index.quote.kind='provider';assert.equal(providerSchema.safeParse({stocks:[source],index,holidays:['2027-01-01']}).success,true);
  source.fundamentalSource=null;assert.equal(providerSchema.safeParse({stocks:[source],index}).success,false);
});
test('Market service emits a valid, explicitly demo snapshot and route validates inputs',async()=>{
  delete process.env.IDX_PROVIDER_URL;delete process.env.ENABLE_YAHOO_RESEARCH;
  const data=await getMarket();assert.equal(data.mode,'demo');assert.equal(data.snapshotAt,DEMO_AS_OF);assert.ok(marketWireSchema.safeParse(data).success);
  assert.equal((await GET(new Request('https://local.test/api/market?symbol=BBCA.JK'))).status,400);
  assert.equal((await GET(new Request('https://local.test/api/market?unknown=1'))).status,400);
  assert.equal((await GET(new Request('https://local.test/api/market?symbol=ZZZZ'))).status,404);
  const response=await GET(new Request('https://local.test/api/market?symbol=BBCA'));assert.equal(response.status,200);const body=marketWireSchema.parse(await response.json());assert.equal(body.stocks.length,1);assert.equal(body.stocks[0].symbol,'BBCA');
});
