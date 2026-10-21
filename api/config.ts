import { configuration, json, type Request, type Response } from '../server/http.ts';
export default function handler(req: Request, res: Response) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return json(res, 405, {error:'Método não permitido.'}); }
  const config = configuration();
  // Only a publishable key is ever returned. This endpoint has no service-role credential.
  return json(res, 200, config ? {configured:true,url:config.url,publishableKey:config.key} : {configured:false});
}
