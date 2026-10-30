import test from 'node:test';
import assert from 'node:assert/strict';
import { licensedProvider, newsFromRss, yahooHistory } from '../lib/server/providers';
import { demoStocks } from '../lib/demo';
import { fetchBounded } from '../lib/server/http';
const originalFetch=globalThis.fetch;
function rssResponse(items:string){return new Response(`<rss><channel>${items}</channel></rss>`,{headers:{'content-type':'application/rss+xml'}});}
test('RSS normalizes tracking links, deduplicates headlines, enforces relevance and scores polarity',async()=>{
  const stamp=new Date(Date.now()-3600000).toUTCString();process.env.SENTIMENT_RSS_URL='https://news.example.test/rss';
  const item=(title:string,link:string)=>`<item><title>${title}</title><link>${link}</link><pubDate>${stamp}</pubDate></item>`;
  globalThis.fetch=async()=>rssResponse(item('BBCA reports strong profit growth','https://news.example.test/a?utm_source=sample')+item('BBCA reports strong profit growth','https://news.example.test/b')+item('Other unrelated global story','https://news.example.test/c')+item('BMRI faces loss risk','javascript:alert(1)'));
  try{const articles=await newsFromRss(demoStocks());assert.equal(articles.length,1);assert.equal(articles[0].url,'https://news.example.test/a');assert.ok(articles[0].sentiment>0);}finally{globalThis.fetch=originalFetch;delete process.env.SENTIMENT_RSS_URL;}
});
test('RSS rejects DTD/entity expansion',async()=>{
  process.env.SENTIMENT_RSS_URL='https://news.example.test/rss';globalThis.fetch=async()=>new Response('<!DOCTYPE rss [<!ENTITY x "expansion">]><rss/>');
  try{await assert.rejects(()=>newsFromRss(demoStocks()),/DTD/);}finally{globalThis.fetch=originalFetch;delete process.env.SENTIMENT_RSS_URL;}
});
test('Bounded HTTP rejects non-HTTPS targets, errors and oversized streams',async()=>{
  await assert.rejects(()=>fetchBounded('http://local.test'),/HTTPS/);
  globalThis.fetch=async()=>new Response('too large',{headers:{'content-length':'100'}});
  try{await assert.rejects(()=>fetchBounded('https://example.test',{},4),/too large/);}finally{globalThis.fetch=originalFetch;}
});
test('Yahoo API errors are surfaced and no neutral fundamentals are invented',async()=>{
  globalThis.fetch=async()=>Response.json({chart:{result:null,error:{code:'Not Found'}}});
  try{await assert.rejects(()=>yahooHistory('BBCA.JK'),/unavailable/);}finally{globalThis.fetch=originalFetch;}
});
test('Licensed adapter validates vendor shape before accepting it',async()=>{
  process.env.IDX_PROVIDER_URL='https://provider.example.test/idx';globalThis.fetch=async()=>Response.json({stocks:[{symbol:'BBCA'}]});
  try{await assert.rejects(()=>licensedProvider());}finally{globalThis.fetch=originalFetch;delete process.env.IDX_PROVIDER_URL;}
});


test('HTTP uses a Workers-compatible redirect policy and refuses redirected feeds',async()=>{
  let calls=0;
  globalThis.fetch=async(_input,init)=>{
    calls++;
    if(init?.redirect==='error')throw new TypeError('Invalid redirect value, must be one of follow or manual');
    assert.equal(init?.redirect,'manual');
    return new Response(null,{status:302,headers:{Location:'https://untrusted.example.test/feed'}});
  };
  try{await assert.rejects(()=>fetchBounded('https://provider.example.test/feed'),/HTTP 302/);assert.equal(calls,1);}finally{globalThis.fetch=originalFetch;}
});
