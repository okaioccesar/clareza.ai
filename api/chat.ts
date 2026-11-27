/**
 * Assistant endpoint. The OpenAI key stays on the server; the endpoint only returns a
 * proposal, which the browser validates and the person applies.
 */
import { createClient } from '@supabase/supabase-js';
import { json, sameOrigin, type Request, type Response } from '../server/http.ts';
import { assistantPrompt, sanitizeContext, sanitizeHistory } from '../server/assistant.ts';

const MAX_BODY = 120_000;
const MAX_MESSAGE = 4000;
const RATE_LIMIT = 12; // messages per minute per account
const WINDOW = 60_000;

const PROVIDER_ERRORS: Record<number, string> = {
  401: 'Não foi possível autorizar a conexão com a OpenAI. Verifique a configuração do servidor.',
  403: 'Não foi possível autorizar a conexão com a OpenAI. Verifique a configuração do servidor.',
  429: 'O limite de uso da IA foi atingido. Verifique o saldo e os limites da API ou tente mais tarde.',
};

interface Options {
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  now?: () => number;
  clientFactory?: (
    url: string,
    key: string,
    options: object,
  ) => {
    auth: {
      getUser(
        token: string,
      ): Promise<{ data: { user: { id: string; is_anonymous?: boolean } | null }; error?: unknown }>;
    };
  };
}

export function makeHandler({
  fetchImpl = globalThis.fetch,
  env = process.env,
  now = Date.now,
  clientFactory = createClient as never,
}: Options = {}) {
  const limits = new Map<string, { start: number; count: number }>();

  function rateLimited(user: string, stamp: number): boolean {
    const prior = limits.get(user);
    const fresh = !prior || stamp - prior.start >= WINDOW;
    if (!fresh && prior.count >= RATE_LIMIT) return true;
    limits.set(user, fresh ? { start: stamp, count: 1 } : { start: prior.start, count: prior.count + 1 });
    if (limits.size > 1000) for (const [key, value] of limits) if (stamp - value.start >= WINDOW) limits.delete(key);
    return false;
  }

  return async function handler(req: Request, res: Response) {
    const token = env.OPENAI_API_KEY;
    if (req.method === 'GET') return json(res, 200, { configured: !!token });
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return json(res, 405, { error: 'Método não permitido.' });
    }
    if (!sameOrigin(req)) return json(res, 403, { error: 'Esta solicitação precisa vir do próprio aplicativo.' });
    if (!String(req.headers['content-type'] || '').includes('application/json'))
      return json(res, 415, { error: 'Envie uma mensagem no formato JSON.' });
    if (!token)
      return json(res, 503, { error: 'A conversa com IA ainda não foi ativada. Configure a API para conversar.' });

    let body: { message?: unknown; context?: unknown; history?: unknown };
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body as typeof body);
      if (Buffer.byteLength(JSON.stringify(body || {})) > MAX_BODY)
        return json(res, 413, { error: 'O contexto excedeu o limite. Reduza a mensagem.' });
    } catch {
      return json(res, 400, { error: 'Mensagem inválida.' });
    }
    if (!body || typeof body.message !== 'string' || !body.message.trim() || body.message.length > MAX_MESSAGE)
      return json(res, 400, { error: 'Escreva uma mensagem com até 4.000 caracteres.' });

    const authorization = req.headers.authorization || '';
    if (!/^Bearer \S+$/i.test(authorization) || authorization.length > 16000)
      return json(res, 401, { error: 'Entre na sua conta para conversar com a IA.' });
    if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY)
      return json(res, 503, { error: 'O acesso à conta ainda não está configurado.' });

    let userId: string;
    try {
      const client = clientFactory(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: {
          fetch: (url: string, options: RequestInit) =>
            fetchImpl(url, { ...options, signal: AbortSignal.timeout(8000) }),
        },
      });
      const result = await client.auth.getUser(authorization.slice(7));
      if (result.error || !result.data?.user || result.data.user.is_anonymous)
        return json(res, 401, { error: 'Sua sessão expirou. Entre novamente para conversar.' });
      userId = result.data.user.id;
    } catch {
      return json(res, 503, { error: 'Não foi possível verificar sua conta. Tente novamente.' });
    }

    const stamp = now();
    if (rateLimited(userId, stamp))
      return json(res, 429, { error: 'Aguarde um minuto antes de enviar mais mensagens.' });

    const context = sanitizeContext(body.context, new Date(stamp).toISOString().slice(0, 10));
    try {
      const upstream = await fetchImpl('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(24000),
        body: JSON.stringify({
          model: env.OPENAI_MODEL || 'gpt-4.1-mini',
          messages: [
            { role: 'system', content: assistantPrompt(context) },
            ...sanitizeHistory(body.history),
            { role: 'user', content: body.message },
          ],
          response_format: { type: 'json_object' },
          max_completion_tokens: 1800,
          store: false,
          temperature: 0.3,
        }),
      });
      if (!upstream.ok)
        return json(res, upstream.status === 429 ? 429 : 503, {
          error:
            PROVIDER_ERRORS[upstream.status] ?? 'A IA online não está disponível agora. Tente novamente em instantes.',
        });
      const data = await upstream.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.length > 30000)
        return json(res, 502, { error: 'A IA não retornou uma proposta válida. Tente novamente.' });
      let proposal: { message?: unknown; actions?: unknown };
      try {
        proposal = JSON.parse(content);
      } catch {
        return json(res, 502, { error: 'A IA retornou um formato inválido. Tente novamente.' });
      }
      if (typeof proposal.message !== 'string' || !Array.isArray(proposal.actions) || proposal.actions.length > 20)
        return json(res, 502, { error: 'A IA não retornou uma proposta válida. Tente novamente.' });
      return json(res, 200, { message: proposal.message.slice(0, 6000), actions: proposal.actions });
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      return json(res, timedOut ? 504 : 502, {
        error: 'Não foi possível receber a resposta da IA. Tente novamente em instantes.',
      });
    }
  };
}

export default makeHandler();
