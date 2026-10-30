import { z } from 'zod';
const n=z.number().finite(), maybe=n.nullable(), text=z.string();
const stamp=z.object({source:text,kind:z.enum(['demo','provider','yahoo','rss','import','unavailable']),asOf:text.datetime({offset:true}),stale:z.boolean(),delayMinutes:maybe});
const candle=z.object({time:text,open:n,high:n,low:n,close:n,volume:n});
const layer=z.object({score:maybe,coverage:n.min(0).max(1),available:z.boolean(),note:text});
const article=z.object({id:text,title:text,url:text.nullable(),publisher:text,publishedAt:text,channel:z.enum(['news','social']),sentiment:n,relevance:z.array(text)});
export const stockWireSchema=z.object({symbol:text,name:text,sector:text,historyTruncated:z.boolean().optional(),averageTurnover20d:maybe.optional(),scanStatus:z.enum(['pending','ready','error']).optional(),scanError:text.nullable().optional(),candles:z.array(candle).min(0).max(600),quote:stamp,
    fundamentals:z.object({per:maybe,pbv:maybe,roe:maybe,der:maybe,dividendYield:maybe,marketCap:maybe,revenueGrowth:maybe,netProfitMargin:maybe}).nullable(),fundamentalSource:stamp.nullable(),fundamentalNotes:z.array(text).optional(),corporateActions:z.object({dividendsComplete:z.boolean(),dividends:z.array(z.object({date:text,amount:n})),splits:z.array(z.object({date:text,numerator:n,denominator:n}))}).optional(),
    foreignFlows:z.array(z.object({date:text,buy:n,sell:n})),flowSource:stamp.nullable(),articles:z.array(article),sentimentSource:stamp.nullable(),price:maybe,change:maybe,changePercent:maybe,
    indicators:z.object({rsi:maybe,macd:maybe,macdSignal:maybe,histogram:maybe,ema20:maybe,ema50:maybe,sma200:maybe,support:maybe,resistance:maybe,cmf:maybe,relativeVolume:maybe,trend:z.enum(['Bullish','Bearish','Mixed']),signals:z.array(text)}),
    layers:z.object({fundamental:layer,technical:layer,flow:layer,sentiment:layer}),overallScore:maybe,coverage:n,recommendation:z.enum(['BUY','WATCH','AVOID','INCOMPLETE']),foreignDaily:maybe,foreignWeekly:maybe,bandar:z.enum(['Accumulation','Distribution','Neutral','Unavailable']),sentimentLabel:z.enum(['Positive','Neutral','Negative','Unavailable'])
  });
export const stockDetailWireSchema=z.object({stock:stockWireSchema});
export const marketWireSchema=z.object({mode:z.enum(['demo','live','mixed']),fetchedAt:text,snapshotAt:text,provider:text,refreshSeconds:n,
  quoteMaxAgeSeconds:n.int().min(60).max(604800).optional(),
  index:z.object({symbol:text,name:text,candles:z.array(candle).min(0).max(600),quote:stamp,price:maybe.optional(),previousClose:maybe.optional()}),
  session:z.object({status:z.enum(['OPEN','CLOSED','BREAK']),phase:text,calendarVerified:z.boolean(),timeZone:text}),warnings:z.array(text),sources:z.array(z.object({id:text,name:text,platform:z.enum(['stockbit','news','x','market']),status:z.enum(['active','disabled','needs_access','error']),itemCount:n,checkedAt:text.nullable(),detail:text})).optional(),
  universe:z.object({total:n,scanned:n,attemptedToday:n,successfulToday:n,pending:n,failed:n,due:n,stale:n,registrySource:text,registryUrl:text,registryAsOf:text,listingVerified:z.boolean(),lastScanAt:text.nullable(),nextScanAt:text}).optional(),
  daily:z.object({date:text,asOf:text,priced:n,total:n,buys:n,method:text,candidates:z.array(z.object({symbol:text,name:text,score:maybe,coverage:n,signal:z.enum(['BUY','WATCH','AVOID','INCOMPLETE']),averageTurnover20d:maybe,reasons:z.array(text)})).max(10)}).optional(),publications:z.array(article).max(10000).optional(),
  stocks:z.array(stockWireSchema).max(1500)
});
