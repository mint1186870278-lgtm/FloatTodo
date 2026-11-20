import {useEffect, useRef, useState} from 'react';
import type {Task, Status, Receipt} from './types';

type Feedback = {task:Task;height:number;phase:'hold'|'exit'};
// This is presentation only. The command commits immediately; no delayed database writes.
export function useCompletionFeedback(tasks:Task[]|undefined, tab:Status, mode:string, run:(c:Record<string,unknown>)=>Promise<Receipt|null>) {
  const [feedback,setFeedback]=useState<Record<string,Feedback>>({});
  const pending=useRef(new Map<string,{token:object;committed:boolean;timers:ReturnType<typeof setTimeout>[]}>());
  function remove(id:string) {
    pending.current.get(id)?.timers.forEach(clearTimeout);pending.current.delete(id);
    setFeedback(current=>{if(!current[id])return current;const next={...current};delete next[id];return next;});
  }
  function clear(){for(const value of pending.current.values())value.timers.forEach(clearTimeout);pending.current.clear();setFeedback({});}
  useEffect(()=>()=>{for(const value of pending.current.values())value.timers.forEach(clearTimeout);pending.current.clear();},[]);
  useEffect(()=>{clear();},[tab,mode]);
  useEffect(()=>{for(const [id,value] of pending.current){if(value.committed&&tasks?.find(t=>t.id===id)?.status!=='completed')remove(id);}},[tasks]);
  async function toggle(task:Task,height:number) {
    if(pending.current.has(task.id))return;
    if(tab!=='todo'||task.status!=='todo'){await run({type:'toggle',id:task.id});return;}
    const token={},started=performance.now(),value={token,committed:false,timers:[] as ReturnType<typeof setTimeout>[]};
    pending.current.set(task.id,value);
    setFeedback(current=>({...current,[task.id]:{task:{...task,status:'completed'},height,phase:'hold'}}));
    const result=await run({type:'update',id:task.id,status:'completed'});
    if(pending.current.get(task.id)?.token!==token)return;
    if(!result){remove(task.id);return;}
    value.committed=true;
    value.timers.push(setTimeout(()=>{
      setFeedback(current=>current[task.id]?{...current,[task.id]:{...current[task.id],phase:'exit'}}:current);
      value.timers.push(setTimeout(()=>remove(task.id),180));
    },Math.max(0,900-(performance.now()-started))));
  }
  return {feedback,toggle};
}
