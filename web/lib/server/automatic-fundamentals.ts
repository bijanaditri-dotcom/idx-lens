import { z } from 'zod';
import type { Fundamentals, IntegrationSource, RawStock, Stamp } from '../types';
import { jsonUpstream } from './http';
import { cachedFeed } from './data-store';
export type FinancialPoint={date:string;value:number;currency:string};
export type FinancialSeries=Record<string,FinancialPoint[]>;
const financialTypes=['trailingBasicEPS','trailingDilutedEPS','trailingNetIncomeCommonStockholders','trailingTotalRevenue','annualBasicEPS','annualDilutedEPS','annualNetIncomeCommonStockholders','annualTotalRevenue','quarterlyStockholdersEquity','quarterlyTotalDebt','quarterlyOrdinarySharesNumber','annualStockholdersEquity','annualTotalDebt','annualOrdinarySharesNumber'];
const responseSchema=z.object({timeseries:z.object({result:z.array(z.record(z.unknown())).nullable().optional(),error:z.unknown().nullable().optional()})});
const pointSchema=z.object({asOfDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),currencyCode:z.string().optional(),periodType:z.string().optional(),reportedValue:z.object({raw:z.number().finite()})});
export function parseFinancialSeries(data:unknown,now=Date.now()):FinancialSeries{
  const parsed=responseSchema.parse(data);if(parsed.timeseries.error)throw new Error('Financial series unavailable');
  const series:FinancialSeries={};
  for(const item of parsed.timeseries.result??[]){for(const key of financialTypes){if(!Array.isArray(item[key]))continue;const points:FinancialPoint[]=[];for(const raw of item[key] as unknown[]){const p=pointSchema.safeParse(raw);if(!p.success)continue;const date=Date.parse(p.data.asOfDate);if(!Number.isFinite(date)||new Date(date).toISOString().slice(0,10)!==p.data.asOfDate||date>now)continue;const currency=p.data.currencyCode??'';const expected=key.startsWith('trailing')?'TTM':key.startsWith('annual')?'12M':'3M';if(p.data.periodType&&p.data.periodType!==expected)continue;
    if(!key.endsWith('OrdinarySharesNumber')&&!['IDR','USD'].includes(currency))continue;
    points.push({date:p.data.asOfDate,value:p.data.reportedValue.raw,currency});}
    if(points.length)series[key]=[...new Map(points.map(p=>[p.date,p])).values()].sort((a,b)=>a.date.localeCompare(b.date));}}
  if(!Object.keys(series).length)throw new Error('No compatible IDR/USD financial observations');return series;
}
export async function yahooFinancialSeries(symbol:string):Promise<FinancialSeries>{
  if(!/^[A-Z]{4}$/.test(symbol))throw new Error('Invalid IDX symbol');
  const ticker=`${symbol}.JK`,params=new URLSearchParams({symbol:ticker,type:financialTypes.join(','),period1:String(Math.floor(Date.UTC(new Date().getUTCFullYear()-3,0,1)/1000)),period2:String(Math.floor(Date.now()/1000))});
  return parseFinancialSeries(await jsonUpstream(`https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${ticker}?${params}`,{headers:{'User-Agent':'IDX-Lens-Research/1.0'}}));
}
const pointAt=(points:FinancialPoint[]|undefined,date:string)=>points?.find(p=>p.date===date)??null;
export type UsdIdrRate={value:number;asOf:string};
const at=(points:FinancialPoint[]|undefined,date:string)=>points?.find(p=>p.date===date)?.value??null;
const priorYear=(date:string)=>`${Number(date.slice(0,4))-1}${date.slice(4)}`;
const divide=(a:number|null,b:number|null,multiplier=1)=>a===null||b===null||b===0?null:Number.isFinite(a/b*multiplier)?a/b*multiplier:null;
export function deriveFundamentals(stock:RawStock,series:FinancialSeries,observedAt:string,now=Date.now(),fx?:UsdIdrRate|null):{fundamentals:Fundamentals;source:Stamp;notes:string[]}{
  const price=stock.candles.at(-1)?.close??null;
  // Income and revenue must refer to the same reporting window and period end.
  let basis='trailing',period:string|null=null;
  for(const prefix of ['trailing','annual']){const income=series[`${prefix}NetIncomeCommonStockholders`]??[],revenue=series[`${prefix}TotalRevenue`]??[];const dates=income.filter(p=>revenue.some(r=>r.date===p.date&&r.currency===p.currency)).map(p=>p.date).sort();if(dates.length){basis=prefix;period=dates.at(-1)!;break;}}
  if(!period)throw new Error('No matching income and revenue reporting period');
  const incomePoint=pointAt(series[`${basis}NetIncomeCommonStockholders`],period)!,currency=incomePoint.currency;
  const income=incomePoint.value,revenue=at(series[`${basis}TotalRevenue`],period);
  const diluted=pointAt(series[`${basis}DilutedEPS`],period),basic=pointAt(series[`${basis}BasicEPS`],period);
  const eps=diluted?.currency===currency?diluted.value:basic?.currency===currency?basic.value:null;
  const conversion=(c:string)=>c==='IDR'?1:c==='USD'&&fx&&fx.value>0&&Number.isFinite(fx.value)&&Date.parse(fx.asOf)<=now&&now-Date.parse(fx.asOf)<=4*86400000?fx.value:null;
  // Quarterly balance-sheet observations take precedence over overlapping annual points.
  const combined=(suffix:string)=>[...new Map([...(series[`annual${suffix}`]??[]),...(series[`quarterly${suffix}`]??[])].map(p=>[p.date,p])).values()].sort((a,b)=>a.date.localeCompare(b.date));
  const equities=combined('StockholdersEquity'),shares=combined('OrdinarySharesNumber'),debts=combined('TotalDebt');
  const balance=equities.filter(p=>shares.some(s=>s.date===p.date&&s.value>0)).at(-1),balanceDate=balance?.date??null;
  const shareCount=balanceDate?at(shares,balanceDate):null,equity=balance?.value??null;
  const debtPoint=balanceDate?pointAt(debts,balanceDate):null,debt=debtPoint?.currency===balance?.currency?debtPoint?.value??null:null;
  const eqEnd=pointAt(equities,period),eqStart=pointAt(equities,priorYear(period)),averageEquity=eqEnd?.currency===currency&&eqStart?.currency===currency?eqEnd.value/2+eqStart.value/2:null;
  const oldPoint=pointAt(series[`${basis}TotalRevenue`],priorYear(period)),oldRevenue=oldPoint?.currency===currency?oldPoint.value:null;
  const quoteTime=Date.parse(stock.quote.asOf),actions=stock.corporateActions;
  const splitAfter=(date:string)=>actions?.splits.some(s=>Date.parse(s.date)>Date.parse(date)&&Date.parse(s.date)<=quoteTime)??false;
  const monetaryBasisOld=now-Date.parse(period)>400*86400000,balanceOld=!balanceDate||now-Date.parse(balanceDate)>400*86400000;
  const epsRate=conversion(currency),equityRate=balance?conversion(balance.currency):null;
  const currentEPS=splitAfter(period)||epsRate===null||eps===null?null:eps*epsRate,currentEquity=equityRate===null||equity===null?null:equity*equityRate,currentShares=balanceDate&&!splitAfter(balanceDate)&&!balanceOld?shareCount:null;
  let dividends:number|null=null;
  if(actions?.dividendsComplete){dividends=actions.dividends.filter(d=>Date.parse(d.date)<=quoteTime&&quoteTime-Date.parse(d.date)<=365*86400000).reduce((sum,d)=>{const factor=actions.splits.filter(s=>Date.parse(s.date)>Date.parse(d.date)&&Date.parse(s.date)<=quoteTime).reduce((f,s)=>f*s.denominator/s.numerator,1);return sum+d.amount*factor;},0);}
  const f:Fundamentals={per:monetaryBasisOld?null:divide(price,currentEPS),pbv:divide(price,divide(currentEquity,currentShares)),roe:monetaryBasisOld?null:divide(income,averageEquity!==null&&averageEquity>0?averageEquity:null,100),der:balanceOld?null:divide(debt,equity),dividendYield:divide(dividends,price,100),marketCap:price!==null&&currentShares!==null&&Number.isFinite(price*currentShares)?price*currentShares:null,revenueGrowth:monetaryBasisOld||oldRevenue===null||oldRevenue<=0?null:divide(revenue! - oldRevenue,oldRevenue,100),netProfitMargin:monetaryBasisOld||revenue===null||revenue<=0?null:divide(income,revenue,100)};
  const dates=[period,...(balanceDate?[balanceDate]:[])].sort(),asOf=dates[0];
  return {fundamentals:f,source:{source:`Yahoo reported financials · ${basis==='trailing'?'TTM':'FY'} derived ratios`,kind:'yahoo',asOf:`${asOf}T00:00:00.000Z`,stale:monetaryBasisOld||(balanceDate!==null&&balanceOld),delayMinutes:null},notes:[
    `${basis==='trailing'?'Trailing 12 months':'Fiscal year'} income/revenue (${currency}) through ${period}. Statement dates are period ends, not claimed publication dates.`,
    `Balance sheet / ordinary share count: ${balanceDate??'unavailable'}. Market cap is calculated from the last reported ordinary share count.`,
    `ROE uses average equity at ${priorYear(period)} and ${period}; missing matching observations remain unavailable. DER uses reported total debt divided by equity.`,
    'P/E uses reported diluted EPS where available, otherwise basic EPS; no EPS is inferred from end-period share counts.',
    `Revenue growth compares matching ${basis==='trailing'?'TTM':'FY'} windows one year apart. Valuation ratios use the current available quote (${stock.quote.asOf}).`,
    `Dividend yield uses reported dividend events (ex-dividend dates) in the trailing 365 days where event coverage is available. Financial data retrieved ${observedAt}.`,
    ...([currency,balance?.currency].includes('USD')?[fx&&conversion('USD')!==null?`USD statement valuations converted using USD/IDR ${fx.value} as of ${fx.asOf}; same-currency profitability ratios need no conversion.`:'USD/IDR conversion unavailable or stale; affected valuation fields remain unavailable.']:[]),
    ...(splitAfter(period)||balanceDate&&splitAfter(balanceDate)?['Valuation fields affected by a split after the reporting period remain unavailable.']:[])
  ]};
}
export async function enrichAutomaticFundamentals(stocks:RawStock[]):Promise<{stocks:RawStock[];sources:IntegrationSource[];warnings:string[]}>{
  if(process.env.ENABLE_AUTO_FUNDAMENTALS!=='true')return {stocks,sources:[],warnings:[]};
  let available=0,failed=0;
  const enriched=await Promise.all(stocks.map(async stock=>{
    if(stock.fundamentals&&stock.fundamentalSource&&!stock.fundamentalSource.stale)return stock;
    try{const cached=await cachedFeed(`yahoo-financial-v1:${stock.symbol}`,6*3600000,()=>yahooFinancialSeries(stock.symbol));const derived=deriveFundamentals(stock,cached.value,cached.asOf);available++;return {...stock,fundamentals:derived.fundamentals,fundamentalSource:derived.source,fundamentalNotes:derived.notes};}
    catch{failed++;return stock;}
  }));
  return {stocks:enriched,sources:[{id:'yahoo-fundamentals',name:'Yahoo · Automatic fundamentals',platform:'market',status:available?'active':failed?'error':'disabled',itemCount:available,checkedAt:new Date().toISOString(),detail:'Reported statements cached for 6 hours; ratios recalculated with quotes. Missing periods, currencies and fields stay unavailable.'}],warnings:failed?[`Automatic financial statements unavailable for ${failed} tracked stocks; no manual input or sample ratios substituted.`]:[]};
}
