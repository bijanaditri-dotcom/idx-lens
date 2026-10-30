import assert from 'node:assert/strict';
import test from 'node:test';
import { apiSnapshot } from '../pages/api-snapshot';
import { snapshotFreshness } from '../lib/snapshot-freshness';

const now = new Date('2026-10-30T05:41:00Z');
function exported() {
  return {schemaVersion:1,exportedAt:now.toISOString(),quoteMaxAgeSeconds:900,index:null,
    stocks:[{ticker:'BBCA.JK',name:'Bank Central Asia',quote:{price:4980,previousClose:5000,currency:'IDR',marketTime:'2026-10-30T05:39:00Z',fetchedAt:'2026-10-30T05:40:00Z',source:'Yahoo Finance chart (HTTP)'},dailyBars:[],omittedDailyBars:0}]};
}

test('API quote replaces demo values without filling absent research fields', () => {
  const data = apiSnapshot(exported(), now), stock = data.stocks[0];
  assert.equal(data.mode, 'live');
  assert.equal(stock.price, 4980);
  assert.equal(stock.change, -20);
  assert.equal(stock.quote.asOf, '2026-10-30T05:39:00Z');
  assert.equal(data.fetchedAt, '2026-10-30T05:40:00Z');
  assert.deepEqual(stock.candles, []);
  assert.equal(stock.indicators.rsi, null);
  assert.equal(stock.fundamentals, null);
  assert.equal(stock.foreignDaily, null);
  assert.deepEqual(stock.articles, []);
  assert.equal(stock.recommendation, 'INCOMPLETE');
  assert.equal(data.index.quote.kind, 'unavailable');
});

test('published observations become stale as the browser clock advances', () => {
  const data = apiSnapshot(exported(), now);
  assert.equal(data.stocks[0].quote.stale, false);
  const later = snapshotFreshness(data, Date.parse('2026-10-30T06:00:00Z'));
  assert.equal(later.stocks[0].quote.stale, true);
  assert.equal(later.stocks[0].quote.asOf, data.stocks[0].quote.asOf);
  assert.equal(later.fetchedAt, data.fetchedAt);
});

test('unknown export fields and duplicate symbols fail validation', () => {
  assert.throws(()=>apiSnapshot({...exported(),credential:'never-public'}, now));
  const source=exported();source.stocks.push(source.stocks[0]);
  assert.throws(()=>apiSnapshot(source, now));
});

test('daily chart values do not overwrite a newer quote price', () => {
  const source=exported();
  const withHistory={...source,stocks:[{...source.stocks[0],dailyBars:[{time:'2026-10-29',open:4900,high:5100,low:4800,close:5000,volume:10000}]}]};
  const stock=apiSnapshot(withHistory,now).stocks[0];
  assert.equal(stock.candles[0].close,5000);
  assert.equal(stock.price,4980);
  assert.equal(stock.change,-20);
  assert.equal(stock.recommendation,'INCOMPLETE');
});
