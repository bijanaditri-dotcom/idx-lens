import { z } from 'zod';
import { refreshResearchBatch } from '@/lib/server/full-market';
export const dynamic='force-dynamic';
const input=z.object({limit:z.number().int().min(1).max(8).default(8)}).strict();
export async function POST(request:Request){
  // Owner-private Site: Dispatch authenticates visitors and supported service callers.
  const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return Response.json({error:'Same-origin request required'},{status:403});
  if(process.env.ENABLE_FULL_UNIVERSE!=='true')return Response.json({error:'Full-universe research is disabled'},{status:503});
  if(Number(request.headers.get('content-length'))>1024)return Response.json({error:'Request too large'},{status:413});
  let body;try{body=input.parse(await request.json());}catch{return Response.json({error:'Use a JSON object with limit between 1 and 8.'},{status:400});}
  try{return Response.json(await refreshResearchBatch(body.limit),{headers:{'Cache-Control':'private, no-store'}});}catch{return Response.json({error:'Research batch unavailable; retry later.'},{status:503,headers:{'Retry-After':'60'}});}
}
