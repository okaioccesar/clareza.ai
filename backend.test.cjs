const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const D=require('./dist/domain.js');
const modules=Promise.all([import('./api/workspace.ts'),import('./server/workspace.ts')]);
const env={SUPABASE_URL:'https://test.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'};
const body=()=>({data:D.normalize({tasks:[{id:'a',title:'Minha tarefa'}]}),revision:0,writeId:crypto.randomUUID()});
async function request(handler,overrides={}){
  let data;const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},end(text){data=JSON.parse(text)}};
  await handler({method:'GET',headers:{host:'clareza.example',origin:'https://clareza.example',authorization:'Bearer private-user-token','content-type':'application/json'},...overrides},res);
  return {status:res.statusCode,headers:res.headers,body:data};
}
function factory({authError=false,rpcData={revision:0,data:null},rpcError=null}={}){
  const calls=[];const clientFactory=(url,key,options)=>({auth:{getUser:async token=>{calls.push({token});return {data:{user:authError?null:{id:'owner',email:'test@example.invalid'}},error:authError?Error('expired'):null}}},rpc:async(name,args)=>{calls.push({name,args});return {data:rpcData,error:rpcError}}});
  return {calls,clientFactory};
}
test('API recusa ausência de login, origem externa e método incompatível',async()=>{
  const [{makeHandler}]=await modules,stub=factory(),handler=makeHandler({env,clientFactory:stub.clientFactory});
  assert.equal((await request(handler,{headers:{host:'clareza.example'}})).status,401);
  assert.equal((await request(handler,{headers:{host:'clareza.example',origin:'https://evil.example'}})).status,403);
  assert.equal((await request(handler,{method:'DELETE'})).status,405);assert.equal(stub.calls.length,0);
});
test('API valida o token no servidor e não consulta dados com sessão expirada',async()=>{
  const [{makeHandler}]=await modules,stub=factory({authError:true});const result=await request(makeHandler({env,clientFactory:stub.clientFactory}));
  assert.equal(result.status,401);assert.equal(stub.calls.length,1);assert.doesNotMatch(JSON.stringify(result),/private-user-token/);
});
test('API salva somente no contexto autenticado e ignora proprietário fornecido pelo cliente',async()=>{
  const [{makeHandler}]=await modules,stub=factory({rpcData:{status:'ok',revision:1}}),input={...body(),user_id:'victim'};
  const result=await request(makeHandler({env,clientFactory:stub.clientFactory}),{method:'PUT',body:input});
  assert.equal(result.status,200);assert.equal(result.body.user.id,'owner');assert.equal(stub.calls[1].name,'write_account_workspace');
  assert.deepEqual(Object.keys(stub.calls[1].args).sort(),['expected_revision','payload','write_id']);assert.equal(stub.calls[1].args.payload.tasks[0].title,'Minha tarefa');assert.equal(result.headers['Cache-Control'],'private, no-store');
});
test('gravação desatualizada retorna conflito e falha interna não revela detalhes do banco',async()=>{
  const [{makeHandler}]=await modules,conflict=factory({rpcData:{status:'conflict',revision:3,data:D.normalize({tasks:[]})}});
  assert.equal((await request(makeHandler({env,clientFactory:conflict.clientFactory}),{method:'PUT',body:body()})).status,409);
  const failure=factory({rpcError:{message:'private database details'}}),result=await request(makeHandler({env,clientFactory:failure.clientFactory}));
  assert.equal(result.status,503);assert.doesNotMatch(JSON.stringify(result),/private database details/);
});
test('validação rejeita formato incompleto, revisão inválida e espaço acima do limite',async()=>{
  const [,{validateWrite}]=await modules;assert.throws(()=>validateWrite({data:{tasks:[]},revision:0,writeId:crypto.randomUUID()}));
  assert.throws(()=>validateWrite({...body(),revision:-1}));assert.throws(()=>validateWrite({...body(),writeId:'fake'}));
  const input=body();input.data.scratch='x'.repeat(2*1024*1024);assert.throws(()=>validateWrite(input),/2 MB/);
});
test('sem configuração, API mantém um erro explícito e não inicia conexão',async()=>{
  const [{makeHandler}]=await modules,stub=factory();const result=await request(makeHandler({env:{},clientFactory:stub.clientFactory}));assert.equal(result.status,503);assert.equal(stub.calls.length,0);
});
