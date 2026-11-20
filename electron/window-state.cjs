const PANEL={width:340,height:450}, BALL_SIZE=48;
function areaFor(p,areas){return areas.find(a=>p.x>=a.x&&p.x<a.x+a.width&&p.y>=a.y&&p.y<a.y+a.height)||areas[0];}
function clampBounds(bounds,areas){
  const valid=bounds&&['x','y','width','height'].every(k=>Number.isFinite(bounds[k]));
  const preferred=valid?areas.find(a=>bounds.x+bounds.width/2>=a.x&&bounds.x+bounds.width/2<a.x+a.width&&bounds.y+30>=a.y&&bounds.y+30<a.y+a.height):null;
  const a=preferred||areas[0],width=Math.min(valid?Math.max(300,Math.round(bounds.width)):PANEL.width,a.width),height=Math.min(valid?Math.max(330,Math.round(bounds.height)):PANEL.height,a.height);
  return{x:Math.round(Math.max(a.x,Math.min(a.x+a.width-width,valid&&preferred?bounds.x:a.x+a.width-width-16))),y:Math.round(Math.max(a.y,Math.min(a.y+a.height-height,valid&&preferred?bounds.y:a.y+24))),width,height};
}
function ballBounds(position,full,areas){
  const valid=position&&Number.isFinite(position.x)&&Number.isFinite(position.y),p=valid?position:{x:full.x+full.width-BALL_SIZE,y:full.y};
  const a=areaFor({x:p.x+24,y:p.y+24},areas),visible=valid&&areas.some(a=>p.x+24>=a.x&&p.x+24<a.x+a.width&&p.y+24>=a.y&&p.y+24<a.y+a.height);
  return{x:Math.round(Math.max(a.x,Math.min(a.x+a.width-BALL_SIZE,!valid||visible?p.x:a.x+a.width-BALL_SIZE-16))),y:Math.round(Math.max(a.y,Math.min(a.y+a.height-BALL_SIZE,!valid||visible?p.y:a.y+24))),width:BALL_SIZE,height:BALL_SIZE};
}
function panelFromBall(full,ball,areas){const a=areaFor({x:ball.x+24,y:ball.y+24},areas);return clampBounds({...full,x:ball.x+24>a.x+a.width/2?ball.x+48-full.width:ball.x,y:ball.y+24>a.y+a.height/2?ball.y+48-full.height:ball.y},[a]);}
function inBall(p,b){return(p.x-b.x-24)**2+(p.y-b.y-24)**2<=24**2;}
function transition(mode, event, pinned, held = false) {
  if (event === 'hide') return 'hidden';
  if (event === 'restore' || event === 'enter' || event === 'pin') return 'expanded';
  if ((event === 'leave' || event === 'unpin') && !pinned && !held && mode !== 'hidden') return 'collapsed';
  return mode;
}
module.exports={PANEL,BALL_SIZE,clampBounds,ballBounds,panelFromBall,inBall,transition};
