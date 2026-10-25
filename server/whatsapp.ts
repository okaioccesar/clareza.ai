import { createHmac, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export type InboxMessage = {
  phone_number_id: string;
  message_id: string;
  sender: string;
  message_type: string;
  body: string | null;
  status: 'pending' | 'unsupported';
};

export function verifySignature(raw: Uint8Array, signature: string | null, secret: string) {
  if (!secret || !signature || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac('sha256',secret).update(raw).digest();
  return timingSafeEqual(expected,Buffer.from(signature.slice(7),'hex'));
}

// Only text and identifiers are retained; contacts, media and the full payload are not stored.
export function extractMessages(payload: unknown, phoneId: string, testSender: string): InboxMessage[] {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid payload');
  const root = payload as Record<string, unknown>;
  if (root.object !== 'whatsapp_business_account' || !Array.isArray(root.entry)) throw new Error('Invalid object');
  const messages = new Map<string, InboxMessage>();
  for (const entry of root.entry) {
    if (!entry || !Array.isArray(entry.changes)) continue;
    for (const change of entry.changes) {
      const value = change?.value;
      if (change?.field !== 'messages' || value?.metadata?.phone_number_id !== phoneId || !Array.isArray(value.messages)) continue;
      for (const message of value.messages) {
        if (message?.from !== testSender) continue;
        if (typeof message.id !== 'string' || !message.id || message.id.length > 512) throw new Error('Invalid message');
        const isText = message.type === 'text';
        if (isText && (typeof message.text?.body !== 'string' || !message.text.body.trim() || message.text.body.length > 4096)) throw new Error('Invalid text');
        messages.set(message.id,{
          phone_number_id:phoneId, message_id:message.id, sender:testSender,
          message_type:typeof message.type === 'string' ? message.type.slice(0,50) : 'unknown',
          body:isText ? message.text.body : null,
          status:isText ? 'pending' : 'unsupported'
        });
      }
    }
  }
  return [...messages.values()];
}

export async function persistMessages(messages: InboxMessage[], env: NodeJS.ProcessEnv) {
  const url = env.SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Inbox unavailable');
  const client = createClient(url,key,{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    global:{fetch:(input,options)=>fetch(input,{...options,signal:AbortSignal.timeout(8000)})}
  });
  const {error} = await client.from('whatsapp_inbox').upsert(messages,{
    onConflict:'phone_number_id,message_id',ignoreDuplicates:true
  });
  if (error) throw new Error('Inbox unavailable');
}
