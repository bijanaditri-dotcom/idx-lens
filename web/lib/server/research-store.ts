import type { Stock } from '../types';
import { dataStore } from './data-store';
import type { EquityRegistry } from './universe';
export type ResearchRow={symbol:string;detail_json:string|null;summary_json:string|null;last_success_at:string|null;last_attempt_at:string|null;scan_date:string|null;next_scan_at:number;lease_until:number;last_error:string|null};
export const researchDay=(now=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
export function nextResearchDay(now=new Date()):number {const d=new Date(`${researchDay(now)}T07:00:00+07:00`);if(d.getTime()<=now.getTime())d.setUTCDate(d.getUTCDate()+1);return d.getTime();}
function requireDb(){const db=dataStore();if(!db)throw new Error('Persistent research database unavailable');return db;}
const seeded=new WeakMap<D1Database,string>();
export async function ensureResearchUniverse(registry:EquityRegistry){
  const key=registry.entries.map(e=>e.symbol).join(','),db=requireDb();if(seeded.get(db)===key)return;
  for(let offset=0;offset<registry.entries.length;offset+=80){await db.batch(registry.entries.slice(offset,offset+80).map(e=>db.prepare('INSERT OR IGNORE INTO equity_research(symbol,next_scan_at,lease_until) VALUES(?,0,0)').bind(e.symbol)));}seeded.set(db,key);
}
export async function researchRows():Promise<ResearchRow[]>{const result=await requireDb().prepare('SELECT symbol,summary_json,last_success_at,last_attempt_at,scan_date,next_scan_at,lease_until,last_error FROM equity_research').all<ResearchRow>();return result.results;}
export async function researchDetail(symbol:string):Promise<ResearchRow|null>{return requireDb().prepare('SELECT * FROM equity_research WHERE symbol=?').bind(symbol).first<ResearchRow>();}
export async function claimResearchBatch(size:number,now=Date.now(),symbol?:string):Promise<ResearchRow[]>{
  const db=requireDb();
  const sql=symbol?'UPDATE equity_research SET lease_until=?,last_attempt_at=? WHERE symbol=? AND (next_scan_at<=? OR (last_attempt_at IS NOT NULL AND last_attempt_at<=?)) AND lease_until<=? RETURNING *':'UPDATE equity_research SET lease_until=?,last_attempt_at=? WHERE symbol IN (SELECT symbol FROM equity_research WHERE next_scan_at<=? AND lease_until<=? ORDER BY next_scan_at,symbol LIMIT ?) AND next_scan_at<=? AND lease_until<=? RETURNING *';
  const stmt=db.prepare(sql),stamp=new Date(now).toISOString();
  const result=symbol?await stmt.bind(now+120000,stamp,symbol,now,new Date(now-60000).toISOString(),now).all<ResearchRow>():await stmt.bind(now+120000,stamp,now,now,size,now,now).all<ResearchRow>();return result.results;
}
export async function writeResearchResults(results:({symbol:string;stock:Stock}|{symbol:string;error:string;retryAfterMs?:number})[],now=new Date()){
  const db=requireDb();if(!results.length)return;
  await db.batch(results.map(r=>{
    if('error'in r)return db.prepare('UPDATE equity_research SET lease_until=0,next_scan_at=?,scan_date=?,last_error=? WHERE symbol=?').bind(now.getTime()+(r.retryAfterMs??6*3600000),researchDay(now),r.error,r.symbol);
    const summary={...r.stock,candles:r.stock.candles.slice(-32),corporateActions:undefined,historyTruncated:true};
    return db.prepare('UPDATE equity_research SET detail_json=?,summary_json=?,last_success_at=?,scan_date=?,next_scan_at=?,lease_until=0,last_error=NULL WHERE symbol=?').bind(JSON.stringify(r.stock),JSON.stringify(summary),now.toISOString(),researchDay(now),nextResearchDay(now),r.symbol);
  }));
}
export async function saveDailyResearch(date:string,payload:unknown){await requireDb().prepare('INSERT INTO daily_research(date,payload_json,updated_at) VALUES(?,?,?) ON CONFLICT(date) DO UPDATE SET payload_json=excluded.payload_json,updated_at=excluded.updated_at').bind(date,JSON.stringify(payload),new Date().toISOString()).run();}
export async function researchScheduleRows(){return (await requireDb().prepare('SELECT symbol,next_scan_at,lease_until FROM equity_research').all<{symbol:string;next_scan_at:number;lease_until:number}>()).results;}
export async function researchCooldown(){return (await requireDb().prepare("SELECT next_fetch_at FROM feed_cache WHERE cache_key='research-source-cooldown-v1'").first<{next_fetch_at:number}>())?.next_fetch_at??0;}
export async function pauseResearch(until:number){await requireDb().prepare("INSERT INTO feed_cache(cache_key,payload_json,fetched_at,next_fetch_at) VALUES('research-source-cooldown-v1',NULL,NULL,?) ON CONFLICT(cache_key) DO UPDATE SET next_fetch_at=MAX(feed_cache.next_fetch_at,excluded.next_fetch_at)").bind(until).run();}
