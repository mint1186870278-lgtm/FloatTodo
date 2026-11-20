const {randomUUID}=require('node:crypto');
const path=require('node:path');
const {atomicWrite}=require('./store.cjs');
const {validateState,applyCommand}=require('./model.cjs');
function check(ok,message){if(!ok){const e=new Error(message);e.safeMessage=message;throw e;}}
const {initialSync,pick,equal,ConflictResolver}=require('./sync-state.cjs');
const {TodoistClient,ApiError,schema}=require('./todoist-client.cjs');
const now=()=>new Date().toISOString();
const command=(type,args,add=false)=>({type,uuid:randomUUID(),...(add?{temp_id:randomUUID()}:{}),args});
class SyncEngine {
  constructor(store,credentials,notify=()=>{},clientFactory=t=>new TodoistClient(t)){this.store=store;this.credentials=credentials;this.notify=notify;this.clientFactory=clientFactory;this.client=null;this.error='';this.busy=false;this.tail=Promise.resolve();this.epoch=0;this.preview=null;this.projects=[];}
  status(){const s=this.store.state.sync||initialSync();return{connected:!!this.client,enabled:s.enabled,setupPending:s.setup.length>0,account:s.accountId?`账户 …${s.accountId.slice(-4)}`:'',projectId:s.projectId,projectName:s.projectName||this.projects.find(p=>p.id===s.projectId)?.name||'',projects:this.projects,lastSync:s.lastSync,busy:this.busy,queued:s.sync_outbox.length,retryAt:s.retryAt,error:this.error,preview:this.preview?this.preview.public:null,conflicts:Object.entries(s.conflicts).map(([id,c])=>({id,kind:c.kind,message:c.message,...(c.kind==='edit'?{fields:c.fields,local:c.local,remote:c.remote}:{})})),sections:s.sections};}
  publish(){this.notify(this.status());}
  exclusive(fn){const p=this.tail.then(async()=>{this.busy=true;this.publish();try{const r=await fn();this.error='';this.busy=false;return r?.connected!==undefined?this.status():r;}catch(e){this.error=e instanceof ApiError?e.message:(e.safeMessage||'同步未完成，数据已保留；请重试或重新连接');throw new Error(this.error);}finally{this.busy=false;this.publish();}});this.tail=p.catch(()=>{});return p;}
  async tx(fn){return this.store.serial(async()=>{const next=this.store.snapshot();next.sync??=initialSync();await fn(next,next.sync);validateState(next);if(Object.keys(next.sync.conflicts).some(k=>!this.store.state.sync?.conflicts[k]))await atomicWrite(path.join(this.store.dir,`before-sync-detected-conflict-${Date.now()}-${randomUUID()}.json`),this.store.state);next.revision++;await this.store.commit(next);});}
  async backup(reason){await this.store.serial(()=>atomicWrite(path.join(this.store.dir,`before-sync-${reason}-${Date.now()}-${randomUUID()}.json`),this.store.state));}
  async init(){try{const token=await this.credentials.load();if(token)this.client=this.clientFactory(token);}catch(e){this.error=e.message;}this.timer=setInterval(()=>{const s=this.store.state.sync;if(this.client&&s?.enabled&&!this.busy&&Date.now()>s.retryAt)this.sync().catch(()=>{});},45000);this.timer.unref?.();this.publish();}
  stop(){this.disconnecting=true;clearInterval(this.timer);this.client?.stop();}
  async connect(token,confirmed){return this.exclusive(async()=>{
    check(confirmed===true,'需要在本机确认授权');check(typeof token==='string'&&token.length>=20&&token.length<=512&&!/\s/.test(token),'Token 格式无效');
    check(!this.client,'请先断开当前账户');this.disconnecting=false;await this.credentials.available();const client=this.clientFactory(token);const m=await client.metadata();
    check(typeof m.user?.id==='string'&&Array.isArray(m.projects)&&Array.isArray(m.labels),'账户响应异常');
    const previous=this.store.state.sync;check(!previous?.accountId||previous.accountId===m.user.id,'此数据目录已关联另一账户，请使用独立目录');
    await this.backup('connect');await this.credentials.save(token);this.client=client;
    await this.tx((_n,s)=>{s.accountId=m.user.id;s.enabled=false;s.retryAt=0;for(const label of m.labels)if(['floattodo-pending','floattodo-cancelled'].includes(label.name))s.labels[label.name]={id:label.id,name:label.name};});
    await this.makePreview(m);return this.status();
  });}
  async disconnect(){this.epoch++;this.disconnecting=true;this.client?.stop();return this.exclusive(async()=>{await this.backup('disconnect');await this.credentials.clear();this.client=null;this.preview=null;await this.tx((_n,s)=>{s.enabled=false;s.writesApproved=false;});return this.status();});}
  async resumeSetup(confirmed){return this.exclusive(async()=>{check(this.client&&confirmed===true&&this.store.state.sync.setup.length,'需要确认重试已授权的项目配置');await this.flushSetup();await this.makePreview();return this.status();});}
  async listProjects(){return this.exclusive(async()=>{check(this.client,'尚未连接');const m=await this.client.metadata();this.setProjects(m);return this.status();});}
  setProjects(m){check(Array.isArray(m.projects)&&m.projects.every(p=>typeof p.id==='string'&&typeof p.name==='string'),'项目列表响应异常');this.projects=m.projects.filter(p=>!p.is_deleted&&!p.is_archived&&!p.inbox_project&&!p.is_inbox_project).map(p=>({id:p.id,name:p.name}));return this.projects;}
  checkSwitch(s){check(!s.sync_outbox.length,'仍有待发送任务，请先完成旧项目同步后再切换');check(!s.setup.length,'仍有未完成的项目配置，请先处理后再切换');}
  async discover(projectId){return this.exclusive(async()=>{check(this.client,'尚未连接');check(projectId===undefined||(typeof projectId==='string'&&projectId.length>0&&projectId.length<=200),'项目 ID 无效');await this.makePreview(undefined,projectId);return this.status();});}
  async makePreview(metadata,requestedId){
    const m=metadata||await this.client.metadata(),s=this.store.state.sync;
    const projects=this.setProjects(m),selectedId=requestedId||s.projectId;
    let project=selectedId?projects.find(p=>p.id===selectedId):null;
    if(selectedId&&!project&&!s.setup.length)throw new ApiError('PROJECT_UNAVAILABLE');
    if(!project){const candidates=projects.filter(p=>p.name==='FloatTodo');check(candidates.length<=1,'存在多个同名项目，请先在 Todoist 中确认');project=candidates[0];}
    const switching=!!(s.projectId&&project&&s.projectId!==project.id);
    if(switching)this.checkSwitch(s);
    const context=switching?(s.contexts&&Object.hasOwn(s.contexts,project.id)?s.contexts[project.id]:initialSync()):s;
    const sections=project?await this.client.sections(project.id):[];
    const active=project?await this.client.tasks(project.id):[];
    const completed=project?await this.client.completed(project.id,new Date(Date.now()-89*86400000).toISOString(),now()):[];
    const remote=[...active,...completed.filter(t=>!active.some(a=>a.id===t.id)).map(t=>({...t,checked:true}))];
    check(remote.every(t=>t.project_id===project.id),'项目范围响应异常');
    const rows=remote.map(t=>({id:t.id,title:t.content,kind:Object.values(context.sync_links).some(l=>l.todoistTaskId===t.id)?'linked':'remote',sameName:this.store.state.tasks.some(x=>x.title===t.content)}));
    const locals=switching?[]:this.store.state.tasks.filter(t=>!context.sync_links[t.id]&&!context.excludedLocalIds?.includes(t.id)).map(t=>({id:t.id,title:t.title,kind:'local'}));
    const needs= this.store.state.groups.filter(g=>!context.sections[g.id]&&!sections.some(r=>r.name===g.name));
    this.preview={project,sections,remote,metadata:m,switching,fromProjectId:s.projectId,revision:JSON.stringify({groups:this.store.state.groups,tasks:this.store.state.tasks}),public:{id:randomUUID(),switching,project:project?{id:project.id,name:project.name}:null,remote:rows,local:locals,missingSections:needs.map(g=>g.name),matches:rows.filter(r=>r.sameName).length,conflicts:Object.keys(context.conflicts).length}};
  }
  async confirm(input){return this.exclusive(async()=>{
    check(this.client&&this.preview&&input.previewId===this.preview.public.id,'预览已过期，请重新预览');check(input.allowWrites===true,'必须确认云端写入');
    check(this.preview.revision===JSON.stringify({groups:this.store.state.groups,tasks:this.store.state.tasks}),'本地数据已变化，请重新预览');
    const p=this.preview;check(Array.isArray(input.importIds)&&Array.isArray(input.uploadIds),'请选择同步项');
    check(p.fromProjectId===this.store.state.sync.projectId,'当前项目已变化，请重新预览');
    if(p.switching){this.checkSwitch(this.store.state.sync);check(input.uploadIds.length===0,'切换项目时不允许上传原有本地任务');}
    check(input.importIds.every(id=>p.remote.some(t=>t.id===id))&&input.uploadIds.every(id=>p.public.local.some(t=>t.id===id)),'选择无效');
    await this.backup('first-confirm');
    // Re-query immediately before setup to avoid duplicate projects created by another client.
    const latest=await this.client.metadata();if(p.project){check(latest.projects.some(x=>x.id===p.project.id&&!x.is_deleted&&!x.is_archived),'目标项目已不可用，请重新预览');}else{const found=latest.projects.filter(x=>x.name==='FloatTodo'&&!x.is_deleted&&!x.is_archived);check(found.length<=1,'同名项目不唯一');if(found[0]){await this.makePreview(latest);throw new ApiError('PREVIEW_CHANGED');}}
    if(p.switching)await this.tx((n,s)=>{
      this.checkSwitch(s);check(s.projectId===p.fromProjectId,'当前项目已变化，请重新预览');
      check(p.revision===JSON.stringify({groups:n.groups,tasks:n.tasks}),'本地数据已变化，请重新预览');
      const contexts=Object.assign(Object.create(null),structuredClone(s.contexts||{})),old=structuredClone(s);delete old.contexts;contexts[s.projectId]=old;
      const next=structuredClone(Object.hasOwn(contexts,p.project.id)?contexts[p.project.id]:initialSync());delete contexts[p.project.id];
      check(!next.sync_outbox.length&&!next.setup.length,'目标项目上下文仍有未完成命令');
      Object.assign(next,{accountId:s.accountId,projectId:p.project.id,projectName:p.project.name,contexts,enabled:false,writesApproved:false,excludedLocalIds:[...new Set([...(next.excludedLocalIds||[]),...n.tasks.filter(t=>!next.sync_links[t.id]).map(t=>t.id)])]});
      n.sync=next;
    });
    await this.tx((n,s)=>{
      s.projectName=p.project?.name||'FloatTodo';s.rootGroupId=n.groups.find(g=>g.id==='work')?.id||n.groups[0]?.id;
      if(!s.setup.length){
        let projectId=p.project?.id||s.projectId;
        if(!projectId){const c=command('project_add',{name:'FloatTodo'},true);s.setup.push({command:c,kind:'project'});projectId=c.temp_id;}
        s.projectId=projectId;
        for(const g of n.groups){let mapping=s.sections[g.id];if(!mapping){const matches=p.sections.filter(r=>r.name===g.name);check(matches.length<=1,'同名分组不唯一');if(matches[0])mapping={id:matches[0].id,name:matches[0].name};else{const c=command('section_add',{name:g.name,project_id:projectId},true);s.setup.push({command:c,kind:'section',localId:g.id});mapping={id:c.temp_id,name:g.name};}s.sections[g.id]=mapping;}}
        for(const name of ['floattodo-pending','floattodo-cancelled'])if(!s.labels[name]){const existing=latest.labels.find(l=>l.name===name);if(existing)s.labels[name]={id:existing.id,name};else{const c=command('label_add',{name},true);s.setup.push({command:c,kind:'label',localId:name});s.labels[name]={id:c.temp_id,name};}}
      }
    });
    await this.flushSetup();
    await this.tx((n,s)=>{
      for(const t of p.remote){if(input.importIds.includes(t.id)&&!Object.values(s.sync_links).some(l=>l.todoistTaskId===t.id))this.importRemote(n,s,t);else if(!input.importIds.includes(t.id)&&!s.ignored.includes(t.id))s.ignored.push(t.id);}
      for(const id of input.uploadIds){const t=n.tasks.find(t=>t.id===id);if(t&&!s.sync_outbox.some(o=>o.localTaskId===id))s.sync_outbox.push({id:randomUUID(),localTaskId:id,snapshot:pick(t),commands:null});}
      s.excludedLocalIds=[...new Set([...(s.excludedLocalIds||[]),...n.tasks.filter(t=>!s.sync_links[t.id]&&!input.uploadIds.includes(t.id)).map(t=>t.id)])];
      s.enabled=true;s.writesApproved=true;s.syncToken=p.switching?'*':p.metadata.sync_token||'*';s.retryAt=0;
    });this.preview=null;
    await this.runSync();return this.status();
  });}
  async flushSetup(){const setup=this.store.state.sync.setup;if(!setup.length)return;const commands=setup.map(x=>x.command);const response=await this.client.sync(this.store.state.sync.syncToken,commands);this.validateCommands(response,commands);await this.tx((_n,s)=>{for(const entry of s.setup){const id=response.temp_id_mapping?.[entry.command.temp_id];check(typeof id==='string','缺少远端 ID，保留 UUID 待重试');if(entry.kind==='project')s.projectId=id;if(entry.kind==='section')s.sections[entry.localId].id=id;if(entry.kind==='label')s.labels[entry.localId].id=id;}s.setup=[];});}
  validateCommands(r,commands){
    if(!r?.sync_status||typeof r.sync_status!=='object'||Array.isArray(r.sync_status))throw schema('/api/v1/sync',200,'sync_status','object');
    if(typeof r.sync_token!=='string'||!r.sync_token)throw schema('/api/v1/sync',200,'sync_token','non-empty string');
    for(const c of commands){
      if(!Object.hasOwn(r.sync_status,c.uuid))throw schema('/api/v1/sync',200,'sync_status[command]','command result required');
      const result=r.sync_status[c.uuid];
      if(result!=='ok')throw new ApiError(`COMMAND_${Number.isInteger(result?.error_code)?result.error_code:'UNKNOWN'}`,0,{path:'/api/v1/sync',httpStatus:200});
    }
  }
  remoteValue(s,t){
    check(typeof t.id==='string'&&typeof t.content==='string'&&t.content.trim().length>0&&t.content.length<=500&&typeof(t.description??'')==='string'&&(t.description||'').length<=10000,'远端任务超出本地模型限制');
    const group=t.section_id?Object.entries(s.sections).find(([,m])=>m.id===t.section_id)?.[0]:s.rootGroupId;check(group,'远端任务没有已映射分组');
    const labels=t.labels||[];const pending=s.labels['floattodo-pending']?.name||'floattodo-pending',cancelled=s.labels['floattodo-cancelled']?.name||'floattodo-cancelled';
    check(!(labels.includes(pending)&&labels.includes(cancelled)),'远端存在互斥状态标签');
    const dueDate=t.due?.date?.slice(0,10)||'';
    return{title:t.content,notes:t.description||'',dueDate,groupId:group,status:t.checked||t.is_completed?'completed':labels.includes(cancelled)?'cancelled':labels.includes(pending)?'pending':'todo'};
  }
  importRemote(n,s,t){
    try{const v=this.remoteValue(s,t),r=applyCommand(n,{type:'add',...v});const task=r.state.tasks.at(-1);Object.assign(task,v);n.tasks.push(task);s.sync_links[task.id]={todoistTaskId:t.id,projectId:s.projectId,sectionId:t.section_id,base:pick(task),remote:t,updatedAt:now(),localRevision:n.revision,remoteRevision:t.updated_at,tombstone:false};}
    catch{ s.conflicts[`remote:${t.id}`]={kind:'unsupported',remoteId:t.id,message:'远端任务无分组、状态标签冲突或内容超出本地限制，请在 Todoist 调整后重试。'}; }
  }
  async pull(){
    const s=this.store.state.sync;const delta=await this.client.sync(s.syncToken);
    if(typeof delta.sync_token!=='string'||!delta.sync_token)throw schema('/api/v1/sync',200,'sync_token','non-empty string');
    for(const field of ['projects','sections','labels','items'])if(!(field==='items'&&delta.items===undefined)&&!Array.isArray(delta[field]))throw schema('/api/v1/sync',200,field,'array');
    // A full sync omits archived completed tasks. Missing entries never imply deletion.
    const active=await this.client.tasks(s.projectId);
    check(active.every(t=>t.project_id===s.projectId),'项目范围响应异常');
    const until=now(),since=new Date(Math.max(Date.now()-89*86400000,(Date.parse(s.lastSync)||Date.now()-86400000)-86400000)).toISOString();
    const completed=await this.client.completed(s.projectId,since,until);
    check(completed.every(t=>t.project_id===s.projectId),'完成记录项目范围异常');
    const map=new Map(completed.filter(t=>!active.some(a=>a.id===t.id)).map(t=>[t.id,{...t,checked:true}]));
    for(const t of active)map.set(t.id,t);
    for(const t of delta.items||[])if(t.project_id===s.projectId||Object.values(s.sync_links).some(l=>l.todoistTaskId===t.id))map.set(t.id,t);
    const items=[...map.values()];
    await this.tx((n,s)=>{
      const project=delta.projects.find(p=>p.id===s.projectId);
      if(project&&(project.is_deleted||project.is_archived)){s.enabled=false;s.conflicts.project={kind:'project',message:'云端项目已删除或归档，停止同步并保留本地数据。'};return;}
      for(const section of delta.sections.filter(r=>r.project_id===s.projectId)){
        const entry=Object.entries(s.sections).find(([,m])=>m.id===section.id);
        if(section.is_deleted||section.is_archived){if(entry){s.sections[entry[0]].unavailable=true;s.conflicts[`section:${section.id}`]={kind:'section',message:'云端分组已归档或删除，请恢复后重试，或解除相关任务关联。'};}continue;}
        if(entry){s.sections[entry[0]].name=section.name;s.sections[entry[0]].unavailable=false;delete s.conflicts[`section:${section.id}`];}
        else{const matches=n.groups.filter(g=>g.name===section.name&&!s.sections[g.id]);if(matches.length===1)s.sections[matches[0].id]={id:section.id,name:section.name};else{let name=section.name.slice(0,32);if(n.groups.some(g=>g.name.toLowerCase()===name.toLowerCase()))name+=` ${section.id.slice(-5)}`;if(n.groups.length<100){const id=randomUUID();n.groups.push({id,name,collapsed:false});s.sections[id]={id:section.id,name:section.name};}}}
      }
      for(const label of delta.labels)for(const m of Object.values(s.labels))if(m.id===label.id&&!label.is_deleted)m.name=label.name;
      for(const t of items){
        const pair=Object.entries(s.sync_links).find(([,l])=>l.todoistTaskId===t.id);
        if(pair){const [id,l]=pair,local=n.tasks.find(x=>x.id===id);if(l.tombstone||s.conflicts[id]||!local)continue;
          if(t.is_deleted||t.project_id!==s.projectId||t.is_archived){l.tombstone=true;s.conflicts[id]={kind:'remote-delete',local:pick(local),remote:t,message:'云端任务删除、归档或移出项目。保留本地，请解除关联。'};continue;}
          try{const remote=this.remoteValue(s,t),merged=ConflictResolver.merge(l.base,pick(local),remote);
            if(merged.fields.length){s.conflicts[id]={kind:'edit',fields:merged.fields,local:pick(local),remote,raw:t,message:'两端修改了同一字段，请选择保留版本。'};continue;}
            Object.assign(local,merged.merged);local.updatedAt=now();l.base=remote;l.remote=t;l.sectionId=t.section_id;l.updatedAt=now();l.remoteRevision=t.updated_at;l.localRevision=n.revision;
            const queued=s.sync_outbox.filter(o=>o.localTaskId===id);if(queued.some(o=>o.commands))continue;
            s.sync_outbox=s.sync_outbox.filter(o=>o.localTaskId!==id);
            if(!equal(pick(local),remote))s.sync_outbox.push({id:randomUUID(),localTaskId:id,snapshot:pick(local),commands:null});
          }catch{s.conflicts[id]={kind:'unsupported',local:pick(local),remote:t,message:'远端字段无法无损映射，暂停此任务同步。'};}
        }else if(t.project_id===s.projectId&&!t.is_deleted&&!s.ignored.includes(t.id)){delete s.conflicts[`remote:${t.id}`];this.importRemote(n,s,t);}
      }
      for(const [id,l] of Object.entries(s.sync_links))if(!l.tombstone&&!s.conflicts[id]&&l.base.status!=='completed'&&!items.some(t=>t.id===l.todoistTaskId))s.conflicts[id]={kind:'unavailable',message:'云端活动任务与完成记录均未找到此任务，已暂停写入并保留本地。请核查后解除关联。'};
      s.syncToken=delta.sync_token;
    });
  }
  async prepare(entry){await this.tx((n,s)=>{
    const o=s.sync_outbox.find(x=>x.id===entry.id);if(!o||o.commands)return;
    const t=n.tasks.find(t=>t.id===o.localTaskId),l=s.sync_links[o.localTaskId];if(!t)return;
    const section=s.sections[o.snapshot.groupId];check(section,'本地分组尚未映射，请重新预览确认创建分组');if(section.unavailable)return;
    if(l?.remote?.due?.is_recurring&&o.snapshot.status!==l.base.status){s.conflicts[t.id]={kind:'unsupported',message:'重复任务完成请在 Todoist 操作，以保留重复规则。'};return;}
    if(l?.remote?.due&&(l.remote.due.is_recurring||l.remote.due.date?.includes('T'))&&o.snapshot.dueDate!==l.base.dueDate){s.conflicts[t.id]={kind:'unsupported',message:'带时间或重复规则的日期请在 Todoist 修改，已保留云端特殊字段。'};return;}
    const v=o.snapshot,commands=[];let id=l?.todoistTaskId;
    const labels=(l?.remote?.labels||[]).filter(x=>!Object.values(s.labels).some(m=>m.name===x));
    if(v.status==='pending')labels.push(s.labels['floattodo-pending'].name);if(v.status==='cancelled')labels.push(s.labels['floattodo-cancelled'].name);
    const args={content:v.title,description:v.notes,labels};
    if(!l||v.dueDate!==l.base.dueDate)args.due=v.dueDate?{date:v.dueDate}:null;
    if(!id){const c=command('item_add',{...args,project_id:s.projectId,section_id:section.id},true);commands.push(c);id=c.temp_id;o.temp_id=id;}
    else{
      if(l.base.status==='completed'&&v.status!=='completed')commands.push(command('item_uncomplete',{id}));
      commands.push(command('item_update',{id,...args}));
      if(v.groupId!==l.base.groupId)commands.push(command('item_move',{id,section_id:section.id}));
    }
    if(v.status==='completed'&&(!l||l.base.status!=='completed'))commands.push(command('item_complete',{id}));
    o.commands=commands;
  });}
  async flush(replayOnly=false){
    for(const original of [...this.store.state.sync.sync_outbox]){
      const s=this.store.state.sync;if(!s.enabled||this.disconnecting)return;
      if(replayOnly&&!original.commands)continue;
      if(s.conflicts[original.localTaskId]||s.sync_links[original.localTaskId]?.tombstone)continue;
      if(!this.store.state.tasks.some(t=>t.id===original.localTaskId))continue;
      await this.prepare(original);const entry=this.store.state.sync.sync_outbox.find(x=>x.id===original.id);if(!entry?.commands)continue;
      // Validate membership immediately before every mutation; moved tasks are never written.
      const link=this.store.state.sync.sync_links[entry.localTaskId];
      if(link&&link.projectId!==this.store.state.sync.projectId)throw new ApiError('SCOPE');
      if(link){
        const project=this.store.state.sync.projectId;
        const active=await this.client.tasks(project);
        const completed=active.some(t=>t.id===link.todoistTaskId)?[]:await this.client.completed(project,new Date(Date.now()-89*86400000).toISOString(),now());
        if(![...active,...completed].some(t=>t.id===link.todoistTaskId&&t.project_id===project&&!t.is_deleted&&!t.is_archived)){
          await this.tx((_n,s)=>{s.conflicts[entry.localTaskId]={kind:'unavailable',message:'发送前发现任务不在专用项目范围，已暂停并保留本地。'};});continue;
        }
      }
      const response=await this.client.sync(this.store.state.sync.syncToken,entry.commands);this.validateCommands(response,entry.commands);
      await this.tx((n,s)=>{
        const id=entry.temp_id?response.temp_id_mapping?.[entry.temp_id]:s.sync_links[entry.localTaskId]?.todoistTaskId;check(typeof id==='string','缺少任务映射，保留 UUID 待重试');
        const old=s.sync_links[entry.localTaskId];const v=entry.snapshot;
        s.sync_links[entry.localTaskId]={...old,todoistTaskId:id,projectId:s.projectId,sectionId:s.sections[v.groupId].id,base:v,remote:{...old?.remote,id,project_id:s.projectId,section_id:s.sections[v.groupId].id,content:v.title,description:v.notes,due:v.dueDate?{...old?.remote?.due,date:v.dueDate}:null,checked:v.status==='completed',labels:entry.commands.find(c=>['item_add','item_update'].includes(c.type)).args.labels},updatedAt:now(),localRevision:n.revision,tombstone:false};
        s.sync_outbox=s.sync_outbox.filter(o=>o.id!==entry.id);
        // Do not advance the pull cursor on writes: concurrent remote changes must still be read.
      });
    }
  }
  async runSync(){
    check(this.client&&this.store.state.sync?.enabled,'请先确认只读预览');
    check(Date.now()>=this.store.state.sync.retryAt,'正在退避，请等待显示的重试时间');
    try{
      // Replay uncertain sent commands with the same UUID before comparing remote state.
      if(this.store.state.sync.sync_outbox.some(o=>o.commands))await this.flush(true);
      await this.pull();if(this.store.state.sync.enabled)await this.flush();
      await this.tx((_n,s)=>{s.lastSync=now();s.failures=0;s.retryAt=0;});
    }catch(e){await this.tx((_n,s)=>{s.failures++;s.retryAt=Date.now()+Math.max(e.retryAfter||0,Math.min(900000,15000*2**Math.min(s.failures-1,6)));if(e.status===401||e.status===403)s.enabled=false;});throw e;}
  }
  sync(){return this.exclusive(async()=>{await this.runSync();return this.status();});}
  resolve(id,choice){return this.exclusive(async()=>{
    check(['local','remote','unlink'].includes(choice),'冲突选项无效');await this.backup('conflict');
    await this.tx((n,s)=>{const c=s.conflicts[id];check(c,'冲突不存在');
      const t=n.tasks.find(t=>t.id===id),link=s.sync_links[id];
      if(choice==='unlink'){if(link)link.tombstone=true;if(c.remoteId&&!s.ignored.includes(c.remoteId))s.ignored.push(c.remoteId);}
      else{check(c.kind==='edit'&&t&&link,'此冲突请解除关联，或先在 Todoist 修复');link.base=c.remote;link.remote=c.raw;if(choice==='remote')Object.assign(t,c.remote);}
      s.sync_outbox=s.sync_outbox.filter(o=>o.localTaskId!==id);
      if(choice==='local')s.sync_outbox.push({id:randomUUID(),localTaskId:id,snapshot:pick(t),commands:null});delete s.conflicts[id];
    });return this.status();
  });}
}
module.exports={SyncEngine};
