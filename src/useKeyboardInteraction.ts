import {useEffect} from 'react';

// Keyboard focus remains reachable while quiet checkboxes ignore pointer hits.
// Native activation in the main process gates this hint; CDP/DOM focus alone
// must not keep an inactive desktop window in the interactive state.
export function useKeyboardInteraction(){
  useEffect(()=>{
    let keyboard=false;
    const send=(active:boolean)=>{void window.floatTodo.pointer(active?'keyboard-enter':'keyboard-leave');};
    const key=()=>{keyboard=true;send(true);};
    const pointer=()=>{keyboard=false;send(false);};
    const focus=()=>{if(keyboard&&document.activeElement!==document.body)send(true);};
    const blur=()=>send(false);
    document.addEventListener('keydown',key,true);
    document.addEventListener('pointerdown',pointer,true);
    document.addEventListener('focusin',focus);
    window.addEventListener('blur',blur);window.addEventListener('focus',focus);
    return()=>{document.removeEventListener('keydown',key,true);document.removeEventListener('pointerdown',pointer,true);document.removeEventListener('focusin',focus);window.removeEventListener('blur',blur);window.removeEventListener('focus',focus);};
  },[]);
}
