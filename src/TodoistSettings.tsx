import React,{useEffect,useState} from 'react';
import type {SyncStatus} from './types';
import './sync.css';
export function TodoistSettings(){
  const [s,setS]=useState<SyncStatus>();const [token,setToken]=useState('');const [authorized,setAuthorized]=useState(false);
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [writes,setWrites]=useState(false);const [disconnect,setDisconnect]=useState(false);
  const [imports,setImports]=useState<string[]>([]);const [uploads,setUploads]=useState<string[]>([]);
  const [projectId,setProjectId]=useState('');
  useEffect(()=>{const off=window.floatTodo.onSync(setS);void window.floatTodo.sync('status').then(r=>{if(r.ok)setS(r.data);else setError(r.error||'读取同步状态失败');});return off;},[]);
  useEffect(()=>{setImports([]);setUploads([]);setWrites(false);},[s?.preview?.id]);
  useEffect(()=>{if(s?.projectId)setProjectId(s.projectId);},[s?.projectId]);
  async function act(action:string,payload:Record<string,unknown>={}){setBusy(true);setError('');try{const r=await window.floatTodo.sync(action,payload);if(r.ok)setS(r.data);else setError(r.error||'同步失败，请重试');}catch{setError('无法联系同步服务，请重试');}finally{setBusy(false);if(action==='connect')setToken('');}}
  const locked=busy||s?.busy;
  const select=(id:string,yes:boolean,current:string[],set:(v:string[])=>void)=>set(yes?[...current,id]:current.filter(x=>x!==id));
  return <details className="todoist-settings"><summary>Todoist 同步 · {s?.connected?(s.enabled?'已连接':'待确认 / 已暂停'):'未连接'}{s?.queued?` · 排队 ${s.queued}`:''}</summary>
    <div className="sync-body">
      <p>仅同步你选择并确认的项目。ChatGPT 的授权不能用于此程序。</p>
      {!s?.connected?<>
        <p>在 Todoist 设置 → 集成 → 开发者中复制个人 API Token，仅在下方输入。请勿发送到聊天或命令行。</p>
        <label>个人 API Token<input type="password" aria-label="Todoist API Token" value={token} autoComplete="off" spellCheck={false} onChange={e=>setToken(e.target.value)} maxLength={512}/></label>
        <label className="sync-check"><input type="checkbox" checked={authorized} onChange={e=>setAuthorized(e.target.checked)}/>我授权本机验证账户、只读查询项目，并加密保存凭证。</label>
        <button disabled={locked||!authorized||!token.trim()} onClick={()=>{const value=token;setToken('');void act('connect',{token:value,confirmed:authorized});}}>连接并只读预览</button>
      </>:<>
        <p role="status">{s.account} · {s.busy?'同步中…':s.enabled?'自动同步，每 45 秒检查':'首次确认前不自动同步'}<br/>上次同步：{s.lastSync?new Date(s.lastSync).toLocaleString():'尚未同步'}<br/>离线排队：{s.queued} 项{s.retryAt>Date.now()?` · 下次重试 ${new Date(s.retryAt).toLocaleTimeString()}`:''}</p>
        <p>当前绑定：{s.projectName||s.projectId||'尚未绑定'}{s.projectName&&s.projectId&&<><br/><span className="sync-project-id">ID：{s.projectId}</span></>}</p>
        <label>选择同步项目<select aria-label="选择同步项目" disabled={locked} value={projectId} onChange={e=>{setProjectId(e.target.value);setImports([]);setUploads([]);setWrites(false);}}>
          <option value="">请选择已有项目</option>
          {s.projectId&&!s.projects?.some(p=>p.id===s.projectId)&&<option value={s.projectId}>{s.projectName||'当前项目'} · {s.projectId}</option>}
          {s.projects?.map(p=><option key={p.id} value={p.id}>{p.name} · {p.id}</option>)}
        </select></label>
        <div className="sync-actions"><button disabled={locked} onClick={()=>void act('projects')}>读取项目列表</button><button disabled={locked||!projectId} onClick={()=>void act('preview',{projectId})}>只读预览所选项目</button></div>
        {projectId&&s.projectId&&projectId!==s.projectId&&<p>切换后保留原有本地任务和旧项目同步记录，不向新项目上传这些任务。有待发送任务或未完成配置时不能切换。</p>}
        <div className="sync-actions"><button disabled={locked||!s.enabled} onClick={()=>void act('now')}>立即同步</button><button disabled={locked} onClick={()=>void act('preview',{...(projectId?{projectId}:{})})}>只读预览 / 配置分组</button></div>
        {s.setupPending&&<div><p>上次确认的项目配置尚未完成。重试会复用已保存的请求 ID，完成后重新显示只读预览。</p><button disabled={locked} onClick={()=>void act('resume-setup',{confirmed:true})}>确认重试已授权的配置</button></div>}
        {s.preview&&(!projectId||s.preview.project?.id===projectId)&&<div className="sync-preview">
          <h2>首次同步预览（只读）</h2>
          <p>{s.preview.project?`项目：${s.preview.project.name}`:'尚无 FloatTodo 项目，确认后创建。'}{s.preview.project&&<><br/><span className="sync-project-id">ID：{s.preview.project.id}</span></>}<br/>待建分组：{s.preview.missingSections.join('、')||'无'}<br/>远端 {s.preview.remote.length} 项，本地可选上传 {s.preview.local.length} 项，同名待核对 {s.preview.matches} 项，冲突 {s.preview.conflicts} 项。</p>
          {s.preview.switching&&<p>确认后将切换项目。原项目的关联、游标和本地顺序会保留；本次不上传任何原有本地任务。</p>}
          <p>默认不上传已有任务。同名任务按不同 ID 保留，请勿将同名视为已关联。</p>
          <fieldset><legend>远端新增到本地（逐项选择）</legend>{s.preview.remote.length?s.preview.remote.map(t=><label className="sync-check" key={t.id}><input type="checkbox" checked={imports.includes(t.id)} disabled={t.kind==='linked'} onChange={e=>select(t.id,e.target.checked,imports,setImports)}/><span>{t.title} · {t.kind==='linked'?'已关联':t.sameName?'同名，保留独立任务':'远端新增'}</span></label>):<p>无远端任务</p>}</fieldset>
          <fieldset><legend>本地拟上传云端（默认不选）</legend>{s.preview.local.length?s.preview.local.map(t=><label className="sync-check" key={t.id}><input type="checkbox" checked={uploads.includes(t.id)} onChange={e=>select(t.id,e.target.checked,uploads,setUploads)}/><span>{t.title}</span></label>):<p>无待上传任务</p>}</fieldset>
          <label className="sync-check"><input type="checkbox" checked={writes} onChange={e=>setWrites(e.target.checked)}/>确认创建缺少的项目、分组和状态标签，导入所选 {imports.length} 项、上传所选 {uploads.length} 项，并启用今后新增任务的双向同步。</label>
          <button disabled={locked||!writes} onClick={()=>void act('confirm',{previewId:s.preview!.id,importIds:imports,uploadIds:uploads,allowWrites:writes})}>确认选择并启用同步</button>
        </div>}
        {s.conflicts.length>0&&<section aria-label="同步冲突"><h2>冲突待确认 · {s.conflicts.length}</h2>{s.conflicts.map(c=><div className="sync-conflict" key={c.id}><p>{c.message}{c.fields?.length?`（${c.fields.join('、')}）`:''}</p>{c.kind==='edit'&&<><p>本地：{JSON.stringify(c.local)}</p><p>云端：{JSON.stringify(c.remote)}</p><div className="sync-actions"><button disabled={locked} onClick={()=>void act('resolve',{id:c.id,choice:'local'})}>保留本地</button><button disabled={locked} onClick={()=>void act('resolve',{id:c.id,choice:'remote'})}>保留云端</button></div></>}<button disabled={locked} onClick={()=>void act('resolve',{id:c.id,choice:'unlink'})}>解除关联，保留任务</button></div>)}</section>}
        {!disconnect?<button disabled={locked} onClick={()=>setDisconnect(true)}>断开连接…</button>:<div><p>仅删除本机加密凭证并停止同步。任务和备份均保留。个人 Token 不会在 Todoist 撤销，可在 Todoist 设置重新生成。</p><div className="sync-actions"><button disabled={locked} onClick={()=>{void act('disconnect',{confirmed:true});setDisconnect(false);}}>确认断开连接</button><button onClick={()=>setDisconnect(false)}>取消</button></div></div>}
      </>}
      {(error||s?.error)&&<p className="sync-error" role="alert">{error||s?.error}</p>}
      <p>FloatTodo 为独立工具，非 Todoist 官方产品。Windows 加密保护不阻止同一登录用户下的其他程序访问。</p>
    </div>
  </details>;
}
