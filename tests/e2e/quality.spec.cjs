const {test,expect,_electron:electron,chromium}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve('.'),out='artifacts/interaction-validation';let app,page,dir,errors;
async function launch(){const env={...process.env,FLOATTODO_DATA_DIR:dir,FLOATTODO_TEST:'1',FLOATTODO_TEST_SHORTCUT:'Control+Alt+Shift+F12'};delete env.ELECTRON_RUN_AS_NODE;app=await electron.launch(process.env.FLOATTODO_QUALITY_EXE?{executablePath:path.resolve(process.env.FLOATTODO_QUALITY_EXE),args:[],env}:{args:[root],env});page=await app.firstWindow();await expect(page.locator('.quick-add')).toBeVisible();page.on('pageerror',e=>errors.push(e.message));}
async function cmd(c){const r=await page.evaluate(c=>window.floatTodo.command(c),c);expect(r.ok,r.error).toBe(true);return r.data;}
async function snap(){return(await page.evaluate(()=>window.floatTodo.get())).data;}
async function del(title){await page.getByRole('button',{name:`编辑 ${title}`,exact:true}).click();await page.getByRole('button',{name:'删除',exact:true}).click();await page.getByRole('button',{name:'确认删除',exact:true}).click();await expect(page.locator('.undo-toast')).toContainText(title);}
function native(action,opts={}){const args=['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts/native-test.ps1'),'-Action',action];for(const [k,v] of Object.entries(opts))args.push(`-${k}`,String(v));return execFileSync('powershell.exe',args,{windowsHide:true,encoding:'utf8'}).trim();}
async function point(dip){return app.evaluate(({screen},dip)=>screen.dipToScreenPoint(dip),dip);}
async function cursor(dip){native('cursor',await point(dip));}
async function click(dip){const p=await point(dip);native('click',{X:p.x,Y:p.y});}
async function alpha(value){try{await expect.poll(()=>page.locator('.panel').evaluate(el=>Number(getComputedStyle(el).backgroundColor.split(',').pop().replace(')','')))).toBeCloseTo(value,2);}catch(e){const diagnostic=await app.evaluate(({app,BrowserWindow,screen})=>{const w=BrowserWindow.getAllWindows()[0],cursor=screen.getCursorScreenPoint();return{interaction:app.floatTodoTest.interaction,bounds:w.getBounds(),cursor,physical:screen.dipToScreenPoint(cursor),handle:String(w.getNativeWindowHandle().readBigUInt64LE())};});diagnostic.native=native('probe',{X:diagnostic.physical.x,Y:diagnostic.physical.y,WindowHandle:diagnostic.handle});diagnostic.dom=await page.evaluate(()=>({hover:document.querySelector('.panel').matches(':hover'),focus:document.hasFocus()}));await fs.writeFile(`${out}/opacity-failure-diagnostic.json`,JSON.stringify(diagnostic,null,2));throw e;}}
async function capture(name){const rect=await app.evaluate(({BrowserWindow,screen})=>{const b=BrowserWindow.getAllWindows()[0].getBounds(),p=screen.dipToScreenPoint(b),e=screen.dipToScreenPoint({x:b.x+b.width,y:b.y+b.height});return{X:p.x,Y:p.y,Width:e.x-p.x,Height:e.y-p.y};});return native('capture',{...rect,OutputPath:path.join(root,out,name)}).split(',').map(Number);}
test.beforeEach(async()=>{errors=[];dir=await fs.mkdtemp(path.join(root,'artifacts/test-data/quality-'));await launch();});
test.afterEach(async()=>{if(app)await app.close();expect(errors).toEqual([]);});
test('Undo toast holds 3000ms, fades 250ms, removes DOM and leaves quick-add usable',async()=>{
 await cmd({type:'add',title:'toast expiry'});const footer=await page.locator('footer').boundingBox();
 await page.evaluate(()=>{window.toastFrames=[];window.toastStart=0;const until=performance.now()+6500;function sample(){const el=document.querySelector('.undo-toast');if(el&&!window.toastStart)window.toastStart=performance.now();if(window.toastStart)window.toastFrames.push({ms:performance.now()-window.toastStart,exists:!!el,fading:el?.classList.contains('fading'),opacity:el?Number(getComputedStyle(el).opacity):null});if(performance.now()<until)requestAnimationFrame(sample);}requestAnimationFrame(sample);});
 await del('toast expiry');await page.screenshot({path:`${out}/toast-visible.png`});
 await page.getByLabel('新任务标题',{exact:true}).fill('can type while toast expires');
 await page.waitForTimeout(2200);await cmd({type:'group-update',id:'work',name:'work'});await expect(page.locator('.undo-toast')).not.toHaveClass(/fading/);
 await expect(page.locator('.undo-toast')).toHaveClass(/fading/);await page.waitForTimeout(100);await page.screenshot({path:`${out}/toast-fading.png`});
 await expect(page.locator('.undo-toast')).toHaveCount(0);expect((await page.locator('footer').boundingBox()).y).toBe(footer.y);
 await page.getByLabel('新任务标题',{exact:true}).press('Enter');await expect(page.locator('.task-title')).toHaveText('can type while toast expires');await page.screenshot({path:`${out}/toast-removed.png`});
 const frames=await page.evaluate(()=>window.toastFrames),fade=frames.find(f=>f.fading),gone=frames.find(f=>!f.exists);
 expect(fade.ms).toBeGreaterThan(2900);expect(fade.ms).toBeLessThan(3100);expect(gone.ms).toBeGreaterThan(3150);expect(gone.ms).toBeLessThan(3400);expect(frames.some(f=>f.fading&&f.opacity>0&&f.opacity<1)).toBe(true);
 await fs.writeFile(`${out}/toast-timing.json`,JSON.stringify({firstFadeMs:fade.ms,firstAbsentMs:gone.ms,footerStable:true,frames},null,2));
});
test('repeated undo restores exact original data and cancels timers',async()=>{
 await cmd({type:'add',title:'undo one',notes:'retain notes',dueDate:'2026-12-15',category:'life'});await cmd({type:'add',title:'undo two'});const original=(await snap()).state.tasks;
 for(const title of ['undo one','undo two']){await del(title);await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(page.locator('.undo-toast')).toHaveCount(0);await expect(page.getByText(title,{exact:true})).toBeVisible();}
 expect((await snap()).state.tasks.sort((a,b)=>a.order-b.order)).toEqual(original);await page.waitForTimeout(3400);await expect(page.locator('.undo-toast')).toHaveCount(0);expect((await snap()).state.tasks).toHaveLength(2);
 await app.close();app=null;await launch();expect((await snap()).state.tasks.sort((a,b)=>a.order-b.order)).toEqual(original);
 await page.getByRole('button',{name:'编辑 undo one',exact:true}).click();const first=original.find(t=>t.title==='undo one');await cmd({type:'update',id:first.id,title:'canonical deleted snapshot',notes:'updated while editor open'});await page.getByRole('button',{name:'删除',exact:true}).click();await page.getByRole('button',{name:'确认删除',exact:true}).click();await expect(page.locator('.undo-toast')).toContainText('canonical deleted snapshot');await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(page.locator('.undo-toast')).toHaveCount(0);expect((await snap()).state.tasks.find(t=>t.id===first.id)).toMatchObject({title:'canonical deleted snapshot',notes:'updated while editor open'});
 if(process.env.FLOATTODO_QUALITY_EXE){
  const cli=(...args)=>execFileSync(process.execPath,['cli/todo.cjs',...args],{cwd:root,env:{...process.env,FLOATTODO_DATA_DIR:dir},encoding:'utf8',windowsHide:true});
  const added=cli('add','--title','EXE CLI bridge','--category','life','--wait','8000');expect(added).toContain('applied');await expect(page.getByText('EXE CLI bridge',{exact:true})).toBeVisible();const id=(await snap()).state.tasks.find(t=>t.title==='EXE CLI bridge').id;
  expect(cli('complete','--id',id,'--wait','8000')).toContain('applied');expect(cli('move','--id',id,'--category','work','--wait','8000')).toContain('applied');await app.close();app=null;await launch();expect((await snap()).state.tasks.find(t=>t.id===id)).toMatchObject({status:'completed',groupId:'work'});await fs.writeFile(`${out}/exe-cli-bridge.json`,JSON.stringify({executablePath:process.env.FLOATTODO_QUALITY_EXE,id,restartedCompleted:true,groupId:'work',dataDir:dir},null,2));
 }
});
test('replacement delete has its own deadline and undo object; a new message replaces it',async()=>{
 await cmd({type:'add',title:'old deletion'});await cmd({type:'add',title:'new deletion'});await del('old deletion');await page.waitForTimeout(2200);await del('new deletion');await page.waitForTimeout(1050);
 await expect(page.locator('.undo-toast')).toContainText('new deletion');await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(page.locator('.undo-toast')).toHaveCount(0);expect((await snap()).state.tasks.map(t=>t.title)).toEqual(['new deletion']);
 await del('new deletion');const file=path.join(dir,'backup.json');await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},file);
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('button',{name:'导出 JSON',exact:true}).click();await page.getByRole('button',{name:'关闭对话框',exact:true}).click();await expect(page.locator('.undo-toast')).toHaveCount(0);await expect(page.getByRole('status')).toContainText('已导出到');
});
test('an older in-flight undo cannot dismiss or restore a newer deletion',async()=>{
 await cmd({type:'add',title:'older'});await cmd({type:'add',title:'newer'});await del('older');
 await app.evaluate(({ipcMain})=>{globalThis.originalRestoreHandler=ipcMain._invokeHandlers.get('ft:command');ipcMain.removeHandler('ft:command');ipcMain.handle('ft:command',async(event,c)=>{if(c.type==='restore'&&c.task.title==='older')await new Promise(r=>globalThis.releaseOldRestore=r);return globalThis.originalRestoreHandler(event,c);});});
 await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(page.getByRole('button',{name:'恢复中…',exact:true})).toBeDisabled();await del('newer');await app.evaluate(()=>globalThis.releaseOldRestore());
 await expect(page.getByText('older',{exact:true})).toBeVisible();await expect(page.locator('.undo-toast')).toContainText('newer');await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(page.locator('.undo-toast')).toHaveCount(0);expect((await snap()).state.tasks.map(t=>t.title).sort()).toEqual(['newer','older']);
});
test('toast unmount clears timers without resetting the absolute deadline on expand',async()=>{
 await cmd({type:'add',title:'unmount'});await del('unmount');await cursor({x:40,y:40});await cmd({type:'settings',settings:{pinned:false}});await expect(page.locator('.float-ball')).toBeVisible();await page.waitForTimeout(3400);
 await page.evaluate(()=>window.floatTodo.window('restore'));await expect(page.locator('.quick-add')).toBeVisible();await expect(page.locator('.undo-toast')).toHaveCount(0);expect((await snap()).state.tasks).toHaveLength(0);
});
test('failed undo keeps the matching task recoverable and permits a successful retry',async()=>{
 await cmd({type:'add',title:'retry undo'});await del('retry undo');
 await app.evaluate(({ipcMain})=>{globalThis.restoreRetryHandler=ipcMain._invokeHandlers.get('ft:command');globalThis.failedUndoOnce=false;ipcMain.removeHandler('ft:command');ipcMain.handle('ft:command',(event,c)=>{if(c.type==='restore'&&!globalThis.failedUndoOnce){globalThis.failedUndoOnce=true;return{ok:false,error:'测试恢复保存失败'};}return globalThis.restoreRetryHandler(event,c);});});
 await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(page.getByRole('alert')).toContainText('测试恢复保存失败');await expect(page.getByRole('button',{name:'撤销',exact:true})).toBeEnabled();expect((await snap()).state.tasks).toHaveLength(0);
 await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(page.locator('.undo-toast')).toHaveCount(0);await expect(page.locator('.task-title')).toHaveText('retry undo');
});
test('actual Chrome foreground typing/scrolling, event-driven 30/70 opacity, editing holds and pin recovery',async()=>{
 test.setTimeout(90000);let chrome;
 try{
  const browserFile=path.join(dir,'browser.html');await fs.writeFile(browserFile,'<!doctype html><title>FloatTodo isolated Chrome acceptance</title><style>body{margin:0;background:#143c78;color:white;font:18px sans-serif;height:3500px}header{padding:24px}input{font:18px sans-serif;padding:8px;width:400px}p{margin-top:600px}</style><header>Chrome · isolated local acceptance<br><input id="browser-input" placeholder="Native Chrome input"></header><p id="scroll-target">Scroll verification</p>');
  chrome=await chromium.launchPersistentContext(path.join(dir,'chrome-profile'),{channel:'chrome',headless:false,viewport:null,chromiumSandbox:true,args:['--window-position=0,0','--window-size=1500,800','--disable-crash-reporter'],env:{...process.env,TEMP:dir,TMP:dir}});
  const browser=chrome.pages()[0];await browser.goto(require('node:url').pathToFileURL(browserFile).href);const session=await chrome.newCDPSession(browser);const window=await session.send('Browser.getWindowForTarget');await session.send('Browser.setWindowBounds',{windowId:window.windowId,bounds:{left:0,top:0,width:1536,height:824,windowState:'normal'}});
  await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setBounds({x:1020,y:110,width:340,height:450});});
  for(const [category,title] of [['work','Weekly report'],['life','周五订晚餐'],['content','Organize raw clips'],['study','Read one chapter']])await cmd({type:'add',category,title});
  await cmd({type:'settings',settings:{pinned:false,opacity:.58}});await page.evaluate(()=>window.floatTodo.window('restore'));await page.getByRole('button',{name:'固定展开',exact:true}).click();await expect.poll(async()=>(await snap()).state.settings.alwaysOnTop).toBe(true);
  await (await page.context().newCDPSession(page)).send('Emulation.setFocusEmulationEnabled',{enabled:false});
  const browserSession=await chrome.browser().newBrowserCDPSession(),processes=await browserSession.send('SystemInfo.getProcessInfo'),chromePid=processes.processInfo.find(p=>p.type==='browser').id;
  const chromeHandle=execFileSync('powershell.exe',['-NoProfile','-Command',`(Get-Process -Id ${Number(chromePid)}).MainWindowHandle`],{encoding:'utf8',windowsHide:true}).trim();native('focus',{WindowHandle:chromeHandle});
  await click({x:200,y:200});await browser.bringToFront();await browser.locator('#browser-input').click();
  await expect.poll(()=>{native('focus',{WindowHandle:chromeHandle});return native('probe',{WindowHandle:chromeHandle,X:0,Y:0}).match(/foreground=(\d+)/)?.[1];}).toBe(chromeHandle);
  await browser.keyboard.type('Chrome remains interactive');await expect(browser.locator('#browser-input')).toHaveValue('Chrome remains interactive');await alpha(.3);
  expect((await snap()).interaction.focused).toBe(false);
  const low=await capture('chrome-background-30-native250.png');await browser.mouse.wheel(0,650);await expect.poll(()=>browser.evaluate(()=>scrollY)).toBeGreaterThan(300);
  await app.evaluate(({screen})=>{globalThis.originalCursorRead=screen.getCursorScreenPoint;globalThis.pinnedCursorReads=0;screen.getCursorScreenPoint=(...args)=>{globalThis.pinnedCursorReads++;return globalThis.originalCursorRead(...args);};});
  const panelBounds=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getBounds()),hover={x:panelBounds.x+170,y:panelBounds.y+250};
  await cursor(hover);await alpha(.7);expect((await snap()).interaction.focused).toBe(false);const high=await capture('chrome-hover-70-native250.png');
  await cursor({x:200,y:200});await alpha(.3);expect(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isAlwaysOnTop())).toBe(true);
  const caption={x:panelBounds.x+95,y:panelBounds.y+15};await cursor(caption);await alpha(.7);expect((await snap()).interaction.focused).toBe(false);
  await click(caption);await cursor({x:200,y:200});await alpha(.7);expect((await snap()).interaction.focused).toBe(true);await click({x:200,y:200});await alpha(.3);
  for(let i=0;i<4;i++){await cursor(hover);await alpha(.7);await cursor({x:200,y:200});await alpha(.3);}
  const eventReads=await app.evaluate(()=>globalThis.pinnedCursorReads);await page.waitForTimeout(650);expect(await app.evaluate(()=>globalThis.pinnedCursorReads)).toBe(eventReads);
  await page.evaluate(()=>{window.rapidOpacityFrames=[];const start=performance.now();function sample(){const el=document.querySelector('.panel');window.rapidOpacityFrames.push({ms:performance.now()-start,alpha:el?Number(getComputedStyle(el).backgroundColor.split(',').pop().replace(')','')):0,width:innerWidth});if(performance.now()-start<2200)requestAnimationFrame(sample);}requestAnimationFrame(sample);});
  const rapidInside=await point(hover),rapidOutside=await point({x:200,y:200});native('sweep',{X:rapidInside.x,Y:rapidInside.y,EndX:rapidOutside.x,EndY:rapidOutside.y});await alpha(.3);
  const rapid=await page.evaluate(()=>window.rapidOpacityFrames);expect(rapid.every(f=>f.alpha>=.299&&f.alpha<=.701&&f.width===340)).toBe(true);expect(new Set(rapid.map(f=>f.alpha)).size).toBeGreaterThan(3);expect(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getOpacity())).toBe(1);expect(await page.locator('.panel').evaluate(el=>getComputedStyle(el).transitionDuration)).toBe('0.2s');await fs.writeFile(`${out}/rapid-opacity-frames.json`,JSON.stringify(rapid,null,2));
  await page.getByRole('button',{name:'新增选项',exact:true}).click();await click({x:200,y:200});await alpha(.7);await capture('chrome-menu-held-70-native250.png');await page.getByRole('button',{name:'新增选项',exact:true}).click();await click({x:200,y:200});await alpha(.3);
  await page.getByLabel('新任务标题',{exact:true}).fill('draft keeps editing readable');await click({x:200,y:200});await alpha(.7);await page.getByLabel('新任务标题',{exact:true}).fill('');await click({x:200,y:200});await alpha(.3);
  await page.getByRole('button',{name:'编辑 周五订晚餐',exact:true}).click();await page.getByLabel('备注',{exact:true}).fill('Editing must stay legible');await page.getByLabel('截止日期',{exact:true}).fill('2026-12-19');
  const dateBounds=await page.getByLabel('截止日期',{exact:true}).boundingBox();await click({x:panelBounds.x+dateBounds.x+dateBounds.width-12,y:panelBounds.y+dateBounds.y+dateBounds.height/2});await page.waitForTimeout(180);await alpha(.7);await capture('chrome-date-picker-held-70-native250.png');
  await click({x:200,y:200});await alpha(.7);await capture('chrome-editing-held-70-native250.png');await page.getByRole('button',{name:'保存',exact:true}).click();
  await click({x:200,y:200});await alpha(.3);await page.getByRole('button',{name:'设置',exact:true}).click();await click({x:200,y:200});await alpha(.7);await capture('chrome-settings-held-70-native250.png');
  await page.getByLabel('自动背景透明度',{exact:true}).click();await expect(page.getByLabel('自动背景透明度',{exact:true})).not.toBeChecked();await alpha(.58);await page.getByRole('button',{name:'关闭对话框',exact:true}).click();await cursor({x:200,y:200});await alpha(.58);
  await app.evaluate(({screen})=>{screen.getCursorScreenPoint=globalThis.originalCursorRead;});
  await app.close();app=null;await launch();await (await page.context().newCDPSession(page)).send('Emulation.setFocusEmulationEnabled',{enabled:false});expect((await snap()).state.settings).toMatchObject({autoOpacity:false,opacity:.58,pinned:true,alwaysOnTop:true});await alpha(.58);
  await cmd({type:'settings',settings:{autoOpacity:true}});await click({x:200,y:200});await alpha(.3);await cmd({type:'settings',settings:{pinned:false}});await expect(page.locator('.float-ball')).toBeVisible();const b=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getBounds());await cursor({x:b.x+24,y:b.y+24});await expect(page.locator('.quick-add')).toBeVisible();await alpha(.58);await cursor({x:200,y:200});await expect(page.locator('.float-ball')).toBeVisible();
  expect(low[0]).toBeLessThan(140);expect(high[0]).toBeGreaterThan(150);
  const chromeVersion=await session.send('Browser.getVersion');await fs.writeFile(`${out}/chrome-native-acceptance.json`,JSON.stringify({chrome:chromeVersion.product,executablePath:process.env.FLOATTODO_QUALITY_EXE||'source Electron',isolatedProfile:path.join(dir,'chrome-profile'),dataDir:dir,lowRGB:low,highRGB:high,typed:'Chrome remains interactive',scrolled:true,hoverWithoutFocus:true,captionHoverWithoutFocus:true,nativeFocusRetainedOnLeave:true,chromeForegroundHandle:chromeHandle,topmost:true,idleCoordinateReads:0,eventCoordinateReads:eventReads,editingAndSettingsHeld:true,menuAndDraftHeld:true,datePickerInteraction:true,autoSettingSurvivedRestart:true,unpinHoverRestored:true,os:require('node:os').release(),scaleFactor:2.5},null,2));
 }finally{if(chrome)await chrome.close();}
});
