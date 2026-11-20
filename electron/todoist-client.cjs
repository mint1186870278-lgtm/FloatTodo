const BASE='https://api.todoist.com/api/v1/';
// Only fixed paths and allowlisted exception details may leave this module.
const routes=new Set(['sync','projects','sections','tasks','tasks/completed/by_completion_date']);
const safeType=e=>['Error','TypeError','SyntaxError','AbortError','TimeoutError','AggregateError'].includes(e?.name)?e.name:'Error';
const safeCode=e=>/^(?:E[A-Z0-9_]+|UND_ERR_[A-Z0-9_]+|CERT_[A-Z0-9_]+|DEPTH_ZERO_SELF_SIGNED_CERT|UNABLE_TO_[A-Z0-9_]+)$/.test(e?.code||'')?e.code:undefined;
class ApiError extends Error {
  constructor(status,retryAfter=0,details={}){
    const kind=typeof status==='number'?'HTTP':status;
    const auth=status===401?'Todoist 授权失效 (HTTP 401)':status===403?'Todoist 权限不足 (HTTP 403)':`Todoist 请求失败 (${kind}${typeof status==='number'?` ${status}`:''})`;
    const info=[details.path,details.exceptionType,details.causeCode,details.field&&`${details.field}: ${details.rule}`].filter(Boolean).join('; ');
    super(auth+(info?` [${info}]`:''));this.name='ApiError';this.status=status;this.retryAfter=retryAfter;
    this.diagnostic={kind,...details,...(typeof status==='number'?{httpStatus:status}:{})};
  }
}
const schema=(path,httpStatus,field,rule)=>new ApiError('SCHEMA',0,{path,httpStatus,field,rule});
class TodoistClient {
  constructor(token,fetcher=globalThis.fetch){this.token=token;this.fetcher=fetcher;this.controllers=new Set();}
  stop(){for(const c of this.controllers)c.abort();}
  async request(route,body){
    const u=new URL(route,BASE);if(u.origin!=='https://api.todoist.com'||!u.pathname.startsWith('/api/v1/'))throw new Error('拒绝非 Todoist 官方地址');
    const suffix=u.pathname.slice('/api/v1/'.length),path=routes.has(suffix)?u.pathname:'/api/v1/[redacted]';
    const c=new AbortController();this.controllers.add(c);let timedOut=false,httpStatus;
    const timer=setTimeout(()=>{timedOut=true;c.abort();},20000);
    try{
      const r=await this.fetcher(u.href,{method:body?'POST':'GET',redirect:'error',signal:c.signal,headers:{Authorization:`Bearer ${this.token}`,...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{})},...(body?{body:new URLSearchParams(body).toString()}:{})});
      httpStatus=r.status;
      if(!r.ok){const h=r.headers.get('retry-after');throw new ApiError(r.status,Math.max(0,Number(h)*1000||Date.parse(h)-Date.now()||0),{path});}
      let value;
      try{value=await r.json();}catch(e){if(e instanceof SyntaxError)throw new ApiError('SCHEMA',0,{path,httpStatus,exceptionType:'SyntaxError',field:'$',rule:'valid JSON'});throw e;}
      if(!value||typeof value!=='object'||Array.isArray(value))throw schema(path,httpStatus,'$','object');return value;
    }catch(e){if(e instanceof ApiError)throw e;throw new ApiError('NETWORK',0,{path,httpStatus,exceptionType:safeType(e),causeType:e.cause?safeType(e.cause):undefined,causeCode:timedOut?'ETIMEDOUT':safeCode(e.cause)||safeCode(e),...(c.signal.aborted?{aborted:timedOut?'timeout':'cancelled'}:{})});}
    finally{clearTimeout(timer);this.controllers.delete(c);}
  }
  async list(route,key='results'){const result=[];let cursor=null;const seen=new Set(),suffix=new URL(route,BASE).pathname.slice('/api/v1/'.length),path=routes.has(suffix)?`/api/v1/${suffix}`:'/api/v1/[redacted]';do{const sep=route.includes('?')?'&':'?';const v=await this.request(route+(cursor?`${sep}cursor=${encodeURIComponent(cursor)}`:''));if(!Array.isArray(v[key]))throw schema(path,200,key,'array');result.push(...v[key]);cursor=v.next_cursor;if(cursor!==null&&cursor!==undefined&&(typeof cursor!=='string'||!cursor))throw schema(path,200,'next_cursor','non-empty string or null');if(cursor&&seen.has(cursor))throw schema(path,200,'next_cursor','must not repeat');seen.add(cursor);if(result.length>20000)throw new ApiError('LIMIT');}while(cursor);return result;}
  async metadata(){const m=await this.request('sync',{sync_token:'*',resource_types:JSON.stringify(['user','projects','labels'])});return{...m,projects:await this.list('projects?limit=200')};}
  sections(project){return this.list(`sections?project_id=${encodeURIComponent(project)}`);}
  tasks(project){return this.list(`tasks?project_id=${encodeURIComponent(project)}`);}
  completed(project,since,until){return this.list(`tasks/completed/by_completion_date?${new URLSearchParams({project_id:project,since,until})}`,'items');}
  sync(token,commands=[]){return this.request('sync',{sync_token:token,resource_types:JSON.stringify(commands.length?[]:token==='*'?['projects','sections','labels']:['projects','sections','items','labels']),commands:JSON.stringify(commands)});}
}
module.exports={TodoistClient,ApiError,schema};
