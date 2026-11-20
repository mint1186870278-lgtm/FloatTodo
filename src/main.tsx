import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { State, Task, Status, Initial, Receipt, OpacityContext } from './types';
import './style.css';
import {useCompletionFeedback} from './useCompletionFeedback';
import {UndoToast,type UndoNotice} from './UndoToast';
import {TodoistSettings} from './TodoistSettings';
import {useKeyboardInteraction} from './useKeyboardInteraction';
import {useRowReorder} from './useRowReorder';

const tabs: {id:Status;label:string}[] = [{id:'todo',label:'To-do'},{id:'pending',label:'Pending'},{id:'completed',label:'Completed'},{id:'cancelled',label:'Cancelled'}];
const paths:Record<string,string> = {
  pin:'M8 3h8l-1 6 3 3v2h-5v7m-2-7H6v-2l3-3-1-6',
  settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M10 3h4l1 3 3 1 3 2v5l-3 1-1 3-2 3h-5l-1-3-3-1-3-2v-5l3-1 1-3 3-2Z',
  hide:'M5 12h14', plus:'M12 5v14M5 12h14', more:'M5 12h.01M12 12h.01M19 12h.01',
  chevron:'m9 5 7 7-7 7', x:'m6 6 12 12M18 6 6 18', up:'m6 14 6-6 6 6', down:'m6 10 6 6 6-6', check:'m5 12 4 4L19 6'
  ,list:'m3 6 1 1 2-3M9 6h12M3 12l1 1 2-3M9 12h12M3 18l1 1 2-3M9 18h12'
};
function Icon({name,size=16}:{name:string;size?:number}) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>; }
type Editor = {kind:'task';task?:Task}|{kind:'settings'}|{kind:'group';id?:string}|null;
function currentDate(){const d=new Date();return `${d.toLocaleDateString('en-US',{month:'long',day:'numeric'})}, ${d.toLocaleDateString('en-US',{weekday:'long'})}`;}

function App() {
  useKeyboardInteraction();
  const [state,setState]=useState<State>();
  const [info,setInfo]=useState<Initial>();
  const [mode,setMode]=useState('expanded');
  const [tab,setTab]=useState<Status>('todo');
  const [draft,setDraft]=useState('');
  const groupId=state?.settings.selectedGroupId||state?.groups[0].id||'work';
  const [addMenu,setAddMenu]=useState(false);
  const [quickFocused,setQuickFocused]=useState(false);
  const [editor,setEditor]=useState<Editor>(null);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [undo,setUndo]=useState<UndoNotice>();
  const noticeId=useRef(0);
  const [opacityContext,setOpacityContext]=useState<OpacityContext>();
  const [busy,setBusy]=useState(false);
  const input=useRef<HTMLInputElement>(null);
  const footer=useRef<HTMLElement>(null);
  const ballPointer=useRef<{x:number;y:number;moved:boolean}|null>(null);
  const draggingPanel=useRef(false);
  useEffect(()=>{
    const off=[window.floatTodo.onState(s=>setState(s)),window.floatTodo.onMode(setMode),window.floatTodo.onNotice(setError),window.floatTodo.onSettings(()=>setEditor({kind:'settings'})),window.floatTodo.onInteraction(setOpacityContext)];
    window.floatTodo.get().then(r=>{if(!r.ok){setError(r.error||'读取数据失败');return;}setInfo(r.data);setState(r.data.state);setMode(r.data.mode);setOpacityContext(r.data.interaction);if(r.data.warnings.length)setError(r.data.warnings.join('\n'));}).catch(e=>setError(e.message));
    return ()=>off.forEach(fn=>fn());
  },[]);
  const rowDrag=useRowReorder(state,tab==='todo'&&mode==='expanded'&&!editor&&!busy,run);
  useEffect(()=>{void window.floatTodo.window(rowDrag.holding||editor||addMenu||(quickFocused&&opacityContext?.focused)||draft.trim()?'hold':'release');},[rowDrag.holding,editor,addMenu,quickFocused,draft,opacityContext?.focused]);
  useEffect(()=>{const blur=()=>setQuickFocused(false),focus=()=>setQuickFocused(document.activeElement===input.current);window.addEventListener('blur',blur);window.addEventListener('focus',focus);return()=>{window.removeEventListener('blur',blur);window.removeEventListener('focus',focus);};},[]);
  useEffect(()=>{if(!addMenu)return;const outside=(e:PointerEvent)=>{if(!footer.current?.contains(e.target as Node))setAddMenu(false);};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);},[addMenu]);
  useEffect(()=>{if(!message)return;const t=setTimeout(()=>setMessage(''),6000);return()=>clearTimeout(t);},[message]);
  useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!editor){if(addMenu){setAddMenu(false);return;}void window.floatTodo.window('hide');}};document.addEventListener('keydown',onKey);return()=>document.removeEventListener('keydown',onKey);},[editor,addMenu]);
  async function run(command:Record<string,unknown>) {
    setError('');
    try { const r=await window.floatTodo.command(command);if(!r.ok)throw new Error(r.error);return r.data; }
    catch(e){setError((e as Error).message);return null;}
  }
  const {feedback,toggle}=useCompletionFeedback(state?.tasks,tab,mode,run);
  async function add(e:React.FormEvent) {
    e.preventDefault();if(busy)return;setBusy(true);
    const submitted=draft;
    try { if(await run({type:'add',title:submitted,groupId})){setDraft(current=>current===submitted?'':current);setTab('todo');input.current?.focus();} } finally{setBusy(false);}
  }
  async function fileAction(kind:'import'|'export') {
    setBusy(true);setError('');
    try { const r=await (kind==='import'?window.floatTodo.importData():window.floatTodo.exportData());if(!r.ok)throw new Error(r.error);if(!r.data.cancelled){setUndo(undefined);setMessage(kind==='import'?`已恢复 ${r.data.imported} 项任务`:`已导出到 ${r.data.path}`);if(kind==='import'){setEditor(null);}} }
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  const [today,setToday]=useState(currentDate);
  useEffect(()=>{const timer=setInterval(()=>setToday(currentDate()),30000);return()=>clearInterval(timer);},[]);
  if(!state)return <main className="loading">{error || '正在打开 FloatTodo…'}</main>;
  return <>
    {mode==='collapsed'?<button className="float-ball" style={{'--ball-inset':`${Math.ceil(2.4*devicePixelRatio)/devicePixelRatio}px`,'--ball-border':`${1/devicePixelRatio}px`} as React.CSSProperties} aria-label="展开 FloatTodo" title="拖动移动 · 悬停展开"
      onPointerDown={e=>{if(e.button!==0)return;ballPointer.current={x:e.screenX,y:e.screenY,moved:false};e.currentTarget.setPointerCapture(e.pointerId);void window.floatTodo.ballDrag('start');}}
      onPointerMove={e=>{const p=ballPointer.current;if(p&&Math.hypot(e.screenX-p.x,e.screenY-p.y)>3)p.moved=true;}}
      onPointerUp={()=>void window.floatTodo.ballDrag('end')} onPointerCancel={()=>void window.floatTodo.ballDrag('end')} onLostPointerCapture={()=>void window.floatTodo.ballDrag('end')}
      onClick={()=>{if(!ballPointer.current?.moved)void window.floatTodo.window('restore');ballPointer.current=null;}}><Icon name="list" size={19}/></button>:
    <main className="panel" data-opacity-phase={opacityContext?.phase||'manual'} data-native-focused={!!opacityContext?.focused} data-checkbox-mode={state.settings.pinned&&!opacityContext?.interactive?'quiet':'interactive'} style={{'--paper-alpha':opacityContext?.alpha??state.settings.opacity} as React.CSSProperties} onPointerEnter={()=>void window.floatTodo.pointer('enter')} onPointerLeave={()=>void window.floatTodo.pointer('leave')}>
      <header className="titlebar" onPointerDown={e=>{if(e.button!==0||(e.target as Element).closest('button,input,select,textarea'))return;draggingPanel.current=true;e.currentTarget.setPointerCapture(e.pointerId);void window.floatTodo.panelDrag('start');}}
        onPointerMove={()=>{if(draggingPanel.current)void window.floatTodo.panelDrag('move');}}
        onPointerUp={()=>{draggingPanel.current=false;void window.floatTodo.panelDrag('end');}}
        onPointerCancel={()=>{draggingPanel.current=false;void window.floatTodo.panelDrag('end');}}
        onLostPointerCapture={()=>{draggingPanel.current=false;void window.floatTodo.panelDrag('end');}}>
        <time>{today}</time>
        <div className="window-controls">
          <button className={`icon-button ${state.settings.pinned?'selected':''}`} aria-label={state.settings.pinned?'取消固定，收起为悬浮球':'固定展开'} title={state.settings.pinned?'取消固定':'固定展开'} onClick={()=>void run({type:'settings',settings:{pinned:!state.settings.pinned}})}><Icon name="pin" size={12}/></button>
          <button className="icon-button" aria-label="设置" title="设置" onClick={()=>setEditor({kind:'settings'})}><Icon name="settings" size={14}/></button>
          <button className="icon-button" aria-label="隐藏到托盘" title="隐藏到托盘" onClick={()=>void window.floatTodo.window('hide')}><Icon name="hide" size={14}/></button>
        </div>
      </header>
      <nav className="tabs" aria-label="任务状态">{tabs.map(t=><button key={t.id} aria-label={`${t.label} ${state.tasks.filter(x=>x.status===t.id).length}`} aria-pressed={tab===t.id} className={tab===t.id?'active':''} onClick={()=>setTab(t.id)}>{t.label}</button>)}</nav>
      {error && <div className="notice error" role="alert"><span>{error}</span><button aria-label="关闭错误" className="icon-button" onClick={()=>setError('')}><Icon name="x" size={13}/></button></div>}
      <div className="task-list" data-row-dragging={!!rowDrag.activeId} aria-label={`${tabs.find(t=>t.id===tab)?.label} 任务列表`} onPointerDown={rowDrag.down} onPointerMove={rowDrag.move} onPointerUp={rowDrag.up} onPointerCancel={rowDrag.cancel} onLostPointerCapture={rowDrag.cancel}>
        {state.groups.map(group=>{
          const rows=state.tasks.filter(t=>(t.status===tab || (tab==='todo'&&!!feedback[t.id])) && t.groupId===group.id).map(t=>tab==='todo'&&feedback[t.id]?{...t,status:'completed' as Status}:t).sort((a,b)=>a.order-b.order);
          return <section className="group" key={group.id}>
            <div className="group-heading">
              <div className="group-title"><span className="group-dot" aria-hidden="true"/><span>{group.name}</span></div>
              <button className="icon-button group-edit" aria-label={`管理分组 ${group.name}`} onClick={()=>setEditor({kind:'group',id:group.id})}><Icon name="more" size={14}/></button>
            </div>
            {(rows.length?rows.map(task=><div className={`task ${task.status} ${tab==='todo'&&feedback[task.id]?`completion-${feedback[task.id].phase}`:''} ${rowDrag.activeId===task.id?'row-dragging':''} ${rowDrag.invalid&&rowDrag.activeId===task.id?'row-drag-invalid':''}`} style={{...rowDrag.style(task.id),...(tab==='todo'&&feedback[task.id]?{maxHeight:feedback[task.id].height}:{})}} key={task.id} data-task-id={task.id} data-reorderable={tab==='todo'&&task.status==='todo'&&!Object.keys(feedback).length}>
              <input type="checkbox" checked={task.status==='completed'} disabled={tab==='todo'&&!!feedback[task.id]} title={tab==='todo'&&feedback[task.id]?'已完成；可在 Completed 中恢复':undefined} aria-label={`${task.status==='completed'?'恢复':'完成'} ${task.title}`} onChange={e=>void toggle(task,e.currentTarget.parentElement?.getBoundingClientRect().height||24)}/>
              <button className="task-body" onClick={()=>setEditor({kind:'task',task})} title={task.notes || '编辑事项'}><span className="task-title">{task.title}</span>{(task.dueDate || task.notes) && <span className="task-meta">{task.dueDate && <time className={task.dueDate<new Date().toLocaleDateString('en-CA') && task.status!=='completed'?'overdue':''}>{task.dueDate}</time>}{task.notes && <span>有备注</span>}</span>}</button>
              <button className="icon-button task-menu" aria-label={`编辑 ${task.title}`} onClick={()=>setEditor({kind:'task',task})}><Icon name="more" size={14}/></button>
            </div>):null)}
          </section>;
        })}
        {!state.tasks.some(t=>t.status===tab)&&!(tab==='todo'&&Object.keys(feedback).length)&&<p className="empty-state">{tab==='todo'?'从下方记下一件要做的事。':'这个状态下还没有事项。'}</p>}
        <button className="add-group" onClick={()=>setEditor({kind:'group'})}><Icon name="plus" size={12}/> 新建分组</button>
      </div>
      {undo&&<UndoToast key={undo.id} notice={undo} dismiss={id=>setUndo(current=>current?.id===id?undefined:current)} restore={async notice=>!!await run({type:'restore',task:notice.task})}/>}
      {message&&<div className="notice" role="status"><span>{message}</span><button className="icon-button" aria-label="关闭提示" onClick={()=>setMessage('')}><Icon name="x" size={13}/></button></div>}
      <footer ref={footer}>
        {addMenu&&<section className="add-options" aria-label="新增选项"><label>默认分组<select autoFocus aria-label="新增任务分组" value={groupId} onChange={e=>void run({type:'settings',settings:{selectedGroupId:e.target.value}})}>{state.groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label><button onClick={()=>{setAddMenu(false);setEditor({kind:'task'});}}>详细添加 <span>备注 / 日期</span></button></section>}
        <form className="quick-add" onSubmit={add}>
          <input ref={input} aria-label="新任务标题" maxLength={500} placeholder="Add new todo" value={draft} onFocus={()=>setQuickFocused(true)} onBlur={()=>setQuickFocused(false)} onChange={e=>setDraft(e.target.value)}/>
          <button className="icon-button add-options-toggle" type="button" aria-label="新增选项" aria-expanded={addMenu} title={`默认分组：${state.groups.find(g=>g.id===groupId)?.name} · 点击更改或详细添加`} onClick={()=>setAddMenu(!addMenu)}><Icon name="down" size={11}/></button>
          <button className="icon-button" type="submit" aria-label="添加任务" disabled={busy || !draft.trim()}><Icon name="plus" size={18}/></button>
        </form>
      </footer>
      {editor && <EditorDialog key={editor.kind==='task'?editor.task?.id||'new':editor.kind==='group'?editor.id||'new-group':'settings'} editor={editor} state={state} opacityContext={opacityContext} defaultTitle={draft} defaultGroupId={groupId} info={info} busy={busy} close={()=>setEditor(null)} run={run} fileAction={fileAction} onDeleted={task=>{setMessage('');setUndo({id:++noticeId.current,task,showUntil:Date.now()+3000});setEditor(null);}} onAdded={()=>{setDraft('');setTab('todo');setEditor(null);}}/>}
    </main>}
  </>;
}
interface EditorProps {editor:NonNullable<Editor>;state:State;opacityContext?:OpacityContext;defaultTitle:string;defaultGroupId:string;info?:Initial;busy:boolean;close:()=>void;run:(c:Record<string,unknown>)=>Promise<Receipt|null>;fileAction:(kind:'import'|'export')=>Promise<void>;onDeleted:(task:Task)=>void;onAdded:()=>void}
function EditorDialog({editor,state,opacityContext,defaultTitle,defaultGroupId,info,busy,close,run,fileAction,onDeleted,onAdded}:EditorProps) {
  const dialog=useRef<HTMLDialogElement>(null);
  const task=editor.kind==='task'?editor.task:undefined;
  const group=editor.kind==='group'?state.groups.find(g=>g.id===editor.id):undefined;
  const [title,setTitle]=useState(task?.title || group?.name || (editor.kind==='task'?defaultTitle:''));
  const [notes,setNotes]=useState(task?.notes||'');
  const [due,setDue]=useState(task?.dueDate||'');
  const [groupId,setGroupId]=useState(task?.groupId||(editor.kind==='task'?defaultGroupId:state.groups.find(g=>g.id!==group?.id)?.id)||state.groups[0].id);
  const [status,setStatus]=useState<Status>(task?.status||'todo');
  const [confirm,setConfirm]=useState(false);
  const [saving,setSaving]=useState(false);
  const [localError,setLocalError]=useState('');
  useEffect(()=>{dialog.current?.showModal();},[]);
  async function save(e:React.FormEvent) {
    e.preventDefault();if(saving)return;setSaving(true);setLocalError('');
    const command=editor.kind==='task'?{type:task?'update':'add',...(task?{id:task.id}:{}),title,notes,dueDate:due,groupId,...(task?{status}:{})}:{type:group?'group-update':'group-add',...(group?{id:group.id}:{}),name:title};
    try {const r=await run(command);if(r){if(editor.kind==='task'&&!task)onAdded();else close();}else setLocalError('未保存，请检查输入或面板错误提示。');}finally{setSaving(false);}
  }
  async function remove() {
    if(!confirm){setConfirm(true);return;}setSaving(true);
    try {const r=await run(task?{type:'delete',id:task.id}:{type:'group-delete',id:group?.id,targetGroupId:groupId});if(r){if(task)onDeleted(r.deleted||task);else close();}else setLocalError('操作失败，请检查接收分组或面板错误提示。');}finally{setSaving(false);}
  }
  const heading=editor.kind==='settings'?'设置':editor.kind==='group'?(group?'管理分组':'新建分组'):(task?'编辑事项':'新建事项');
  return <dialog ref={dialog} onCancel={e=>{e.preventDefault();if(!saving&&!busy)close();}} className="editor-dialog">
    <div className="dialog-header"><h1>{heading}</h1><button className="icon-button" aria-label="关闭对话框" onClick={close} disabled={saving||busy}><Icon name="x"/></button></div>
    {editor.kind==='settings'?<div className="settings-body">
      <label className="switch-row"><span>固定展开<small>关闭后收成圆球，悬停展开，拖动移动</small></span><input aria-label="固定展开" type="checkbox" checked={state.settings.pinned} onChange={e=>void run({type:'settings',settings:{pinned:e.target.checked}})}/></label>
      <label className="switch-row"><span>始终置顶<small>显示在其他应用上方</small></span><input aria-label="始终置顶" type="checkbox" checked={state.settings.alwaysOnTop} onChange={e=>void run({type:'settings',settings:{alwaysOnTop:e.target.checked}})}/></label>
      <label className="switch-row"><span>自动背景透明度<small>固定且置顶时：离开30%，悬停、键盘操作或编辑默认85%</small></span><input aria-label="自动背景透明度" type="checkbox" checked={state.settings.autoOpacity} onChange={e=>void run({type:'settings',settings:{autoOpacity:e.target.checked}})}/></label>
      <label className="opacity-label">交互态不透明度（本次运行）<output>{Math.round((opacityContext?.activeOpacity??.85)*100)}%</output><input aria-label="交互态不透明度" type="range" min="30" max="100" value={Math.round((opacityContext?.activeOpacity??.85)*100)} onChange={e=>void window.floatTodo.activeOpacity(Number(e.target.value)/100)}/></label>
      <p className="help">默认85%，本次运行可调整，重启恢复默认。自动模式关闭后，使用下方保留的手动不透明度。</p>
      <label className="opacity-label">背景不透明度 <output>{Math.round(state.settings.opacity*100)}%</output><input aria-label="背景不透明度" type="range" min="30" max="100" value={Math.round(state.settings.opacity*100)} onChange={e=>void run({type:'settings',settings:{opacity:Number(e.target.value)/100}})}/></label>
      <p className="help">自动模式仅在固定且置顶时生效；上方手动值会保留，关闭自动模式后恢复。点击图钉固定时同时置顶。仅背景变透明，文字保持清晰。</p>
      <label className="switch-row"><span>开机启动<small>默认关闭；便携版请勿移动 EXE</small></span><input aria-label="开机启动" type="checkbox" checked={state.settings.launchAtLogin} onChange={e=>void run({type:'settings',settings:{launchAtLogin:e.target.checked}})}/></label>
      <div className="backup-actions"><button disabled={busy} onClick={()=>void fileAction('export')}>导出 JSON</button><button disabled={busy} onClick={()=>void fileAction('import')}>从 JSON 恢复</button></div>
      <p className="help">恢复前会确认覆盖，并另存当前数据。</p>
      <TodoistSettings/>
      <details><summary>数据目录与快捷键</summary><p className="help selectable">{info?.dataDir}</p><p className="help">Ctrl+Alt+Shift+T 恢复完整窗口<br/>{info?.hotkey?'快捷键已注册':'快捷键未注册，请从系统托盘恢复'}</p><p className="help">关闭 / Esc 隐藏到托盘，右键托盘可退出。未连接 Todoist 时仅在本机保存。</p></details>
      <div className="settings-end"><span>FloatTodo {info?.version}</span><button className="danger-text" onClick={()=>void window.floatTodo.window('quit')}>退出应用</button></div>
    </div>:<form onSubmit={save} className="edit-form">
      <label>{editor.kind==='group'?'分组名':'标题'}<input autoFocus aria-label={editor.kind==='group'?'分组名':'标题'} value={title} maxLength={editor.kind==='group'?40:500} required onChange={e=>setTitle(e.target.value)}/></label>
      {editor.kind==='task' && <>
        <div className="form-row"><label>分组<select aria-label="事项分组" value={groupId} onChange={e=>setGroupId(e.target.value)}>{state.groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>{task && <label>状态<select aria-label="事项状态" value={status} onChange={e=>setStatus(e.target.value as Status)}>{tabs.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select></label>}</div>
        <label>截止日期 <span className="optional">可选</span><input aria-label="截止日期" type="date" value={due} onChange={e=>setDue(e.target.value)}/></label>
        <label>备注 <span className="optional">可选</span><textarea aria-label="备注" maxLength={10000} rows={3} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
        {task && <div className="order-actions"><span>组内顺序</span><button type="button" onClick={()=>void run({type:'reorder',id:task.id,direction:'up'})}><Icon name="up" size={13}/>上移</button><button type="button" onClick={()=>void run({type:'reorder',id:task.id,direction:'down'})}><Icon name="down" size={13}/>下移</button></div>}
      </>}
      {editor.kind==='group' && group && <p className="help">此分组有 {state.tasks.filter(t=>t.groupId===group.id).length} 项任务。删除时会移动全部状态的任务。</p>}
      {confirm && <div className="confirm-box" role="alert"><p>{task?'确定删除这项任务？删除后可在面板中撤销。':'确定删除分组？全部任务将移动到下方分组。'}</p>{group && <label>接收分组<select aria-label="接收分组" value={groupId} onChange={e=>setGroupId(e.target.value)}>{state.groups.filter(g=>g.id!==group.id).map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>}<button type="button" onClick={()=>setConfirm(false)}>取消删除</button></div>}
      {localError && <p className="form-error" role="alert">{localError}</p>}
      <div className="dialog-actions">{(task||group) && <button className="danger-text" type="button" disabled={saving||(!!group && state.groups.length===1)} onClick={()=>void remove()}>{confirm?'确认删除':'删除'}</button>}<span/><button type="button" onClick={close} disabled={saving}>取消</button><button className="primary" type="submit" disabled={saving||!title.trim()}>{saving?'保存中…':'保存'}</button></div>
    </form>}
  </dialog>;
}

createRoot(document.getElementById('root')!).render(<App/>);
