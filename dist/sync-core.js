(function(root){
  const D=root.Clareza||(typeof require==='function'?require('./domain.js'):null);
  const empty=()=>D.normalize({tasks:[]});
  const equal=(a,b)=>JSON.stringify(D.normalize(a))===JSON.stringify(D.normalize(b));
  function parseCache(raw){
    if(!raw)return null;
    const record=JSON.parse(raw);
    if(record.format!==1||!Number.isSafeInteger(record.revision)||record.revision<0||typeof record.writeId!=='string')throw Error('A cópia local desta conta não pôde ser lida. Ela foi preservada.');
    return {...record,data:D.normalize(record.data),dirty:!!record.dirty};
  }
  function reconcile(remote,cache){
    if(!remote||!Number.isSafeInteger(remote.revision)||remote.revision<0)throw Error('A conta retornou uma versão inválida.');
    const data=remote.data?D.normalize(remote.data):empty();
    if(cache?.dirty&&!equal(cache.data,data)){
      if(cache.revision===remote.revision)return {data:cache.data,revision:remote.revision,dirty:true,conflict:false};
      return {data:cache.data,revision:cache.revision,dirty:true,conflict:true};
    }
    return {data,revision:remote.revision,dirty:false,conflict:false};
  }
  const hasContent=data=>data.tasks.length||data.projects.length||data.pages.length||data.areas.length||Object.values(data.daily).some(Boolean)||!!data.scratch.trim();
  const api={empty,equal,parseCache,reconcile,hasContent};root.ClarezaSync=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
