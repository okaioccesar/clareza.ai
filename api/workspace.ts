import { createClient } from '@supabase/supabase-js';
import { configuration, json, sameOrigin, type Request, type Response } from '../server/http.ts';
import { validateWrite } from '../server/workspace.ts';

export function makeHandler({ env = process.env, clientFactory = createClient } = {}) {
  return async function handler(req: Request, res: Response) {
    if (!['GET','PUT'].includes(req.method || '')) { res.setHeader('Allow','GET, PUT'); return json(res,405,{error:'Método não permitido.'}); }
    if (!sameOrigin(req)) return json(res,403,{error:'Use o próprio aplicativo para salvar o espaço.'});
    const config = configuration(env);
    if (!config) return json(res,503,{error:'As contas ainda não estão configuradas. Seu espaço local continua disponível.'});
    const authorization = req.headers.authorization || '';
    if (!/^Bearer \S+$/i.test(authorization) || authorization.length > 16000) return json(res,401,{error:'Entre na sua conta para sincronizar.'});
    const token = authorization.slice(7);
    try {
      const client = clientFactory(config.url,config.key,{
        auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
        global:{headers:{Authorization:`Bearer ${token}`},fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(15000)})}
      });
      const {data:auth,error:authError} = await client.auth.getUser(token);
      if (authError || !auth.user || auth.user.is_anonymous) return json(res,401,{error:'Sua sessão expirou. Entre novamente para sincronizar.'});
      let rpc;
      if (req.method === 'GET') rpc = await client.rpc('read_account_workspace');
      else {
        if (!String(req.headers['content-type']||'').includes('application/json')) return json(res,415,{error:'Envie o espaço em formato JSON.'});
        let write;
        try { write = validateWrite(typeof req.body === 'string' ? JSON.parse(req.body) : req.body); }
        catch (error) { return json(res,400,{error:error instanceof Error ? error.message : 'Dados inválidos.'}); }
        rpc = await client.rpc('write_account_workspace',{payload:write.data,expected_revision:write.revision,write_id:write.writeId});
      }
      if (rpc.error) return json(res,503,{error:'Não foi possível sincronizar agora. Suas alterações continuam neste navegador.'});
      const result = rpc.data;
      if (!result || typeof result !== 'object' || !Number.isSafeInteger(result.revision)) return json(res,502,{error:'O servidor retornou uma versão inválida do espaço.'});
      return json(res,result.status === 'conflict' ? 409 : 200,{...result,user:{id:auth.user.id,email:auth.user.email}});
    } catch { return json(res,503,{error:'Sem conexão com a conta. Suas alterações continuam neste navegador.'}); }
  };
}
export default makeHandler();
