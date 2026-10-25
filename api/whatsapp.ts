import { timingSafeEqual } from 'node:crypto';
import { extractMessages, persistMessages, verifySignature, type InboxMessage } from '../server/whatsapp.ts';

const headers = {'Cache-Control':'no-store','Content-Type':'text/plain; charset=utf-8'};
const reply = (status: number, text: string) => new Response(text,{status,headers});
const limit = 256 * 1024;

async function readBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const {done,value} = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) { await reader.cancel(); throw new RangeError('Payload too large'); }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally { reader.releaseLock(); }
}

export function makeHandler({env = process.env, persist = persistMessages}: {
  env?: NodeJS.ProcessEnv;
  persist?: (messages: InboxMessage[], env: NodeJS.ProcessEnv) => Promise<void>;
} = {}) {
  return async (request: Request): Promise<Response> => {
    if (!['GET','POST'].includes(request.method)) return new Response('Method not allowed',{status:405,headers:{...headers,Allow:'GET, POST'}});
    if (env.WHATSAPP_WEBHOOK_ENABLED !== 'true') return reply(503,'WhatsApp integration is not enabled');
    if (request.method === 'GET') {
      const params = new URL(request.url).searchParams;
      const expected = env.WHATSAPP_VERIFY_TOKEN;
      if (!expected || expected.length < 32) return reply(503,'Webhook verification is not configured');
      const supplied = params.get('hub.verify_token') || '';
      const a = Buffer.from(expected), b = Buffer.from(supplied);
      if (params.get('hub.mode') !== 'subscribe' || a.length !== b.length || !timingSafeEqual(a,b)) return reply(403,'Verification failed');
      const challenge = params.get('hub.challenge');
      if (!challenge || challenge.length > 512) return reply(400,'Invalid challenge');
      return reply(200,challenge);
    }
    const secret = env.WHATSAPP_APP_SECRET, phoneId = env.WHATSAPP_PHONE_NUMBER_ID, sender = env.WHATSAPP_TEST_SENDER;
    if (!secret || !phoneId || !/^\d{5,20}$/.test(phoneId) || !sender || !/^\d{7,15}$/.test(sender)) return reply(503,'Webhook reception is not configured');
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return reply(415,'Expected JSON');
    if (Number(request.headers.get('content-length')) > limit) return reply(413,'Payload too large');
    let raw: Buffer;
    try { raw = await readBody(request); }
    catch (error) { return reply(error instanceof RangeError ? 413 : 400,'Cannot read payload'); }
    if (!verifySignature(raw,request.headers.get('x-hub-signature-256'),secret)) return reply(403,'Invalid signature');
    let messages: InboxMessage[];
    try { messages = extractMessages(JSON.parse(raw.toString('utf8')),phoneId,sender); }
    catch { return reply(400,'Invalid payload'); }
    if (!messages.length) return reply(200,'EVENT_RECEIVED');
    try { await persist(messages,env); }
    catch { return reply(503,'Inbox temporarily unavailable'); }
    // Acknowledge only after durable storage. No replies or task mutations happen here.
    return reply(200,'EVENT_RECEIVED');
  };
}

export default {fetch:makeHandler()};
