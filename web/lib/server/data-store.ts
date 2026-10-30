import { AsyncLocalStorage } from 'node:async_hooks';
const context=new AsyncLocalStorage<D1Database|undefined>();
export const runWithDataStore=<T,>(db:D1Database|undefined,fn:()=>T):T=>context.run(db,fn);
export const dataStore=()=>context.getStore();
export async function cachedFeed<T>(key:string,intervalMs:number,fetcher:(previous?:T)=>Promise<T>,requireShared=false):Promise<{value:T;cached:boolean;asOf:string}> {
  const db=dataStore();
  if(!db){if(requireShared)throw new Error('Shared cache is required before enabling X');return {value:await fetcher(),cached:false,asOf:new Date().toISOString()};}
  await db.prepare('INSERT OR IGNORE INTO feed_cache (cache_key,payload_json,fetched_at,next_fetch_at) VALUES (?,NULL,NULL,0)').bind(key).run();
  const now=Date.now();
  const claim=await db.prepare('UPDATE feed_cache SET next_fetch_at=? WHERE cache_key=? AND next_fetch_at<=? RETURNING payload_json,fetched_at').bind(now+intervalMs,key,now).first<{payload_json:string|null;fetched_at:string|null}>();
  if(!claim){const row=await db.prepare('SELECT payload_json,fetched_at FROM feed_cache WHERE cache_key=?').bind(key).first<{payload_json:string|null;fetched_at:string|null}>();if(!row?.payload_json)throw new Error('Feed refresh is pending or temporarily unavailable');return {value:JSON.parse(row.payload_json) as T,cached:true,asOf:row.fetched_at!};}
  try{const value=await fetcher(claim.payload_json?JSON.parse(claim.payload_json) as T:undefined),asOf=new Date().toISOString();await db.prepare('UPDATE feed_cache SET payload_json=?,fetched_at=?,next_fetch_at=? WHERE cache_key=?').bind(JSON.stringify(value),asOf,Date.now()+intervalMs,key).run();return {value,cached:false,asOf};}
  catch(error){await db.prepare('UPDATE feed_cache SET next_fetch_at=? WHERE cache_key=?').bind(Date.now()+Math.max(intervalMs,3600000),key).run();if(claim.payload_json&&claim.fetched_at&&Date.now()-Date.parse(claim.fetched_at)<86400000)return {value:JSON.parse(claim.payload_json) as T,cached:true,asOf:claim.fetched_at};throw error;}
}
