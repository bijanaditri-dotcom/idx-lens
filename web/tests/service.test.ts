import test from 'node:test';
import assert from 'node:assert/strict';
import { demoStocks,demoIndex,DEMO_AS_OF } from '../lib/demo';
import { getMarket } from '../lib/server/market';

test('Single-flight, stale-cache failure, cold failure and coherent fallback retain honest provenance',async(t)=>{
  const originalFetch=globalThis.fetch;
  const stocks=demoStocks(),index=demoIndex();
  for(const s of stocks){s.quote.kind='provider';s.fundamentalSource!.kind='provider';s.flowSource!.kind='provider';s.sentimentSource!.kind='provider';}
  index.quote.kind='provider';
  let calls=0,fail=false;
  process.env.IDX_PROVIDER_URL='https://authorized.example.test/idx';
  globalThis.fetch=async()=>{calls++;if(fail)return new Response('Unavailable',{status:503});return Response.json({stocks,index,holidays:['2026-10-28']});};
  t.mock.timers.enable({apis:['Date'],now:Date.parse(DEMO_AS_OF)});
  try{
    const batch=await Promise.all([getMarket(),getMarket(),getMarket()]);assert.equal(calls,1);assert.equal(batch[0].mode,'live');assert.ok(batch[0].stocks.some(s=>s.recommendation==='BUY'));
    t.mock.timers.tick(20_000);const cached=await getMarket();assert.equal(calls,1);assert.equal(cached.session.calendarVerified,true);
    fail=true;t.mock.timers.tick(60_000);const stale=await getMarket();assert.equal(stale.mode,'live');assert.ok(stale.stocks.every(s=>s.quote.stale&&s.recommendation==='INCOMPLETE'));assert.equal(stale.snapshotAt,batch[0].snapshotAt);
    process.env.ALLOW_DEMO_FALLBACK='true';t.mock.timers.tick(60_000);const fallback=await getMarket();assert.equal(fallback.mode,'demo');assert.ok(fallback.stocks.every(s=>s.quote.kind==='demo'));assert.equal(fallback.index.quote.kind,'demo');
    delete process.env.ALLOW_DEMO_FALLBACK;t.mock.timers.tick(60_000);await assert.rejects(()=>getMarket(),/upstream unavailable/);
  }finally{globalThis.fetch=originalFetch;t.mock.timers.reset();delete process.env.IDX_PROVIDER_URL;delete process.env.ALLOW_DEMO_FALLBACK;}
});
