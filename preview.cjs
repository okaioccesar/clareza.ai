const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'dist');
const routes={'/api/config':'./api/config.ts','/api/workspace':'./api/workspace.ts','/api/chat':'./api/chat.js','/api/whatsapp':'./api/whatsapp.ts'};
function createServer(){
  return http.createServer(async(req,res)=>{
    try{
      const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      if(routes[name]){
        let size=0;const chunks=[];
        for await(const chunk of req){size+=chunk.length;if(size>2*1024*1024+65536){res.writeHead(413,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:'O espaço excede o limite de envio.'}))}chunks.push(chunk)}
        if(chunks.length)req.body=Buffer.concat(chunks).toString('utf8');
        const handler=(await import(routes[name])).default;
        if(typeof handler.fetch==='function'){
          const method=req.method||'GET';
          const request=new Request(new URL(req.url,'http://localhost'),{method,headers:req.headers,body:['GET','HEAD'].includes(method)?undefined:Buffer.concat(chunks)});
          const response=await handler.fetch(request);
          res.writeHead(response.status,Object.fromEntries(response.headers));
          return res.end(Buffer.from(await response.arrayBuffer()));
        }
        return await handler(req,res);
      }
      const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
      if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end()}
      fs.readFile(file,(error,data)=>{
        if(error){res.writeHead(404);return res.end('Not found')}
        const extension=path.extname(file),types={'.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.json':'application/json','.html':'text/html; charset=utf-8'};
        res.setHeader('Content-Type',types[extension]||'application/octet-stream');res.end(data);
      });
    }catch{if(!res.headersSent)res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Não foi possível atender a solicitação.'}))}
  });
}
if(require.main===module){
  const envFile=path.join(__dirname,'.env.local');if(fs.existsSync(envFile))process.loadEnvFile(envFile);
  createServer().listen(4187,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:4187'));
}
module.exports={createServer};
