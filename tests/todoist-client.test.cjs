const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path');
const {TodoistClient}=require('../electron/todoist-client.cjs');
const {SyncEngine}=require('../electron/sync-engine.cjs');
const {Store}=require('../electron/store.cjs');
const {FakeTodoist}=require('./helpers/fake-todoist.cjs');
const secret='fixture-secret-never-log';
const json=v=>new Response(JSON.stringify(v),{status:200,headers:{'Content-Type':'application/json'}});

test('v1 form POST, Bearer auth, scoped GETs and completed items pagination',async()=>{
  const calls=[],client=new TodoistClient(secret,async(url,options)=>{
    const u=new URL(url);calls.push({u,options});
    if(u.pathname.endsWith('/sync'))return json({sync_token:'cursor',projects:[],sections:[],labels:[]});
    return json({[u.pathname.includes('/completed/')?'items':'results']:[{id:'fixture'}],next_cursor:u.searchParams.has('cursor')?null:'page2'});
  });
  await client.sync('saved-cursor');await client.sync('saved-cursor',[{type:'item_add',uuid:'stable-uuid',args:{content:'fixture'}}]);
  for(const call of calls){assert.equal(call.u.origin,'https://api.todoist.com');assert.equal(call.u.pathname,'/api/v1/sync');assert.equal(call.options.method,'POST');assert.equal(call.options.redirect,'error');assert.equal(call.options.headers.Authorization,`Bearer ${secret}`);assert.equal(call.options.headers['Content-Type'],'application/x-www-form-urlencoded');}
  const form=new URLSearchParams(calls[0].options.body);assert.equal(form.get('sync_token'),'saved-cursor');assert.deepEqual(JSON.parse(form.get('resource_types')),['projects','sections','items','labels']);
  assert.deepEqual(JSON.parse(new URLSearchParams(calls[1].options.body).get('resource_types')),[]);
  assert.equal((await client.tasks('private-project')).length,2);
  assert.equal((await client.sections('private-project')).length,2);
  assert.equal((await client.completed('private-project','2026-10-01T00:00:00Z','2026-11-01T00:00:00Z')).length,2);
  for(const {u,options} of calls.slice(2)){assert.equal(options.method,'GET');assert.equal(u.searchParams.get('project_id'),'private-project');}
});

for(const code of ['ENOTFOUND','ECONNRESET','CERT_HAS_EXPIRED','UND_ERR_CONNECT_TIMEOUT'])test(`NETWORK retains ${code} without private messages`,async()=>{
  const cause=Object.assign(new Error(secret),{code});
  const client=new TodoistClient(secret,async()=>{throw new TypeError(secret,{cause});});
  await assert.rejects(client.tasks('private-project'),e=>{
    assert.equal(e.status,'NETWORK');assert.equal(e.diagnostic.exceptionType,'TypeError');assert.equal(e.diagnostic.causeCode,code);assert.equal(e.diagnostic.httpStatus,undefined);
    assert.equal(e.diagnostic.path,'/api/v1/tasks');assert.ok(!JSON.stringify(e).includes(secret));assert.ok(!e.message.includes(secret));assert.ok(!e.message.includes('private-project'));return true;
  });
});

test('timeout and explicit cancellation are distinguishable; controllers are released',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const client=new TodoistClient(secret,async(_url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new DOMException(secret,'AbortError')),{once:true})));
  const timeout=assert.rejects(client.tasks('p'),e=>e.status==='NETWORK'&&e.diagnostic.causeCode==='ETIMEDOUT'&&e.diagnostic.aborted==='timeout');
  t.mock.timers.tick(20000);await timeout;assert.equal(client.controllers.size,0);
  const cancelled=assert.rejects(client.tasks('p'),e=>e.diagnostic.aborted==='cancelled');client.stop();await cancelled;assert.equal(client.controllers.size,0);
});

test('JSON syntax, root type, list field and cursor schema identify the failing rule',async()=>{
  const cases=[['{', '$','valid JSON'],['[]','$','object'],[JSON.stringify({results:'wrong'}),'results','array'],[JSON.stringify({results:[],next_cursor:42}),'next_cursor','non-empty string or null']];
  for(const [body,field,rule] of cases){const c=new TodoistClient(secret,async()=>new Response(body));await assert.rejects(c.tasks('p'),e=>e.status==='SCHEMA'&&e.diagnostic.httpStatus===200&&e.diagnostic.field===field&&e.diagnostic.rule===rule);}
  const repeat=new TodoistClient(secret,async()=>json({results:[],next_cursor:'private-cursor'}));
  await assert.rejects(repeat.tasks('p'),e=>e.diagnostic.field==='next_cursor'&&e.diagnostic.rule==='must not repeat'&&!e.message.includes('private-cursor'));
});

for(const status of [401,403,404,429,500,503])test(`HTTP ${status} is preserved even with non-JSON private body`,async()=>{
  const c=new TodoistClient(secret,async()=>new Response(secret,{status,headers:{'Retry-After':'120'}}));
  await assert.rejects(c.metadata(),e=>{assert.equal(e.status,status);assert.equal(e.diagnostic.kind,'HTTP');assert.equal(e.diagnostic.httpStatus,status);assert.equal(e.retryAfter,120000);assert.ok(!e.message.includes(secret));return true;});
});

test('Retry-After HTTP date is respected',async()=>{
  const until=new Date(Date.now()+180000).toUTCString();
  const c=new TodoistClient(secret,async()=>new Response('',{status:429,headers:{'Retry-After':until}}));
  await assert.rejects(c.metadata(),e=>e.retryAfter>178000&&e.retryAfter<=180000);
});

test('real client + engine mock integration preserves offline work, ordering and UUID replay across restart',async t=>{
  const root=path.resolve('artifacts/test-data');await fs.mkdir(root,{recursive:true});const dir=await fs.mkdtemp(path.join(root,'transport-'));
  const fake=new FakeTodoist(),requests=[];let failure=null,lose=false,malformed=null;
  const fetcher=async(url,options)=>{
    const u=new URL(url);requests.push({path:u.pathname,method:options.method});
    if(failure==='NETWORK')throw new TypeError('fetch failed',{cause:Object.assign(new Error(),{code:'ECONNRESET'})});
    if(typeof failure==='number')return new Response('private body',{status:failure,headers:{'Retry-After':'120'}});
    if(u.pathname.endsWith('/sync')){
      const form=new URLSearchParams(options.body),commands=JSON.parse(form.get('commands')||'[]');
      const response=form.get('resource_types').includes('user')?await fake.metadata():await fake.sync(form.get('sync_token'),commands);
      if(malformed)response[malformed]=null;
      if(lose&&commands.length){lose=false;throw new TypeError('lost response',{cause:Object.assign(new Error(),{code:'ECONNRESET'})});}
      return json(response);
    }
    const p=u.searchParams.get('project_id');return json(u.pathname.includes('/completed/')?{items:await fake.completed(p),next_cursor:null}:{results:u.pathname.endsWith('/sections')?await fake.sections(p):await fake.tasks(p),next_cursor:null});
  };
  const credentials={async available(){},async save(){},async load(){return secret;}};
  const factory=()=>new TodoistClient(secret,fetcher);const store=new Store(dir);await store.init();const engine=new SyncEngine(store,credentials,()=>{},factory);t.after(()=>engine.stop());
  await engine.connect(secret,true);await engine.confirm({previewId:engine.status().preview.id,importIds:[],uploadIds:[],allowWrites:true});
  for(const title of ['offline one','offline two'])await store.execute({type:'add',title});
  const before=store.snapshot(),cursor=before.sync.syncToken;
  for(const field of ['sync_token','projects','sections','labels','items']){
    malformed=field;await engine.tx((_n,s)=>{s.retryAt=0;});
    await assert.rejects(engine.sync(),new RegExp(`SCHEMA.*${field}:`));
    assert.equal(store.state.sync.syncToken,cursor);assert.deepEqual(store.state.tasks,before.tasks);assert.deepEqual(store.state.sync.sync_outbox,before.sync.sync_outbox);
  }
  malformed=null;await engine.tx((_n,s)=>{s.retryAt=0;});failure='NETWORK';await assert.rejects(engine.sync(),/NETWORK.*ECONNRESET/);
  assert.deepEqual(store.state.tasks,before.tasks);assert.equal(store.state.sync.syncToken,cursor);assert.equal(store.state.sync.sync_outbox.length,2);
  const count=requests.length;await assert.rejects(engine.sync());assert.equal(requests.length,count);
  failure=null;const restored=new Store(dir);await restored.init();const resumed=new SyncEngine(restored,credentials,()=>{},factory);t.after(()=>resumed.stop());await resumed.init();
  await resumed.tx((_n,s)=>{s.retryAt=0;});lose=true;await assert.rejects(resumed.sync());const uuid=restored.state.sync.sync_outbox[0].commands[0].uuid;assert.equal(fake.rows.length,1);
  await resumed.tx((_n,s)=>{s.retryAt=0;});await resumed.sync();assert.equal(fake.rows.length,2);assert.equal(restored.state.sync.sync_outbox.length,0);assert.ok(fake.calls.filter(cs=>cs.some(c=>c.uuid===uuid)).length>=2);
  assert.deepEqual(restored.state.tasks.map(x=>[x.id,x.order]),before.tasks.map(x=>[x.id,x.order]));
  for(const status of [429,503,401,403]){
    await resumed.tx((_n,s)=>{s.enabled=true;s.retryAt=0;});failure=status;await assert.rejects(resumed.sync(),new RegExp(`HTTP ${status}`));
    assert.ok(restored.state.sync.retryAt-Date.now()>119000);assert.equal(restored.state.sync.enabled,![401,403].includes(status));assert.equal(resumed.status().connected,true);
  }
  await restored.execute({type:'add',title:'offline after permission failure'});
  assert.equal(restored.state.sync.sync_outbox.length,1);
  assert.equal(fake.rows.length,2);
});

test('sync response field validation is precise and does not expose command UUIDs',()=>{
  const engine=new SyncEngine({},{}),commands=[{uuid:'private-uuid'}];
  for(const [value,field] of [[{},'sync_status'],[{sync_status:{},sync_token:null},'sync_token'],[{sync_status:{},sync_token:'cursor'},'sync_status[command]']]){
    assert.throws(()=>engine.validateCommands(value,commands),e=>e.status==='SCHEMA'&&e.diagnostic.field===field&&!e.message.includes('private-uuid'));
  }
});
