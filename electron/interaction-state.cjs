// Ephemeral interaction state; no writes or polling. Native focus and renderer
// pointer boundaries drive it. Editing/native dialogs have priority over leave.
const initialInteraction={pointerInside:false,focused:false,keyboardFocused:false};
function interactionEvent(state,event){
  if(event.type==='pointer')return{...state,pointerInside:event.inside};
  if(event.type==='focus')return{...state,focused:event.focused,...(!event.focused?{keyboardFocused:false}:{})};
  if(event.type==='keyboard')return{...state,keyboardFocused:event.active};
  if(event.type==='boundary-reset')return{...state,pointerInside:false,keyboardFocused:false};
  return state;
}
function isInteracting(interaction,{held=false,dialogHeld=false}={}){
  return !!(interaction.pointerInside||(interaction.focused&&interaction.keyboardFocused)||held||dialogHeld);
}
function contextOpacity(settings,interaction,{mode='expanded',held=false,dialogHeld=false,activeOpacity=.85}={}){
  if(!settings.autoOpacity||!settings.pinned||!settings.alwaysOnTop||mode!=='expanded')return{phase:'manual',alpha:settings.opacity};
  const active=isInteracting(interaction,{held,dialogHeld});
  return{phase:active?'active':'passive',alpha:active?activeOpacity:.3};
}
module.exports={initialInteraction,interactionEvent,contextOpacity,isInteracting};
