// Owner-requested pause. Set false and redeploy only when the owner asks to resume.
export const dashboardPaused = false;

export function pauseResponse(request: Request): Response {
  const path = new URL(request.url).pathname;
  const headers = { 'Cache-Control': 'no-store', 'Retry-After': '86400', 'X-IDX-Lens-Paused': 'true' };
  if (path.startsWith('/api/') || path === '/mcp' || path.startsWith('/mcp/')) {
    return Response.json({ paused: true, error: 'IDX Lens is paused by its owner. All data fetching, scanning, and research updates are disabled. Saved data is retained.' }, { status: 503, headers });
  }
  return new Response(`<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>IDX Lens — Dijeda</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#080d20;color:#e7edff;font:17px/1.6 system-ui,sans-serif}main{max-width:520px;margin:24px;padding:36px;border:1px solid #293758;border-radius:24px;background:#121c35}h1{margin-top:0;color:#9cebdc}p{margin-bottom:0}</style><main><h1>IDX Lens dijeda</h1><p>Pemindaian saham, pengambilan harga, fundamental, berita, dan pembaruan riset sedang dihentikan. Data yang sudah tersimpan tetap dipertahankan.</p></main></html>`, { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
}
