const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, globalShortcut, screen, dialog, powerMonitor, safeStorage } = require('electron');
const {CredentialStore}=require('./credential-store.cjs');
const {SyncEngine}=require('./sync-engine.cjs');
const path = require('node:path');
const fs = require('node:fs/promises');
const { Store, atomicWrite } = require('./store.cjs');
const { check, validateState, applyCommand } = require('./model.cjs');
const { PANEL, clampBounds, ballBounds, panelFromBall, inBall, transition } = require('./window-state.cjs');
const {initialInteraction,interactionEvent,contextOpacity,isInteracting}=require('./interaction-state.cjs');
const dataDir = process.env.FLOATTODO_DATA_DIR || path.join(app.getPath('appData'), 'FloatTodo-v1.2');
let syncEngine;
function publicState(state){const {sync,...local}=state;return local;}
app.setName('FloatTodo');
app.setPath('userData', dataDir);
app.setPath('sessionData', path.join(dataDir, 'session'));
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-component-update');
const testMode = process.env.FLOATTODO_TEST === '1';
// Isolated tests must not unregister or compete with the user's running V1 hotkey.
const shortcut = testMode && process.env.FLOATTODO_TEST_SHORTCUT === 'Control+Alt+Shift+F12' ? process.env.FLOATTODO_TEST_SHORTCUT : 'CommandOrControl+Alt+Shift+T';
const devUrl = !app.isPackaged && process.env.FLOATTODO_DEV_URL === 'http://127.0.0.1:5173' ? process.env.FLOATTODO_DEV_URL : null;
let win, tray, store, fullBounds, mode = 'expanded', held = false, quitting = false, programmatic = false;
let pointerTimer, inboxTimer, moveTimer, outsideSince = 0, ready = false;
let ballPosition=null, hoverSince=0, nativeDragging=false, suppressHover=false, panelDragged=false, dialogHeld=false;
let ballDrag=null, ballDragTimer, hitTimer, ballIgnored=false;
let panelDrag=null;
let warnings = [];
let interaction={...initialInteraction},lastContext='',activeOpacity=.85;
function opacityContext(){return{...contextOpacity(store.state.settings,interaction,{mode,held,dialogHeld,activeOpacity}),focused:interaction.focused,interactive:isInteracting(interaction,{held,dialogHeld}),activeOpacity};}
function publishInteraction(){if(!store)return;const value=opacityContext(),key=JSON.stringify(value);if(key!==lastContext){lastContext=key;send('ft:interaction',value);}}
function interact(event){interaction=interactionEvent(interaction,event);publishInteraction();}
function readPointerBoundary(){
  if(!win||win.isDestroyed())return;
  // One coordinate read per boundary/focus event, never an opacity polling loop.
  const p=screen.getCursorScreenPoint(),b=win.getBounds();
  interact({type:'pointer',inside:mode==='expanded'&&p.x>=b.x&&p.x<b.x+b.width&&p.y>=b.y&&p.y<b.y+b.height});
}
function send(channel, data) { if (win && !win.isDestroyed()) win.webContents.send(channel, data); }
function warn(message) { if(warnings.at(-1)===message)return; warnings=[...warnings.slice(-19),message]; send('ft:notice', message); }
function areas() { return screen.getAllDisplays().map(d => d.workArea); }
function updateBallHit(){
  if(!win||win.isDestroyed()||mode!=='collapsed')return;
  const ignore=!ballDrag&&!inBall(screen.getCursorScreenPoint(),win.getBounds());
  if(ignore!==ballIgnored){ballIgnored=ignore;win.setIgnoreMouseEvents(ignore,{forward:true});}
}
function setBounds(bounds) { programmatic = true; win.setBounds(bounds); setTimeout(() => { programmatic = false; }, 200); }
function moveBallDrag(){
  if(!ballDrag||mode!=='collapsed')return;
  const p=screen.getCursorScreenPoint(),start=ballDrag;
  const b=ballBounds({x:start.bounds.x+p.x-start.cursor.x,y:start.bounds.y+p.y-start.cursor.y},fullBounds,areas());
  ballPosition={x:b.x,y:b.y};const old=win.getBounds();if(old.x!==b.x||old.y!==b.y)setBounds(b);
}
async function endBallDrag(){
  if(!ballDrag)return;
  moveBallDrag();ballDrag=null;clearInterval(ballDragTimer);nativeDragging=false;suppressHover=true;hoverSince=0;
  await saveBounds(true);
}
function movePanelDrag(){
  if(!panelDrag||mode!=='expanded')return;
  const p=screen.getCursorScreenPoint(),b=clampBounds({...panelDrag.bounds,x:panelDrag.bounds.x+p.x-panelDrag.cursor.x,y:panelDrag.bounds.y+p.y-panelDrag.cursor.y},areas()),old=win.getBounds();
  if(b.x!==old.x||b.y!==old.y){panelDragged=true;setBounds(b);}
}
async function endPanelDrag(){if(!panelDrag)return;movePanelDrag();panelDrag=null;nativeDragging=false;await saveBounds(true);}
function changeMode(next) {
  if (!win || win.isDestroyed()) return;
  if (next === mode && next !== 'expanded') return;
  if (mode === 'expanded' && next === 'collapsed') fullBounds = clampBounds(win.getBounds(), areas());
  const wasCollapsed=mode==='collapsed'||(mode==='hidden'&&!store.state.settings.pinned);
  if(mode!==next)interaction=interactionEvent(interaction,{type:'boundary-reset'});
  mode=next;outsideSince=0;hoverSince=0;publishInteraction();
  send('ft:mode', mode);
  if (next === 'hidden') { win.hide(); return; }
  if (next === 'collapsed') {
    const b=ballBounds(ballPosition,fullBounds,areas());ballPosition={x:b.x,y:b.y};
    // Win10 1903 setShape has a hard, black, DIP-stepped perimeter at 250%.
    // Let the transparent compositor antialias the CSS circle; independently
    // pass through its transparent corners using cursor-based native hit routing.
    win.setHasShadow(false);win.setShape([]);setBounds(b);updateBallHit();
  } else {
    win.setIgnoreMouseEvents(false);ballIgnored=false;win.setShape([]);win.setHasShadow(true);
    if(wasCollapsed)fullBounds=panelFromBall(fullBounds,ballBounds(ballPosition,fullBounds,areas()),areas());
    fullBounds = clampBounds(fullBounds, areas()); setBounds(fullBounds);
  }
  win.showInactive();
}
function restore(focus = true) { changeMode(transition(mode, 'restore', store.state.settings.pinned)); if (focus) win.focus(); }
async function updateSettings(settings) {
  // An explicit Pin action also pins above other apps. Loading an existing
  // profile never rewrites the user's stored topmost/manual opacity choices.
  if(settings.pinned===true&&settings.alwaysOnTop===undefined)settings={...settings,alwaysOnTop:true};
  const result = await store.execute({type:'settings', settings});
  win.setAlwaysOnTop(store.state.settings.alwaysOnTop);
  if ('pinned' in settings) changeMode(transition(mode, settings.pinned ? 'pin' : 'unpin', settings.pinned, held||dialogHeld));
  publishInteraction();rebuildTray(); return result;
}
function openSettings() { restore(); send('ft:settings', true); }
function trayAction(fn) { return () => Promise.resolve().then(fn).catch(err => warn(err.message)); }
function rebuildTray() {
  if (!tray || !store) return;
  const s = store.state.settings;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label:'显示 / 恢复完整窗口', click:() => restore() },
    { label:'隐藏到托盘', click:() => changeMode('hidden') },
    { type:'separator' },
    { label:'固定展开', type:'checkbox', checked:s.pinned, click:trayAction(() => updateSettings({pinned:!s.pinned})) },
    { label:'始终置顶', type:'checkbox', checked:s.alwaysOnTop, click:trayAction(() => updateSettings({alwaysOnTop:!s.alwaysOnTop})) },
    { label:'透明度 / 设置', click:openSettings },
    { type:'separator' },
    { label:'退出 FloatTodo', click:() => app.quit() }
  ]));
}
function trusted(event) {
  check(win && event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame, '来源不受信任');
  const url = event.senderFrame.url;
  check(devUrl ? url === `${devUrl}/` : url === require('node:url').pathToFileURL(path.join(__dirname,'../dist/index.html')).href, '页面来源不受信任');
}
function handle(channel, fn) { ipcMain.handle(channel, async (event,...args) => { try { trusted(event); return {ok:true,data:await fn(...args)}; } catch(err) { return {ok:false,error:err.message}; } }); }
function registerIPC() {
  handle('ft:panel-drag',async action=>{
    check(['start','move','end'].includes(action),'面板拖动操作无效');
    if(action==='end'){await endPanelDrag();return true;}
    if(action==='move'){movePanelDrag();return true;}
    check(mode==='expanded','仅展开时可拖动面板');const b=win.getBounds(),cursor=screen.getCursorScreenPoint();
    check(cursor.x>=b.x&&cursor.x<b.x+b.width&&cursor.y>=b.y&&cursor.y<b.y+32,'鼠标不在标题栏');
    panelDrag={bounds:b,cursor};nativeDragging=true;return true;
  });
  handle('ft:pointer',action=>{
    check(['enter','leave','keyboard-enter','keyboard-leave'].includes(action),'交互边界操作无效');
    if(action.startsWith('keyboard-'))interact({type:'keyboard',active:action==='keyboard-enter'});else readPointerBoundary();return true;
  });
  handle('ft:active-opacity',value=>{check(typeof value==='number'&&Number.isFinite(value)&&value>=.3&&value<=1,'交互态不透明度须为30%–100%');activeOpacity=value;publishInteraction();return opacityContext();});
  handle('ft:ball-drag',async action=>{
    check(action==='start'||action==='end','悬浮球拖动操作无效');
    if(action==='end'){await endBallDrag();return true;}
    check(mode==='collapsed','仅收起时可拖动悬浮球');
    const b=win.getBounds(),cursor=screen.getCursorScreenPoint();check(inBall(cursor,b),'鼠标不在悬浮球内');
    ballDrag={bounds:b,cursor};nativeDragging=true;hoverSince=0;suppressHover=true;
    updateBallHit();
    clearInterval(ballDragTimer);ballDragTimer=setInterval(moveBallDrag,16);return true;
  });
  handle('ft:get', () => ({state:publicState(store.snapshot()),mode,interaction:opacityContext(),warnings,dataDir,version:app.getVersion(),hotkey:globalShortcut.isRegistered(shortcut)}));
  handle('ft:sync',async (action,payload={})=>{
    check(['status','connect','projects','preview','confirm','now','disconnect','resolve','resume-setup'].includes(action),'同步操作无效');
    check(payload&&typeof payload==='object'&&!Array.isArray(payload)&&JSON.stringify(payload).length<100000,'同步参数无效');
    if(action==='status')return syncEngine.status();
    if(action==='connect')return syncEngine.connect(payload.token,payload.confirmed);
    if(action==='projects')return syncEngine.listProjects();
    if(action==='preview')return syncEngine.discover(payload.projectId);
    if(action==='confirm')return syncEngine.confirm(payload);
    if(action==='resume-setup')return syncEngine.resumeSetup(payload.confirmed);
    if(action==='now')return syncEngine.sync();
    if(action==='disconnect'){check(payload.confirmed===true,'请确认断开连接');return syncEngine.disconnect();}
    check(typeof payload.id==='string'&&payload.id.length<=200,'冲突 ID 无效');return syncEngine.resolve(payload.id,payload.choice);
  });
  handle('ft:command', async command => {
    check(command && JSON.stringify(command).length < 150000, '操作内容过大');
    if (command.type === 'settings') {
      check(command.settings && !['bounds','ballPosition','layoutVersion'].some(k=>k in command.settings), '窗口位置与布局由主进程管理');
      applyCommand(store.snapshot(), command);
      const previousLogin = store.state.settings.launchAtLogin;
      if ('launchAtLogin' in command.settings) {
        check(typeof command.settings.launchAtLogin === 'boolean','开机启动设置无效');
        check(app.isPackaged && !testMode, '开发 / 测试模式不可修改开机启动，请在正式 EXE 内设置');
        const exe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
        app.setLoginItemSettings({openAtLogin:command.settings.launchAtLogin,path:exe,args:[]});
      }
      try { return await updateSettings(command.settings); }
      catch(err) {
        if('launchAtLogin' in command.settings) app.setLoginItemSettings({openAtLogin:previousLogin,path:process.env.PORTABLE_EXECUTABLE_FILE||process.execPath,args:[]});
        throw err;
      }
    }
    check(['add','update','toggle','delete','restore','reorder','group-add','group-update','group-delete'].includes(command.type),'操作不在白名单内');
    return store.execute(command);
  });
  handle('ft:window', action => {
    check(['hide','hold','release','restore','quit'].includes(action), '窗口操作无效');
    if(action==='hide') changeMode('hidden');
    if(action==='hold') { held=true; outsideSince=0; }
    if(action==='release') { held=false; outsideSince=0; }
    publishInteraction();
    if(action==='restore') restore();
    if(action==='quit') setTimeout(()=>app.quit(),50);
    return true;
  });
  handle('ft:export', async () => {
    dialogHeld=true;publishInteraction();
    try {
      const r = await dialog.showSaveDialog(win,{title:'导出 FloatTodo 数据',defaultPath:'FloatTodo-backup.json',filters:[{name:'JSON',extensions:['json']}]});
      if(r.canceled || !r.filePath) return {cancelled:true};
      await atomicWrite(r.filePath,publicState(store.snapshot())); return {path:r.filePath};
    } finally { dialogHeld=false; outsideSince=0;publishInteraction(); }
  });
  handle('ft:import', async () => {
    dialogHeld=true;publishInteraction();
    try {
      const r=await dialog.showOpenDialog(win,{title:'恢复 FloatTodo 数据',properties:['openFile'],filters:[{name:'JSON',extensions:['json']}]});
      if(r.canceled || !r.filePaths[0]) return {cancelled:true};
      check((await fs.stat(r.filePaths[0])).size <= 50000000,'文件超过50MB，请选择有效备份');
      const imported=JSON.parse(await fs.readFile(r.filePaths[0],'utf8'));
      const next=validateState(imported);
      if(imported.settings?.layoutVersion!==2&&next.settings.bounds)next.settings.bounds={...next.settings.bounds,...PANEL};
      // Autostart is a machine preference. Importing a file never changes the registry.
      next.settings.launchAtLogin=store.state.settings.launchAtLogin;
      const confirm=await dialog.showMessageBox(win,{type:'warning',buttons:['取消','覆盖并恢复'],defaultId:0,cancelId:0,title:'恢复备份',message:`将用 ${next.tasks.length} 项任务、${next.groups.length} 个分组覆盖当前数据。`,detail:'当前数据会另存为 before-import-时间戳.json。此操作无法通过撤销恢复。'});
      if(confirm.response!==1) return {cancelled:true};
      await store.replace(next);win.setAlwaysOnTop(store.state.settings.alwaysOnTop);fullBounds=clampBounds(store.state.settings.bounds,areas());ballPosition=store.state.settings.ballPosition;restore();rebuildTray();return{imported:next.tasks.length};
    } finally { dialogHeld=false; outsideSince=0;publishInteraction(); }
  });
}
async function saveBounds(force=false) {
  if(mode==='hidden'||(!force&&programmatic)||!win||win.isDestroyed())return;
  if(mode==='expanded'){
    fullBounds=clampBounds(win.getBounds(),areas());
    if(panelDragged){const b=ballBounds(null,fullBounds,areas());ballPosition={x:b.x,y:b.y};panelDragged=false;}
  }else{const b=ballBounds(win.getBounds(),fullBounds,areas());ballPosition={x:b.x,y:b.y};if(b.x!==win.getBounds().x||b.y!==win.getBounds().y)setBounds(b);}
  try{await store.execute({type:'settings',settings:{bounds:fullBounds,ballPosition}});}catch(err){warn(`窗口位置未保存：${err.message}`);}
}
async function create() {
  store=new Store(dataDir, state => {send('ft:state',publicState(state));publishInteraction();syncEngine?.publish();}, warn);
  await store.init();
  syncEngine=new SyncEngine(store,new CredentialStore(dataDir,safeStorage),status=>send('ft:sync-status',status));
  await syncEngine.init();
  const initial=store.legacyLayout&&store.state.settings.bounds?{...store.state.settings.bounds,...PANEL}:store.state.settings.bounds;
  fullBounds=clampBounds(initial,areas());
  const ball=ballBounds(store.state.settings.ballPosition,fullBounds,areas());ballPosition={x:ball.x,y:ball.y};
  if(store.legacyLayout)await store.execute({type:'settings',settings:{bounds:fullBounds,ballPosition,layoutVersion:2}});
  win=new BrowserWindow({ ...fullBounds, minWidth:48,minHeight:48, frame:false,transparent:true,backgroundColor:'#00000000',roundedCorners:true,
    resizable:false,maximizable:false,fullscreenable:false,show:false,skipTaskbar:true,hasShadow:true,title:'FloatTodo',
    icon:path.join(__dirname,'../assets/icon.png'),alwaysOnTop:store.state.settings.alwaysOnTop,
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,devTools:!app.isPackaged || testMode} });
  win.setMenu(null);
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(event,url)=>{ if(url!==win.webContents.getURL())event.preventDefault(); });
  win.webContents.session.setPermissionRequestHandler((_wc,_permission,cb)=>cb(false));
  win.webContents.session.setPermissionCheckHandler(()=>false);
  win.webContents.session.webRequest.onBeforeRequest({urls:['<all_urls>']}, (details, callback) => {
    const u = new URL(details.url);
    const network = ['http:','https:','ws:','wss:'].includes(u.protocol);
    const allowedDev = devUrl && ['http:','ws:'].includes(u.protocol) && u.hostname === '127.0.0.1' && u.port === '5173';
    callback({cancel:!!(network && !allowedDev)});
  });
  win.webContents.on('render-process-gone',(_event,details)=>{ if(!quitting) { dialog.showErrorBox('FloatTodo 界面已退出',`${details.reason}。数据已保留，可从托盘重新启动界面。`); win.reload(); } });
  win.on('close',event=>{ if(!quitting) {event.preventDefault();changeMode('hidden');} });
  win.on('will-move',()=>{if(mode==='collapsed'){nativeDragging=true;hoverSince=0;}else if(mode==='expanded')panelDragged=true;});
  win.on('moved',()=>{if(nativeDragging){nativeDragging=false;suppressHover=true;hoverSince=0;}clearTimeout(moveTimer);moveTimer=setTimeout(saveBounds,300);});
  win.on('move',()=>{clearTimeout(moveTimer);if(!programmatic)moveTimer=setTimeout(saveBounds,500);});
  win.on('system-context-menu',event=>event.preventDefault());
  win.on('focus',()=>{if(process.platform!=='win32')interaction=interactionEvent(interaction,{type:'focus',focused:true});readPointerBoundary();});
  win.on('blur',()=>{if(process.platform!=='win32')interaction=interactionEvent(interaction,{type:'focus',focused:false});readPointerBoundary();if(ballDrag)endBallDrag().catch(err=>warn(err.message));if(panelDrag)endPanelDrag().catch(err=>warn(err.message));});
  // WM_ACTIVATE is the actual Windows top-level activation state. Renderer/CDP
  // focus can differ from it; never use simulated web focus as desktop focus.
  if(process.platform==='win32')win.hookWindowMessage(0x0006,wParam=>{const focused=wParam.readUInt16LE(0)!==0;setImmediate(()=>{interaction=interactionEvent(interaction,{type:'focus',focused});readPointerBoundary();});});
  // The draggable caption is a native non-client area, outside DOM pointer events.
  if(process.platform==='win32')for(const message of [0x0200,0x02A3,0x00A0,0x02A2])win.hookWindowMessage(message,()=>setImmediate(readPointerBoundary));
  win.webContents.on('before-mouse-event',(_event,mouse)=>{if(mode==='expanded'&&['mouseMove','mouseEnter','mouseLeave'].includes(mouse.type))readPointerBoundary();});
  tray=new Tray(nativeImage.createFromPath(path.join(__dirname,'../assets/icon.png')));
  tray.setToolTip('FloatTodo · Ctrl+Alt+Shift+T'); tray.on('double-click',()=>restore()); tray.on('click',()=>restore()); rebuildTray();
  if(testMode) app.floatTodoTest = { get sync(){return syncEngine;},get tray(){return tray;}, get mode(){return mode;},get interaction(){return{...interaction,held,dialogHeld,mode,context:opacityContext(),nativeFocused:win.isFocused()};} };
  registerIPC();
  if(!globalShortcut.register(shortcut,()=>restore()))warn('快捷键 Ctrl+Alt+Shift+T 注册失败（可能被占用）。请使用系统托盘恢复窗口。');
  await (devUrl ? win.loadURL(devUrl) : win.loadFile(path.join(__dirname,'../dist/index.html')));
  ready=true; win.showInactive();
  if(!store.state.settings.pinned) changeMode('collapsed');
  hitTimer=setInterval(updateBallHit,8);
  pointerTimer=setInterval(()=>{
    if(!ready||mode==='hidden'||store.state.settings.pinned||held||dialogHeld||nativeDragging||panelDrag||win.isDestroyed())return;
    const p=screen.getCursorScreenPoint(), b=win.getBounds();
    const inside=mode==='collapsed'?inBall(p,b):(p.x>=b.x&&p.x<b.x+b.width&&p.y>=b.y&&p.y<b.y+b.height);
    if(inside){outsideSince=0;if(mode==='collapsed'&&!suppressHover){if(!hoverSince)hoverSince=Date.now();if(Date.now()-hoverSince>400)changeMode(transition(mode,'enter',false));}}
    else{hoverSince=0;suppressHover=false;if(mode==='expanded'&&!store.state.settings.pinned){if(!outsideSince)outsideSince=Date.now();if(Date.now()-outsideSince>950)changeMode(transition(mode,'leave',false,held));}}
  },100);
  inboxTimer=setInterval(()=>store.drain().catch(err=>warn(`队列处理失败：${err.message}`)),350);
  await store.drain();
  const reposition=()=>{fullBounds=clampBounds(fullBounds,areas());const b=ballBounds(ballPosition,fullBounds,areas());ballPosition={x:b.x,y:b.y};if(mode==='expanded')setBounds(fullBounds);else if(mode==='collapsed'){setBounds(b);updateBallHit();}};
  screen.on('display-removed',reposition);screen.on('display-metrics-changed',reposition);powerMonitor.on('resume',reposition);
}
if(!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance',()=>{if(ready)restore();});
  app.on('activate',()=>{if(ready)restore();});
  app.on('window-all-closed',()=>{});
  app.on('before-quit',event=>{
    if(quitting)return;
    event.preventDefault();
    // Flush pending move and writes before releasing the single-instance lock.
    clearInterval(pointerTimer);clearInterval(inboxTimer);clearInterval(ballDragTimer);clearInterval(hitTimer);clearTimeout(moveTimer);syncEngine?.stop();
    Promise.resolve(syncEngine?.tail).then(()=>saveBounds(true)).then(()=>store?.chain).finally(()=>{quitting=true;globalShortcut.unregisterAll();tray?.destroy();app.quit();});
  });
  app.whenReady().then(create).catch(err=>{dialog.showErrorBox('FloatTodo 无法启动',`${err.message}\n数据目录：${dataDir}`);quitting=true;app.quit();});
}
