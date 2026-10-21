import type { IncomingMessage, ServerResponse } from 'node:http';

export type Request = IncomingMessage & { body?: unknown };
export type Response = ServerResponse;
export function json(res: Response, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Vary', 'Authorization');
  res.end(JSON.stringify(body));
}
export function sameOrigin(req: Request) {
  if (!req.headers.origin) return true;
  try { const url = new URL(req.headers.origin); return ['https:', 'http:'].includes(url.protocol) && url.host === req.headers.host; }
  catch { return false; }
}
export function configuration(env: NodeJS.ProcessEnv = process.env) {
  const url = env.SUPABASE_URL || '', key = env.SUPABASE_PUBLISHABLE_KEY || '';
  try { if (new URL(url).protocol !== 'https:' || !key.startsWith('sb_publishable_')) return null; }
  catch { return null; }
  return { url, key };
}
