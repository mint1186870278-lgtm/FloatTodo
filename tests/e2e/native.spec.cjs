const {test,expect,_electron:electron}=require('@playwright/test');
const fs=require('node:fs/promises');const path=require('node:path');const{execFileSync}=require('node:child_process');
const root=path.resolve('.');let app,page,dir;
function native(action,opts={}){const args=['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts/native-test.ps1'),'-Action',action];for(const[k,v]of Object.entries(opts))args.push(`-${k}`,String(v));return execFileSync('powershell.exe',args,{windowsHide:true,encoding:'utf8'}).trim();}
async function state(){return (await page.evaluate(()=>window.floatTodo.get())).data.state;}
async function cmd(c){const r=await page.evaluate(c=>window.floatTodo.command(c),c);expect(r.ok,r.error).toBe(true);return r.data;}
async function launch(){const env={...process.env,FLOATTODO_DATA_DIR:dir,FLOATTODO_TEST:'1',FLOATTODO_TEST_SHORTCUT:'Control+Alt+Shift+F12'};delete env.ELECTRON_RUN_AS_NODE;app=await electron.launch({args:[root],env});page=await app.firstWindow();await expect(page.getByLabel('新任务标题',{exact:true})).toBeVisible();}
test.beforeEach(async()=>{await fs.mkdir('artifacts/test-data',{recursive:true});dir=await fs.mkdtemp(path.join(root,'artifacts/test-data/native-'));await launch();});
test.afterEach(async()=>{if(app)await app.close();});
test('desktop compositor shows real alpha over controlled background without fading text',async()=>{
  const rect=await app.evaluate(async({BrowserWindow,screen})=>{
    const main=BrowserWindow.getAllWindows()[0];globalThis.ftMain=main;
    main.setBounds({x:180,y:50,width:340,height:450});
    const back=new BrowserWindow({x:180,y:50,width:340,height:450,frame:false,backgroundColor:'#143c78',show:false,webPreferences:{sandbox:true}});
    globalThis.ftBack=back;await back.loadURL('data:text/html,<body style="background:%23143c78;margin:0"></body>');
    main.setParentWindow(back);back.setAlwaysOnTop(true);back.show();main.show();main.setAlwaysOnTop(true);main.moveTop();main.focus();
    const b=main.getBounds();const p=screen.dipToScreenPoint({x:b.x,y:b.y});const end=screen.dipToScreenPoint({x:b.x+b.width,y:b.y+b.height});
    return{X:p.x,Y:p.y,Width:end.x-p.x,Height:end.y-p.y};
  });
  await cmd({type:'settings',settings:{opacity:.3,alwaysOnTop:true,autoOpacity:false}});await page.waitForTimeout(350);
  await app.evaluate(()=>{globalThis.ftMain.moveTop();globalThis.ftMain.focus();});
  const alpha=native('capture',{...rect,OutputPath:path.join(root,'artifacts/ui-validation/07-native-alpha30.png')}).split(',').map(Number);
  await cmd({type:'settings',settings:{opacity:1}});await page.waitForTimeout(350);
  await app.evaluate(()=>{globalThis.ftMain.moveTop();globalThis.ftMain.focus();});
  const opaque=native('capture',{...rect,OutputPath:path.join(root,'artifacts/ui-validation/08-native-alpha100.png')}).split(',').map(Number);
  await fs.writeFile('artifacts/ui-validation/compositor.json',JSON.stringify({alpha30:alpha,alpha100:opaque,rect},null,2));
  expect(alpha[0]).toBeLessThan(160);expect(alpha[2]).toBeGreaterThan(alpha[0]);expect(opaque[0]).toBeGreaterThan(235);
  expect(await app.evaluate(()=>globalThis.ftMain.webContents.isDevToolsOpened())).toBe(false);
  await app.evaluate(async()=>{await globalThis.ftBack.webContents.executeJavaScript("window.hits=0;document.addEventListener('click',()=>window.hits++);");});
  await cmd({type:'settings',settings:{pinned:false}});
  await expect.poll(()=>app.evaluate(()=>globalThis.ftMain.getBounds().width)).toBe(48);
  native('click',{X:rect.X+rect.Width/2,Y:rect.Y+rect.Height/2});
  await expect.poll(()=>app.evaluate(()=>globalThis.ftBack.webContents.executeJavaScript('window.hits'))).toBe(1);
  await app.evaluate(()=>{globalThis.ftMain.setParentWindow(null);globalThis.ftBack.destroy();});
});
test('native header drag saves position and settings survive actual restart',async()=>{
  await cmd({type:'settings',settings:{alwaysOnTop:true}});
  await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.show();w.moveTop();w.focus();});
  await page.waitForTimeout(250);
  const points=await app.evaluate(({BrowserWindow,screen})=>{const b=BrowserWindow.getAllWindows()[0].getBounds();return {before:b,start:screen.dipToScreenPoint({x:b.x+90,y:b.y+22}),end:screen.dipToScreenPoint({x:b.x+10,y:b.y+70})};});
  native('drag',{X:points.start.x,Y:points.start.y,EndX:points.end.x,EndY:points.end.y});
  await expect.poll(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getBounds().x)).not.toBe(points.before.x);
  const moved=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getBounds());
  await expect.poll(async()=>(await state()).settings.bounds?.x).toBe(moved.x);
  await cmd({type:'group-update',id:'work',collapsed:true});await cmd({type:'settings',settings:{opacity:.65,alwaysOnTop:true}});
  const saved=(await state()).settings.bounds;await app.close();app=null;await launch();
  const s=await state();expect(s.settings.opacity).toBe(.65);expect(s.settings.alwaysOnTop).toBe(true);expect(s.groups[0].collapsed).toBe(true);
  const restored=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getBounds());expect(restored.x).toBe(saved.x);expect(restored.y).toBe(saved.y);
});
test('tray handlers and real global hotkey restore hidden window; close keeps one window',async()=>{
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());
  expect(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length)).toBe(1);
  expect(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible())).toBe(false);
  await app.evaluate(({app})=>app.floatTodoTest.tray.emit('click'));
  expect(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible())).toBe(true);
  await page.evaluate(()=>window.floatTodo.window('hide'));
  const registered=await app.evaluate(({globalShortcut})=>globalShortcut.isRegistered('Control+Alt+Shift+F12'));expect(registered).toBe(true);
  native('hotkey',{HotkeyCode:123});await expect.poll(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible())).toBe(true);
  expect(await app.evaluate(({app})=>app.floatTodoTest.tray.isDestroyed())).toBe(false);
});
test('offline CLI queue consumes on next launch, then list complete move and wait work',async()=>{
  await app.close();app=null;
  const env={...process.env,FLOATTODO_DATA_DIR:dir};
  const cli=(...args)=>execFileSync(process.execPath,['cli/todo.cjs',...args],{cwd:root,env,encoding:'utf8',windowsHide:true});
  const queued=cli('add','--title','book friday dinner','--category','life','--command-id','offline-dinner');expect(queued).toContain('queued');
  await launch();await expect(page.locator('.task-title')).toHaveText('book friday dinner');
  const listed=JSON.parse(cli('list'));const id=listed.tasks[0].id;
  const complete=cli('complete','--id',id,'--wait','8000');expect(complete).toContain('applied');
  const moved=cli('move','--id',id,'--category','work','--wait','8000');expect(moved).toContain('applied');
  const after=JSON.parse(cli('list'));expect(after.tasks[0].status).toBe('completed');expect(after.tasks[0].groupId).toBe('work');
  await fs.writeFile('artifacts/ui-validation/cli-demo.txt',[queued,JSON.stringify(listed,null,2),complete,moved,JSON.stringify(after,null,2)].join('\n'));
});
