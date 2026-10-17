const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(stored,systemDark=false,storageUnavailable=false) {
  const events={},picker={value:''},root={dataset:{},style:{}},writes=[];
  const media={matches:systemDark,addEventListener(name,fn){events.media=fn}};
  const document={documentElement:root,querySelector:()=>({setAttribute(){}}),querySelectorAll:()=>[picker],addEventListener(name,fn){events[name]=fn}};
  const window={matchMedia:()=>media,addEventListener(name,fn){events[name]=fn}};
  const localStorage={getItem(){if(storageUnavailable)throw Error('blocked');return stored},setItem(key,value){if(storageUnavailable)throw Error('blocked');writes.push([key,value])}};
  vm.runInNewContext(fs.readFileSync('./dist/theme.js','utf8'),{window,document,localStorage});
  return {events,picker,root,media,writes};
}
test('tema salvo é aplicado antes da página carregar e persiste mudança manual',()=>{
  const env=setup('dark');assert.equal(env.root.dataset.theme,'dark');assert.equal(env.root.style.colorScheme,'dark');
  env.events.change({target:{matches:()=>true,value:'light'}});
  assert.equal(env.root.dataset.theme,'light');assert.deepEqual(env.writes,[['clareza.theme','light']]);
});
test('modo sistema acompanha o sistema e a preferência é sincronizada entre abas',()=>{
  const env=setup('system',true);assert.equal(env.root.dataset.theme,'dark');
  env.media.matches=false;env.events.media();assert.equal(env.root.dataset.theme,'light');
  env.events.storage({key:'clareza.theme',newValue:'dark'});assert.equal(env.root.dataset.theme,'dark');
  env.media.matches=false;env.events.media();assert.equal(env.root.dataset.theme,'dark');
});
test('tema funciona mesmo quando o navegador bloqueia o armazenamento',()=>{
  const env=setup(null,false,true);assert.equal(env.root.dataset.theme,'light');
  env.events.change({target:{matches:()=>true,value:'dark'}});assert.equal(env.root.dataset.theme,'dark');
});
