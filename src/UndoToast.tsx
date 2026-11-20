import {useEffect,useRef,useState} from 'react';
import type {Task} from './types';
export interface UndoNotice {id:number;task:Task;showUntil:number}
export function UndoToast({notice,dismiss,restore}:{notice:UndoNotice;dismiss:(id:number)=>void;restore:(notice:UndoNotice)=>Promise<boolean>}) {
  const [fading,setFading]=useState(()=>Date.now()>=notice.showUntil),[busy,setBusy]=useState(false);
  const timers=useRef<ReturnType<typeof setTimeout>[]>([]),alive=useRef(false),restoring=useRef(false);
  const callbacks=useRef({dismiss,restore});callbacks.current={dismiss,restore};
  const cancel=()=>{timers.current.forEach(clearTimeout);timers.current=[];};
  function arm(until:number){
    cancel();setFading(Date.now()>=until);
    timers.current.push(setTimeout(()=>setFading(true),Math.max(0,until-Date.now())));
    timers.current.push(setTimeout(()=>callbacks.current.dismiss(notice.id),Math.max(0,until+250-Date.now())));
  }
  useEffect(()=>{alive.current=true;arm(notice.showUntil);return()=>{alive.current=false;cancel();};},[notice.id,notice.showUntil]);
  async function undo(){
    if(restoring.current)return;restoring.current=true;cancel();setBusy(true);
    const restored=await callbacks.current.restore(notice);
    if(!alive.current)return;
    if(restored)callbacks.current.dismiss(notice.id);
    else{restoring.current=false;setBusy(false);arm(Date.now()+3000);}
  }
  return <div className={`notice undo-toast ${fading?'fading':''}`} data-notice-id={notice.id} role="status"><span>已删除「{notice.task.title}」</span><button onClick={()=>void undo()} disabled={busy}>{busy?'恢复中…':'撤销'}</button></div>;
}
