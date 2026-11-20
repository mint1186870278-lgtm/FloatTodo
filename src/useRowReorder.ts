import {useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type CSSProperties} from 'react';
import type {State, Receipt} from './types';

type Drag = {id:string;group:HTMLElement;list:HTMLElement;node:HTMLElement;pointer:number;x:number;y:number;currentX:number;currentY:number;scroll:number;ids:string[];tops:number[];heights:number[];active:boolean;valid:boolean;to:number;revision:number;finishing:boolean};

// The existing task-body remains a click-to-edit button. Capture only once the
// pointer crosses the threshold, so a normal click still reaches that button.
export function useRowReorder(state:State|undefined, enabled:boolean, run:(c:Record<string,unknown>)=>Promise<Receipt|null>) {
  const drag=useRef<Drag|null>(null);
  const saving=useRef(false);
  const suppressed=useRef<HTMLElement|null>(null);
  const [,render]=useState(0);
  const [holding,setHolding]=useState(false);
  const refresh=()=>render(n=>n+1);
  function clear() {
    const d=drag.current;drag.current=null;setHolding(false);refresh();
    if(d?.list.hasPointerCapture(d.pointer))d.list.releasePointerCapture(d.pointer);
  }
  useEffect(()=>{
    const d=drag.current;
    if(d&&!d.finishing&&(!enabled||state?.revision!==d.revision))clear();
  },[state?.revision,enabled]);
  useEffect(()=>{
    function cancel(){if(drag.current&&!drag.current.finishing)clear();}
    function escape(e:KeyboardEvent){if(e.key==='Escape'&&drag.current){e.preventDefault();e.stopImmediatePropagation();cancel();}}
    function click(e:MouseEvent){if(suppressed.current?.contains(e.target as Node)){e.preventDefault();e.stopImmediatePropagation();}suppressed.current=null;}
    function releasedOutside(){if(drag.current&&!drag.current.active)clear();}
    window.addEventListener('keydown',escape,true);window.addEventListener('click',click,true);window.addEventListener('blur',cancel);
    window.addEventListener('pointerup',releasedOutside);
    return()=>{window.removeEventListener('keydown',escape,true);window.removeEventListener('click',click,true);window.removeEventListener('blur',cancel);window.removeEventListener('pointerup',releasedOutside);};
  },[]);
  function update(d:Drag) {
    const g=d.group.getBoundingClientRect(),l=d.list.getBoundingClientRect();
    d.valid=d.currentX>=g.left&&d.currentX<=g.right&&d.currentY>=Math.max(g.top+21,l.top)&&d.currentY<=Math.min(g.bottom,l.bottom);
    const center=d.currentY-d.y+d.scroll*-1+d.list.scrollTop+d.tops[d.ids.indexOf(d.id)]+d.heights[d.ids.indexOf(d.id)]/2;
    let to=0;
    for(let i=0;i<d.ids.length;i++)if(d.ids[i]!==d.id){const mid=d.tops[i]+d.heights[i]/2;if(center>mid+.01||(Math.abs(center-mid)<=.01&&d.currentY>=d.y))to++;}
    d.to=to;refresh();
  }
  useEffect(()=>{
    if(!holding)return;
    let frame:number;
    const tick=()=>{const d=drag.current;if(d?.active&&!d.finishing){const r=d.list.getBoundingClientRect();if(d.currentX>=r.left&&d.currentX<=r.right){const speed=d.currentY<r.top+26?-5:d.currentY>r.bottom-26?5:0;if(speed){d.list.scrollTop+=speed;update(d);}}}frame=requestAnimationFrame(tick);};
    frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
  },[holding]);
  function down(e:ReactPointerEvent<HTMLDivElement>) {
    if(!enabled||e.button!==0||drag.current||saving.current)return;
    const el=e.target as Element,node=el.closest<HTMLElement>('.task[data-reorderable=true]');
    if(!node||el.closest('input,select,textarea,a,[contenteditable=true],button:not(.task-body)'))return;
    const group=node.closest<HTMLElement>('.group')!,list=e.currentTarget;
    const nodes=[...group.querySelectorAll<HTMLElement>('.task[data-reorderable=true]')];
    if(nodes.length<2)return;
    // A new press must measure settled slots, even immediately after a drop.
    for(const n of nodes)for(const animation of n.getAnimations())animation.cancel();
    drag.current={id:node.dataset.taskId!,group,list,node,pointer:e.pointerId,x:e.clientX,y:e.clientY,currentX:e.clientX,currentY:e.clientY,scroll:list.scrollTop,ids:nodes.map(n=>n.dataset.taskId!),tops:nodes.map(n=>n.getBoundingClientRect().top+list.scrollTop),heights:nodes.map(n=>n.getBoundingClientRect().height),active:false,valid:true,to:nodes.indexOf(node),revision:state!.revision,finishing:false};
    setHolding(true);
  }
  function move(e:ReactPointerEvent<HTMLDivElement>){const d=drag.current;if(!d||d.finishing)return;d.currentX=e.clientX;d.currentY=e.clientY;if(!d.active&&Math.hypot(e.clientX-d.x,e.clientY-d.y)>=6){d.active=true;d.list.setPointerCapture(e.pointerId);suppressed.current=d.node;}if(d.active){e.preventDefault();update(d);}}
  async function up(e:ReactPointerEvent<HTMLDivElement>){const d=drag.current;if(!d||d.finishing)return;if(!d.active){clear();return;}e.preventDefault();update(d);const ids=d.ids.filter(id=>id!==d.id);ids.splice(d.to,0,d.id);const commit=d.valid&&ids.some((id,i)=>id!==d.ids[i]);saving.current=commit;clear();if(commit)try{await run({type:'reorder',id:d.id,beforeId:ids[d.to+1]??null,expectedIds:d.ids});}finally{saving.current=false;}}
  function style(id:string):CSSProperties|undefined {
    const d=drag.current;if(!d?.active||!d.ids.includes(id))return;
    if(id===d.id)return{transform:`translateY(${d.currentY-d.y+d.list.scrollTop-d.scroll}px)`,zIndex:3,position:'relative',transition:'none'};
    const preview=d.ids.filter(x=>x!==d.id);preview.splice(d.to,0,d.id);let top=d.tops[0];
    for(const item of preview){if(item===id)break;top+=d.heights[d.ids.indexOf(item)];}
    return{transform:`translateY(${top-d.tops[d.ids.indexOf(id)]}px)`};
  }
  return{holding,down,move,up,cancel:()=>{if(!drag.current?.finishing)clear();},style,activeId:drag.current?.active?drag.current.id:null,invalid:drag.current?.active&&!drag.current.valid};
}
