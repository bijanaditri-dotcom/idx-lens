/** Bounded HTTPS fetch: redirects are rejected; URLs are server-configured, never user input. */
export class UpstreamHttpError extends Error { constructor(public status:number,public retryAfterSeconds:number){super(`Upstream HTTP ${status}`);} }
export async function fetchBounded(url: string, options: RequestInit = {}, maxBytes = 3_000_000): Promise<string> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('Only credential-free HTTPS upstream URLs are allowed');
  const response = await fetch(url, { ...options, redirect: 'manual', signal: AbortSignal.timeout(7000), headers: { Accept: 'application/json', ...options.headers } });
  // Workers supports manual/follow only. Manual keeps redirects blocked on every target.
  if (!response.ok) {const seconds=Number(response.headers.get('Retry-After'));throw new UpstreamHttpError(response.status,Number.isFinite(seconds)&&seconds>0?Math.min(seconds,86400):3600);}
  if (Number(response.headers.get('content-length')) > maxBytes) throw new Error('Upstream body too large');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Missing upstream body');
  const parts: Uint8Array[] = []; let size = 0;
  try { while (true) { const {done,value} = await reader.read(); if (done) break; size += value.byteLength; if (size > maxBytes) throw new Error('Upstream body too large'); parts.push(value); } }
  finally { await reader.cancel().catch(()=>{}); }
  const bytes = new Uint8Array(size); let at=0; for (const part of parts) {bytes.set(part,at);at+=part.byteLength;}
  return new TextDecoder().decode(bytes);
}
export async function jsonUpstream(url: string, options: RequestInit = {}) { return JSON.parse(await fetchBounded(url,options)); }
