import { finalizeDailyResearch,getFullMarket,refreshResearchBatch } from '@/lib/server/full-market';
import { z } from 'zod';
export const dynamic='force-dynamic';
const tools=[{name:'refresh_equity_batch',description:'Refresh the next eight due equities from the public KSEI registry using Yahoo price/statement data. Persists results; returns remaining count. Repeat until remaining is zero to complete the daily scan.',inputSchema:{type:'object',properties:{},additionalProperties:false}},{name:'save_daily_research',description:'Refresh open-publication sentiment, reassess stored equities, and persist a dated daily research shortlist. Return source coverage and distinguish BUY from incomplete research candidates.',inputSchema:{type:'object',properties:{},additionalProperties:false}},{name:'research_status',description:'Read catalog size, daily scan progress, public-source status and current research shortlist.',inputSchema:{type:'object',properties:{},additionalProperties:false}}];
const rpc=z.object({jsonrpc:z.literal('2.0'),id:z.union([z.string(),z.number()]).nullable().optional(),method:z.string(),params:z.record(z.unknown()).optional()});
export async function POST(request:Request){
  let message;try{message=rpc.parse(await request.json());}catch{return Response.json({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Invalid JSON-RPC request'}},{status:400});}
  const respond=(result:unknown)=>Response.json({jsonrpc:'2.0',id:message.id??null,result});
  if(message.method==='server/discover')return respond({supportedVersions:['2026-07-28'],capabilities:{tools:{}}});
  if(message.method==='initialize')return respond({protocolVersion:'2026-07-28',serverInfo:{name:'IDX Lens public research',version:'2.0.0'},capabilities:{tools:{}}});
  if(message.method==='notifications/initialized')return new Response(null,{status:204});
  if(message.method==='tools/list')return respond({tools});
  if(message.method==='tools/call'){
    const name=message.params?.name,args=message.params?.arguments??{};
    try{z.object({}).strict().parse(args);let result;
      if(name==='refresh_equity_batch')result=await refreshResearchBatch();
      else if(name==='save_daily_research')result=await finalizeDailyResearch();
      else if(name==='research_status'){const data=await getFullMarket();result={universe:data.universe,daily:data.daily,sources:data.sources};}
      else throw new Error('Unknown research tool');
      return respond({content:[{type:'text',text:JSON.stringify(result)}]});
    }catch{return respond({isError:true,content:[{type:'text',text:'Research operation unavailable or invalid arguments. No sample data substituted.'}]});}
  }
  return Response.json({jsonrpc:'2.0',id:message.id??null,error:{code:-32601,message:'Method not found'}});
}
