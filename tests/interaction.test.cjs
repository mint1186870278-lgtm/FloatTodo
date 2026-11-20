const {test}=require('node:test'),assert=require('node:assert/strict');
const {initialInteraction,interactionEvent,contextOpacity}=require('../electron/interaction-state.cjs');
const {defaults,validateState,applyCommand}=require('../electron/model.cjs');
const settings={...defaults().settings,pinned:true,alwaysOnTop:true,opacity:.86};
test('context opacity state machine: background, hover, focus, edit and dialog priority',()=>{
 let i={...initialInteraction};const resolve=extra=>contextOpacity(settings,i,extra);
 assert.deepEqual(resolve(),{phase:'passive',alpha:.3});i=interactionEvent(i,{type:'pointer',inside:true});assert.equal(resolve().alpha,.85);
 i=interactionEvent(i,{type:'focus',focused:true});i=interactionEvent(i,{type:'pointer',inside:false});assert.equal(resolve().alpha,.3);
 i=interactionEvent(i,{type:'keyboard',active:true});assert.equal(resolve().alpha,.85);
 i=interactionEvent(i,{type:'focus',focused:false});assert.equal(resolve().alpha,.3);assert.equal(resolve({held:true}).alpha,.85);assert.equal(resolve({dialogHeld:true}).alpha,.85);
 assert.equal(resolve().alpha,.3);assert.equal(contextOpacity(settings,i,{mode:'collapsed'}).alpha,.86);
});
test('active opacity can change without changing stored settings or passive alpha',()=>{
 const original=structuredClone(settings),i={...initialInteraction,pointerInside:true};
 assert.equal(contextOpacity(settings,i,{activeOpacity:.72}).alpha,.72);
 assert.equal(contextOpacity(settings,{...i,pointerInside:false},{activeOpacity:.72}).alpha,.3);
 assert.deepEqual(settings,original);
 assert.equal(contextOpacity(settings,{...initialInteraction,keyboardFocused:true}).alpha,.3);
});
test('context opacity preserves manual alpha when auto, pin or topmost is disabled',()=>{
 for(const key of ['autoOpacity','pinned','alwaysOnTop'])assert.deepEqual(contextOpacity({...settings,[key]:false},{pointerInside:true,focused:true}),{phase:'manual',alpha:.86});
 assert.equal(contextOpacity(settings,interactionEvent({pointerInside:true,focused:false},{type:'boundary-reset'})).alpha,.3);
});
test('auto opacity is a backwards compatible persistent boolean without changing user settings/tasks',()=>{
 const old=defaults();delete old.settings.autoOpacity;old.settings.opacity=.61;old.settings.alwaysOnTop=false;
 const loaded=validateState(old);assert.equal(loaded.settings.autoOpacity,true);assert.equal(loaded.settings.opacity,.61);assert.equal(loaded.settings.alwaysOnTop,false);assert.equal(loaded.schemaVersion,1);
 const next=applyCommand(loaded,{type:'settings',settings:{autoOpacity:false}}).state;assert.equal(validateState(next).settings.autoOpacity,false);assert.deepEqual(next.tasks,old.tasks);
 assert.throws(()=>applyCommand(loaded,{type:'settings',settings:{autoOpacity:'yes'}}),/自动透明度/);
});
