import { z } from 'zod';
import type { Fundamentals, ForeignFlow, MarketData, Stock } from '../types';
import { fundamentalsSchema, symbolSchema } from './schema';
import { analyze } from '../analysis/scoring';
import { dataStore } from './data-store';
export type StockbitSnapshot={symbol:string;fundamentals:Fundamentals|null;fundamentalAsOf:string|null;flows:ForeignFlow[];flowAsOf:string|null};
export const STOCKBIT_COLUMNS=['symbol','type','as_of','per','pbv','roe','der','dividend_yield','market_cap_idr','revenue_growth','net_profit_margin','date','foreign_buy_idr','foreign_sell_idr'];
const stamp=z.string().datetime({offset:true}).refine(s=>Date.parse(s)<=Date.now()+300000,'as_of must not be in the future');
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s&&Date.parse(s)<=Date.now(),'Invalid or future flow date');
export function parseCsv(csv:string):string[][]{
  if(new TextEncoder().encode(csv).length>150000)throw new Error('CSV exceeds 150 KB');
  const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;csv=csv.replace(/^\uFEFF/,'');
  for(let i=0;i<csv.length;i++){const c=csv[i];if(c==='"'){if(quoted&&csv[i+1]==='"'){cell+='"';i++;}else if(!quoted&&cell)throw new Error('Invalid CSV quote');else quoted=!quoted;}
    else if(c===','&&!quoted){row.push(cell.trim());cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&csv[i+1]==='\n')i++;row.push(cell.trim());if(row.some(Boolean))rows.push(row);row=[];cell='';}else cell+=c;
    if(cell.length>2000)throw new Error('CSV cell too long');if(rows.length>1000)throw new Error('CSV exceeds 1000 rows');}
  if(quoted)throw new Error('Unclosed CSV quote');row.push(cell.trim());if(row.some(Boolean))rows.push(row);return rows;
}
const numeric=(value:string|undefined):number|null=>{if(!value)return null;if(!/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(value))throw new Error('Use plain numeric values without currency symbols or thousands separators');const n=Number(value);if(!Number.isFinite(n))throw new Error('Invalid numeric value');return n;};
export function parseStockbitCsv(csv:string):StockbitSnapshot[]{
  const [header,...rows]=parseCsv(csv);if(!header||!rows.length)throw new Error('CSV must contain a header and data rows');
  if(new Set(header).size!==header.length||header.some(h=>!STOCKBIT_COLUMNS.includes(h))||!['symbol','type','as_of'].every(h=>header.includes(h)))throw new Error('Use the provided normalized CSV template');
  const stocks=new Map<string,StockbitSnapshot>();
  for(const [i,row]of rows.entries()){
    try{
      if(row.length!==header.length)throw new Error('Column count does not match header');
      const fields=Object.fromEntries(header.map((h,j)=>[h,row[j]])),symbol=symbolSchema.parse(fields.symbol),asOf=stamp.parse(fields.as_of);
      const value=stocks.get(symbol)??{symbol,fundamentals:null,fundamentalAsOf:null,flows:[],flowAsOf:null};
      if(fields.type==='fundamental'){
        if(value.fundamentals)throw new Error('Only one fundamental row per ticker is allowed');
        const raw={per:numeric(fields.per),pbv:numeric(fields.pbv),roe:numeric(fields.roe),der:numeric(fields.der),dividendYield:numeric(fields.dividend_yield),marketCap:numeric(fields.market_cap_idr),revenueGrowth:numeric(fields.revenue_growth),netProfitMargin:numeric(fields.net_profit_margin)};
        if(Object.values(raw).every(x=>x===null))throw new Error('Fundamental row has no metrics');value.fundamentals=fundamentalsSchema.parse(raw);value.fundamentalAsOf=asOf;
      }else if(fields.type==='flow'){
        const date=day.parse(fields.date),buy=numeric(fields.foreign_buy_idr),sell=numeric(fields.foreign_sell_idr);
        if(buy===null||sell===null||buy<0||sell<0)throw new Error('Both foreign buy and sell must be non-negative IDR values');
        if(Date.parse(asOf)<Date.parse(date))throw new Error('Flow observation predates the trading date');
        if(value.flows.some(f=>f.date===date))throw new Error('Duplicate flow date');value.flows.push({date,buy,sell});
        if(!value.flowAsOf||Date.parse(asOf)>Date.parse(value.flowAsOf))value.flowAsOf=asOf;
      }else throw new Error('type must be fundamental or flow');
      if(value.flows.length>30)throw new Error('At most 30 flow sessions per ticker');stocks.set(symbol,value);if(stocks.size>50)throw new Error('At most 50 tickers per import');
    }catch(error){const message=error instanceof z.ZodError?error.issues[0]?.message:error instanceof Error?error.message:'Invalid data';throw new Error(`Row ${i+2}: ${message}`);}
  }
  return [...stocks.values()].map(s=>({...s,flows:s.flows.sort((a,b)=>a.date.localeCompare(b.date))}));
}
export function mergeSnapshot(old:StockbitSnapshot|undefined,next:StockbitSnapshot):StockbitSnapshot{
  if(!old)return next;
  const useFund=next.fundamentals&&(!old.fundamentalAsOf||Date.parse(next.fundamentalAsOf!)>=Date.parse(old.fundamentalAsOf));
  const useFlow=next.flows.length&&(!old.flowAsOf||Date.parse(next.flowAsOf!)>=Date.parse(old.flowAsOf));
  return {symbol:next.symbol,fundamentals:useFund?next.fundamentals:old.fundamentals,fundamentalAsOf:useFund?next.fundamentalAsOf:old.fundamentalAsOf,flows:useFlow?[...new Map([...old.flows,...next.flows].map(f=>[f.date,f])).values()].sort((a,b)=>a.date.localeCompare(b.date)).slice(-30):old.flows,flowAsOf:useFlow?next.flowAsOf:old.flowAsOf};
}
export async function readStockbitSnapshots(userId:string):Promise<StockbitSnapshot[]>{const db=dataStore();if(!db)return [];const result=await db.prepare('SELECT payload_json FROM stockbit_snapshots WHERE user_id=?').bind(userId).all<{payload_json:string}>();return result.results.map(r=>JSON.parse(r.payload_json) as StockbitSnapshot);}
export async function saveStockbitSnapshots(userId:string,snapshots:StockbitSnapshot[]):Promise<void>{const db=dataStore();if(!db)throw new Error('Persistent import storage is unavailable on this deployment');const existing=await readStockbitSnapshots(userId),map=new Map(existing.map(s=>[s.symbol,s]));const now=new Date().toISOString();await db.batch(snapshots.map(next=>{const merged=mergeSnapshot(map.get(next.symbol),next);return db.prepare('INSERT INTO stockbit_snapshots (user_id,symbol,payload_json,updated_at) VALUES (?,?,?,?) ON CONFLICT(user_id,symbol) DO UPDATE SET payload_json=excluded.payload_json,updated_at=excluded.updated_at').bind(userId,next.symbol,JSON.stringify(merged),now);}));}
export function applyStockbitSnapshots(data:MarketData,snapshots:StockbitSnapshot[],now=new Date()):MarketData{
  if(data.mode==='demo')return data;
  const map=new Map(snapshots.map(s=>[s.symbol,s]));let applied=0;
  const stocks=data.stocks.map((stock):Stock=>{const s=map.get(stock.symbol);if(!s)return stock;applied++;
    const fund=s.fundamentals&&s.fundamentalAsOf&&(!stock.fundamentalSource||Date.parse(s.fundamentalAsOf)>=Date.parse(stock.fundamentalSource.asOf));
    const flow=s.flows.length&&s.flowAsOf&&(!stock.flowSource||Date.parse(s.flowAsOf)>=Date.parse(stock.flowSource.asOf));
    return analyze({...stock,fundamentals:fund?s.fundamentals:stock.fundamentals,fundamentalSource:fund?{source:'Stockbit · imported ratio snapshot',kind:'import',asOf:s.fundamentalAsOf!,stale:now.getTime()-Date.parse(s.fundamentalAsOf!)>7*86400000,delayMinutes:null}:stock.fundamentalSource,foreignFlows:flow?s.flows:stock.foreignFlows,flowSource:flow?{source:'Stockbit · imported foreign trading',kind:'import',asOf:s.flowAsOf!,stale:now.getTime()-Date.parse(s.flowAsOf!)>4*86400000,delayMinutes:null}:stock.flowSource},now);
  }).sort((a,b)=>(b.overallScore??-1)-(a.overallScore??-1));
  return {...data,stocks,sources:[...(data.sources??[]),{id:'stockbit-import',name:'Stockbit · Data snapshots',platform:'stockbit',status:applied?'active':'needs_access',itemCount:applied,checkedAt:applied?now.toISOString():null,detail:applied?'User-imported snapshots; not a connected Stockbit account. Imported valuation ratios retain their dated values.':'Import a permitted export using the normalized CSV template; direct account access is not configured'}]};
}
