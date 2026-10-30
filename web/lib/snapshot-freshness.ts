import type { MarketData, Stamp } from './types';

/** Recheck age in the browser, including when an old published file is retained. */
export function snapshotFreshness(data: MarketData, now = Date.now()): MarketData {
  if(data.mode==='demo')return data;
  const maxAge = (data.quoteMaxAgeSeconds ?? 900)*1000;
  const fresh = (quote:Stamp):Stamp => ({...quote,stale:quote.stale||!Number.isFinite(Date.parse(quote.asOf))||now-Date.parse(quote.asOf)>maxAge||Date.parse(quote.asOf)>now+300000});
  return {...data,index:{...data.index,quote:fresh(data.index.quote)},stocks:data.stocks.map(stock=>{
    const quote=fresh(stock.quote);
    return {...stock,quote,recommendation:quote.stale?'INCOMPLETE':stock.recommendation};
  })};
}
