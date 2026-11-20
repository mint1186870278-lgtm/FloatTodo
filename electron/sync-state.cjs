const { randomUUID } = require('node:crypto');
const fields = ['title','notes','dueDate','groupId','status'];
const pick = t => Object.fromEntries(fields.map(k => [k,t[k]]));
const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
function normalize(s){for(const key of ['sections','labels','sync_links','conflicts'])Object.setPrototypeOf(s[key],null);if(s.contexts)Object.setPrototypeOf(s.contexts,null);return s;}
function initialSync() { return normalize({version:1,accountId:null,enabled:false,writesApproved:false,projectId:null,sections:{},labels:{},sync_links:{},sync_outbox:[],conflicts:{},ignored:[],setup:[],syncToken:'*',lastSync:null,retryAt:0,failures:0}); }
function validateSync(s) {
  if(s===undefined)return undefined;
  const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
  if(!s||s.version!==1||typeof s.enabled!=='boolean'||!Array.isArray(s.sync_outbox)||!['sections','labels','sync_links','conflicts'].every(k=>object(s[k]))||!Array.isArray(s.setup)||!Array.isArray(s.ignored)||typeof s.syncToken!=='string'||!Number.isFinite(s.retryAt)||!Number.isSafeInteger(s.failures))throw new Error('同步数据损坏，已停止以保护任务');
  if(s.sync_outbox.length>100000)throw new Error('同步队列过大');
  if(s.excludedLocalIds!==undefined&&(!Array.isArray(s.excludedLocalIds)||!s.excludedLocalIds.every(id=>typeof id==='string')))throw new Error('项目隔离记录损坏');
  if(s.contexts!==undefined){if(!object(s.contexts))throw new Error('项目上下文损坏');for(const [id,context] of Object.entries(s.contexts)){if(!object(context)||context.contexts!==undefined||context.projectId!==id)throw new Error('项目上下文损坏');validateSync(context);}}
  for(const o of s.sync_outbox)if(!object(o)||typeof o.id!=='string'||typeof o.localTaskId!=='string'||!object(o.snapshot)||(o.commands!==null&&!Array.isArray(o.commands)))throw new Error('同步队列损坏');
  return normalize(structuredClone(s));
}
// Called inside the same transaction as local task mutations, before any network work.
function captureLocal(before,after) {
  const s=after.sync;if(!s?.accountId)return;normalize(s);
  for(const t of after.tasks){
    const old=before.tasks.find(x=>x.id===t.id),link=s.sync_links[t.id];
    if((!old&&s.writesApproved&&!link?.tombstone&&!s.excludedLocalIds?.includes(t.id))||(link&&!link.tombstone)){
      if(!old||!equal(pick(old),pick(t)))s.sync_outbox.push({id:randomUUID(),localTaskId:t.id,snapshot:pick(t),createdAt:new Date().toISOString(),commands:null});
    }
  }
  for(const t of before.tasks)if(!after.tasks.some(x=>x.id===t.id)&&s.sync_links[t.id]){
    s.sync_links[t.id].tombstone=true;
    s.conflicts[t.id]={kind:'local-delete',local:t,remote:s.sync_links[t.id].base,message:'本地已删除；云端任务保留。解除关联后可继续。'};
  }
}
class ConflictResolver {
  static merge(base,local,remote){
    const merged={...local},conflicts=[];
    for(const k of fields){if(local[k]!==base[k]&&remote[k]!==base[k]&&local[k]!==remote[k])conflicts.push(k);else if(remote[k]!==base[k])merged[k]=remote[k];}
    return {merged,fields:conflicts};
  }
}
module.exports={initialSync,validateSync,captureLocal,ConflictResolver,pick,equal,fields,normalize};
