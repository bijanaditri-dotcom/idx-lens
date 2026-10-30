import { getPersonalMarket } from '@/lib/server/personal-market';
import { getFullStock } from '@/lib/server/full-market';
import { symbolSchema } from '@/lib/server/schema';
export const dynamic='force-dynamic';
export async function GET(request: Request) {
  const url=new URL(request.url),symbol=url.searchParams.get('symbol');
  if([...url.searchParams.keys()].some(k=>k!=='symbol') || (symbol!==null && !symbolSchema.safeParse(symbol).success)) return Response.json({error:'Use a four-letter uppercase IDX symbol, for example BBCA.'},{status:400});
  try {
    if(symbol&&process.env.ENABLE_FULL_UNIVERSE==='true'){
      const stock=await getFullStock(symbol);if(!stock)return Response.json({error:'Symbol is not in the public equity registry.'},{status:404});
      return Response.json({stock},{headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
    }
    const data=await getPersonalMarket(),stocks=symbol?data.stocks.filter(s=>s.symbol===symbol):data.stocks;
    if(symbol && !stocks.length) return Response.json({error:'Symbol is not available in the configured universe.'},{status:404});
    return Response.json({...data,stocks},{headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  }catch {return Response.json({error:'Market feed unavailable. Retry shortly.'},{status:503,headers:{'Retry-After':'60','Cache-Control':'no-store'}});}
}
