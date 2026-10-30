export async function GET() { return Response.json({status:'ok',service:'idx-lens',timestamp:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}}); }
