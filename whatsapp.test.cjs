const test=require('node:test');
const assert=require('node:assert/strict');
const {createHmac}=require('node:crypto');
const {makeHandler}=require('./api/whatsapp.ts');
const {verifySignature,extractMessages}=require('./server/whatsapp.ts');

const env={WHATSAPP_WEBHOOK_ENABLED:'true',WHATSAPP_VERIFY_TOKEN:'test-verification-token-with-32-characters',WHATSAPP_APP_SECRET:'test-secret',WHATSAPP_PHONE_NUMBER_ID:'123456789',WHATSAPP_TEST_SENDER:'5511999999999'};
const message={id:'wamid.test',from:env.WHATSAPP_TEST_SENDER,type:'text',text:{body:'Estudar amanhã'}};
function payload(messages=[message],phoneId=env.WHATSAPP_PHONE_NUMBER_ID){
  return {object:'whatsapp_business_account',entry:[{changes:[{field:'messages',value:{metadata:{phone_number_id:phoneId},messages}}]}]};
}
function request(data=payload(),options={}){
  const body=typeof data==='string'?data:JSON.stringify(data);
  const signature='sha256='+createHmac('sha256',env.WHATSAPP_APP_SECRET).update(body).digest('hex');
  return new Request('https://clarity.example/api/whatsapp',{method:'POST',body,headers:{'content-type':'application/json','x-hub-signature-256':signature,...options}});
}

test('webhook fica desligado por padrão e exige token correto para verificação',async()=>{
  assert.equal((await makeHandler({env:{}})(new Request('https://clarity.example/api/whatsapp'))).status,503);
  const handle=makeHandler({env});
  const url=new URL('https://clarity.example/api/whatsapp');
  url.search=new URLSearchParams({'hub.mode':'subscribe','hub.challenge':'12345','hub.verify_token':env.WHATSAPP_VERIFY_TOKEN});
  const response=await handle(new Request(url));
  assert.equal(response.status,200);assert.equal(await response.text(),'12345');
  url.searchParams.set('hub.verify_token','wrong');
  assert.equal((await handle(new Request(url))).status,403);
});

test('HMAC valida os bytes originais e rejeita assinatura ausente, malformada ou adulterada',async()=>{
  const handle=makeHandler({env,persist:()=>assert.fail('não deve gravar')});
  for(const signature of ['', 'sha256=abc', 'sha256='+'0'.repeat(64)]){
    assert.equal((await handle(request(payload(),{'x-hub-signature-256':signature}))).status,403);
  }
  const raw=Buffer.from('texto');
  const signature='sha256='+createHmac('sha256',env.WHATSAPP_APP_SECRET).update(raw).digest('hex');
  assert.equal(verifySignature(raw,signature,env.WHATSAPP_APP_SECRET),true);
  assert.equal(verifySignature(Buffer.from('texto '),signature,env.WHATSAPP_APP_SECRET),false);
});

test('recepção aguarda armazenamento durável, minimiza dados e remove duplicatas do lote',async()=>{
  let stored,release;
  const saved=new Promise(resolve=>{release=resolve});
  const handle=makeHandler({env,persist:async messages=>{stored=messages;await saved}});
  let responded=false;
  const pending=handle(request(payload([{...message,contacts:[{name:'private'}]},message]))).then(response=>{responded=true;return response});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(responded,false);assert.equal(stored.length,1);
  assert.equal(stored[0].body,'Estudar amanhã');
  assert.doesNotMatch(JSON.stringify(stored),/private|contacts/);
  release();assert.equal((await pending).status,200);
});

test('falha no banco permite reentrega sem expor erros ou segredos',async()=>{
  const response=await makeHandler({env,persist:async()=>{throw Error('private database detail')}})(request());
  assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/private database detail|test-secret/);
});

test('piloto ignora outro remetente, outro número receptor e eventos de status',async()=>{
  const handle=makeHandler({env,persist:()=>assert.fail('não deve gravar')});
  for(const data of [payload([{...message,from:'5511888888888'}]),payload([message],'987654321'),payload([])]){
    assert.equal((await handle(request(data))).status,200);
  }
  const messages=extractMessages(payload([{...message,type:'audio',audio:{id:'private-media'}}]),env.WHATSAPP_PHONE_NUMBER_ID,env.WHATSAPP_TEST_SENDER);
  assert.equal(messages[0].status,'unsupported');assert.equal(messages[0].body,null);
});

test('webhook recusa corpo grande, JSON inválido e mensagens malformadas',async()=>{
  const handle=makeHandler({env,persist:()=>assert.fail('não deve gravar')});
  assert.equal((await handle(request('x'.repeat(256*1024+1)))).status,413);
  assert.equal((await handle(request('{invalid'))).status,400);
  assert.equal((await handle(request(payload([{...message,text:{body:5}}])))).status,400);
  assert.equal((await handle(request(payload(),{'content-type':'text/plain'}))).status,415);
  assert.equal((await handle(new Request('https://clarity.example/api/whatsapp',{method:'DELETE'}))).status,405);
});

test('preview encaminha o webhook Web Request sem quebrar os bytes',async t=>{
  const {createServer}=require('./preview.cjs');
  const server=createServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const result=await fetch(`http://127.0.0.1:${server.address().port}/api/whatsapp`);
  assert.equal(result.status,503);
  assert.equal(await result.text(),'WhatsApp integration is not enabled');
});
