(function(root){
 const id=()=>globalThis.crypto.randomUUID();
 const dateKey=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
 const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&dateKey(new Date(s+'T12:00:00'))===s;
 const text=(s,n)=>typeof s==='string'?s.slice(0,n):'',array=a=>Array.isArray(a)?a:[],unique=a=>[...new Map(a.map(x=>[x.id,x])).values()];
 function normalize(raw){
  if(!raw||typeof raw!=='object'||!Array.isArray(raw.tasks))throw new Error('Escolha uma exportação válida do Clareza.');
  const projects=unique(array(raw.projects).filter(p=>p&&typeof p.id==='string'&&typeof p.title==='string').map(p=>({id:p.id,title:text(p.title,200),description:text(p.description,2000),color:['blue','green','orange','rose','purple'].includes(p.color)?p.color:'blue',archived:!!p.archived})));
  const pages=unique(array(raw.pages).filter(p=>p&&typeof p.id==='string'&&typeof p.title==='string').map(p=>({id:p.id,title:text(p.title,200),projectId:projects.some(x=>x.id===p.projectId)?p.projectId:'',favorite:!!p.favorite,updatedAt:typeof p.updatedAt==='string'&&!Number.isNaN(Date.parse(p.updatedAt))?p.updatedAt:'',blocks:unique(array(p.blocks).slice(0,1000).filter(b=>b&&typeof b==='object').map(b=>({id:typeof b.id==='string'?b.id:id(),type:['text','heading','check','quote','divider'].includes(b.type)?b.type:'text',text:text(b.text,20000),checked:!!b.checked})))})));
  const tasks=unique(raw.tasks.filter(t=>t&&typeof t.id==='string'&&typeof t.title==='string').map(t=>({id:t.id,title:text(t.title,200),notes:text(t.notes,2000),date:validDate(t.date)?t.date:'',priority:t.priority==='high'?'high':'normal',status:t.done||t.status==='done'?'done':t.status==='doing'?'doing':'todo',done:!!t.done||t.status==='done',projectId:projects.some(p=>p.id===t.projectId)?t.projectId:'',pinned:!!t.pinned,completedAt:typeof t.completedAt==='string'&&!Number.isNaN(Date.parse(t.completedAt))?t.completedAt:null,createdAt:text(t.createdAt,50)})));
  const daily={};if(raw.daily&&typeof raw.daily==='object')Object.entries(raw.daily).filter(([k])=>validDate(k)).forEach(([k,v])=>daily[k]=text(v,5000));
  return {version:2,tasks,projects,pages,daily,scratch:text(raw.scratch,20000)};
 }
 function weekDates(offset=0,now=new Date()){const d=new Date(now.getFullYear(),now.getMonth(),now.getDate(),12);d.setDate(d.getDate()-((d.getDay()+6)%7)+offset*7);return Array.from({length:7},(_,i)=>{const day=new Date(d);day.setDate(day.getDate()+i);return dateKey(day)})}
 function merge(existing,incoming){return normalize({tasks:unique([...incoming.tasks,...existing.tasks]),projects:unique([...incoming.projects,...existing.projects]),pages:unique([...incoming.pages,...existing.pages]),daily:{...incoming.daily,...existing.daily},scratch:existing.scratch||incoming.scratch})}
 const api={id,dateKey,validDate,normalize,weekDates,merge};root.Clareza=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
