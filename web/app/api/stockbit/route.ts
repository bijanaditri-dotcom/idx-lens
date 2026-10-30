import { getChatGPTUser } from '@/app/chatgpt-auth';
import { parseStockbitCsv,readStockbitSnapshots,saveStockbitSnapshots } from '@/lib/server/stockbit-import';
import { UNIVERSE } from '@/lib/demo';
export const dynamic='force-dynamic';
export async function GET(){const user=await getChatGPTUser();if(!user)return Response.json({error:'Sign in with ChatGPT to manage your snapshots'},{status:401});try{const snapshots=await readStockbitSnapshots(user.userId);return Response.json({symbols:snapshots.map(s=>s.symbol),count:snapshots.length},{headers:{'Cache-Control':'private, no-store'}});}catch{return Response.json({error:'Import storage is unavailable'},{status:503});}}
export async function POST(request:Request){
  const user=await getChatGPTUser();if(!user)return Response.json({error:'Sign in with ChatGPT to import Stockbit snapshots'},{status:401});
  if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Same-origin request required'},{status:403});
  if(!request.headers.get('content-type')?.includes('application/json'))return Response.json({error:'JSON body required'},{status:415});
  try{
    if(Number(request.headers.get('content-length'))>180000)return Response.json({error:'Upload exceeds 180 KB'},{status:413});
    const reader=request.body?.getReader();if(!reader)return Response.json({error:'Missing upload body'},{status:400});
    const parts:Uint8Array[]=[];let bytes=0;try{while(true){const r=await reader.read();if(r.done)break;bytes+=r.value.byteLength;if(bytes>180000)return Response.json({error:'Upload exceeds 180 KB'},{status:413});parts.push(r.value);}}finally{await reader.cancel().catch(()=>{});}
    const joined=new Uint8Array(bytes);let offset=0;for(const part of parts){joined.set(part,offset);offset+=part.byteLength;}const text=new TextDecoder().decode(joined);
    const input=JSON.parse(text);if(typeof input.csv!=='string')return Response.json({error:'CSV text is required'},{status:400});
    const snapshots=parseStockbitCsv(input.csv),allowed=new Set<string>(UNIVERSE.map(s=>s[0]));
    if(snapshots.some(s=>!allowed.has(s.symbol)))return Response.json({error:'Import only tickers available in the configured dashboard universe'},{status:400});
    await saveStockbitSnapshots(user.userId,snapshots);return Response.json({ok:true,tickers:snapshots.map(s=>s.symbol),message:`Saved ${snapshots.length} Stockbit snapshots`},{headers:{'Cache-Control':'no-store'}});
  }catch(error){const message=error instanceof Error?error.message:'Import failed';if(message.includes('storage')||message.includes('D1')||message.includes('SQL'))return Response.json({error:'Persistent import storage is unavailable'},{status:503});return Response.json({error:message.slice(0,240)},{status:400});}
}
