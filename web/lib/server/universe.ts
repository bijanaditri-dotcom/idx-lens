import bundled from '@/data/idx-registry.json';
import { UNIVERSE } from '../demo';
import { cachedFeed } from './data-store';
import { fetchBounded } from './http';
export type EquityEntry={symbol:string;name:string;sector:string};
export type EquityRegistry={source:string;sourceUrl:string;asOf:string;listingVerified:boolean;entries:EquityEntry[]};
export const REGISTRY_URL='https://web.ksei.co.id/services/registered-securities/shares';
const sectors=new Map<string,string>(UNIVERSE.map(([s,,sector])=>[s,sector]));
const clean=(s:string)=>s.replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
export function parseKseiRegistry(html:string,minimum=700,now=new Date()):EquityRegistry{
  const entries=new Map<string,EquityEntry>();
  const rows=html.matchAll(/<td>\s*<a\s+href=["']\/services\/registered-securities\/shares\/lc\/([A-Z]{4})["'][^>]*>\s*\1\s*<\/a>\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/g);
  for(const row of rows){const symbol=row[1],name=clean(row[2]);if(!name||name.length>160)continue;entries.set(symbol,{symbol,name,sector:sectors.get(symbol)??(/^BANK\s/.test(name)?'Financials':'Unclassified')});}
  if(entries.size<minimum||entries.size>1500)throw new Error('Incomplete or invalid KSEI registry');
  return {source:'KSEI registered local-company shares',sourceUrl:REGISTRY_URL,asOf:now.toISOString(),listingVerified:false,entries:[...entries.values()].sort((a,b)=>a.symbol.localeCompare(b.symbol))};
}
let local:{value:EquityRegistry;expires:number}|null=null;
export async function equityRegistry():Promise<EquityRegistry>{
  if(local&&local.expires>Date.now())return local.value;
  let value:EquityRegistry;
  try{value=(await cachedFeed('ksei-equity-registry-v1',86400000,async()=>parseKseiRegistry(await fetchBounded(REGISTRY_URL,{headers:{Accept:'text/html','User-Agent':'IDX-Lens-Research/1.0'}},1_000_000)))).value;}
  catch{value={...bundled,entries:bundled.entries.map(e=>({...e,sector:sectors.get(e.symbol)??(/^BANK\s/.test(e.name)?'Financials':e.sector)}))};}
  local={value,expires:Date.now()+15*60000};return value;
}
