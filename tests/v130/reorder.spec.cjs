const {test,expect,_electron:electron}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
const root=path.resolve('.'),stage=process.env.FLOATTODO_V130_EXE?'packaged':'source';let app,page,dir,errors;
async function open(){const env={...process.env,FLOATTODO_DATA_DIR:dir,FLOATTODO_TEST:'1',FLOATTODO_TEST_SHORTCUT:'Control+Alt+Shift+F12'};delete env.ELECTRON_RUN_AS_NODE;app=await electron.launch(process.env.FLOATTODO_V130_EXE?{executablePath:path.resolve(process.env.FLOATTODO_V130_EXE),args:[],env}:{args:[root],env});page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await expect(page.locator('.quick-add')).toBeVisible();await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setBounds({x:800,y:100,width:340,height:452});w.show();w.focus();});}
async function cmd(c){const r=await page.evaluate(c=>window.floatTodo.command(c),c);expect(r.ok,r.error).toBe(true);return r.data;}
const snap=async()=>(await page.evaluate(()=>window.floatTodo.get())).data;
const rows=()=>page.locator('.group').first().locator('.task');
const titles=()=>rows().locator('.task-title').allTextContents();
async function add(title,groupId='work'){return cmd({type:'add',title,groupId});}
async function point(loc){const b=await loc.boundingBox();return{x:b.x+Math.min(80,b.width/2),y:b.y+b.height/2};}
async function nativeCursor(loc){const p=await point(loc);const q=await app.evaluate(({BrowserWindow,screen},p)=>{const b=BrowserWindow.getAllWindows()[0].getBounds();return screen.dipToScreenPoint({x:b.x+p.x,y:b.y+p.y});},p);execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts/native-test.ps1'),'-Action','cursor','-X',String(q.x),'-Y',String(q.y)],{windowsHide:true});}
async function drag(from,to){const a=await point(rows().nth(from).locator('.task-body')),b=await point(rows().nth(to).locator('.task-body'));await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:15});await page.mouse.up();await expect(page.locator('.row-dragging')).toHaveCount(0);}
test.beforeEach(async()=>{errors=[];await fs.mkdir('artifacts/test-data',{recursive:true});dir=await fs.mkdtemp(path.join(root,'artifacts/test-data/v130-'));await open();await cmd({type:'settings',settings:{pinned:true,alwaysOnTop:true,autoOpacity:true}});});
test.afterEach(async()=>{if(app){await app.close();app=null;}expect(errors).toEqual([]);});
test('native Windows row drag, normal quit/restart, checkbox and click',async()=>{
 for(const title of ['完善作品集首页','检查项目链接','调整作品集动效'])await add(title);
 const a=await point(rows().nth(2).locator('.task-body')),b=await point(rows().nth(0).locator('.task-body'));
 const native=await app.evaluate(({BrowserWindow,screen},{a,b})=>{const w=BrowserWindow.getAllWindows()[0],r=w.getBounds();return{handle:String(w.getNativeWindowHandle().readBigUInt64LE()),a:screen.dipToScreenPoint({x:r.x+a.x,y:r.y+a.y}),b:screen.dipToScreenPoint({x:r.x+b.x,y:r.y+b.y}),dpi:screen.getPrimaryDisplay().scaleFactor};},{a,b});
 const run=(action,args=[])=>execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts/native-test.ps1'),'-Action',action,...args],{windowsHide:true,encoding:'utf8'});
 run('focus',['-WindowHandle',native.handle]);run('drag',['-X',String(native.a.x),'-Y',String(native.a.y),'-EndX',String(native.b.x),'-EndY',String(native.b.y)]);
 await expect.poll(titles).toEqual(['调整作品集动效','完善作品集首页','检查项目链接']);expect((await snap()).state.tasks.every(t=>t.status==='todo')).toBe(true);
 await page.screenshot({path:`artifacts/v130/${stage}-native-reordered.png`});await app.close();app=null;await open();await expect.poll(titles).toEqual(['调整作品集动效','完善作品集首页','检查项目链接']);
 await rows().first().locator('.task-body').click();await expect(page.getByRole('dialog')).toBeVisible();await page.getByLabel('关闭对话框',{exact:true}).click();
 await nativeCursor(rows().first().locator('.task-body'));await rows().first().locator('input').click();await expect(rows().first()).toHaveClass(/completion-hold/);await expect(rows()).toHaveCount(2);await expect.poll(titles).toEqual(['完善作品集首页','检查项目链接']);await page.getByRole('button',{name:/^Completed/}).click();await expect(page.locator('.task-title')).toHaveText('调整作品集动效');
 await fs.writeFile(`artifacts/v130/${stage}-native-evidence.json`,JSON.stringify({method:'Win32 mouse_event down -> SetCursorPos moves -> mouse_event up; no sorting command called by test',native,os:os.release(),dataDir:dir,restarted:true,version:(await snap()).version},null,2));
});
test('top/bottom, adjacent, repeated drops, tabs, new task and deletion',async()=>{
 for(const title of ['A','B','C','D'])await add(title);await drag(0,3);await expect.poll(titles).toEqual(['B','C','D','A']);await drag(2,0);await expect.poll(titles).toEqual(['D','B','C','A']);await drag(1,2);await expect.poll(titles).toEqual(['D','C','B','A']);
 for(const name of ['Pending','Completed','Cancelled','To-do'])await page.getByRole('button',{name:new RegExp(`^${name}`)}).click();await expect.poll(titles).toEqual(['D','C','B','A']);
 await page.getByLabel('新任务标题',{exact:true}).fill('E');await page.getByLabel('新任务标题',{exact:true}).press('Enter');await expect.poll(titles).toEqual(['D','C','B','A','E']);await cmd({type:'delete',id:(await snap()).state.tasks.find(t=>t.title==='C').id});await expect.poll(titles).toEqual(['D','B','A','E']);expect(new Set((await snap()).state.tasks.map(t=>t.id)).size).toBe(4);
});
test('threshold, Escape, external revision, group/state boundaries and menu',async()=>{
 await add('A');await add('B');await add('Life','life');const revision=(await snap()).state.revision;
 let a=await point(rows().first().locator('.task-body'));await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(a.x+2,a.y+2);await expect(page.locator('.row-dragging')).toHaveCount(0);await page.mouse.up();await expect(page.getByRole('dialog')).toBeVisible();await page.getByLabel('关闭对话框',{exact:true}).click();expect((await snap()).state.revision).toBe(revision);
 a=await point(rows().first().locator('.task-body'));await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(a.x,a.y+25,{steps:6});await expect(page.locator('.row-dragging')).toHaveCount(1);await page.keyboard.press('Escape');await page.mouse.up();await expect(page.locator('.panel')).toBeVisible();await expect.poll(titles).toEqual(['A','B']);expect((await snap()).state.revision).toBe(revision);
 a=await point(rows().first().locator('.task-body'));const life=await point(page.locator('.group').nth(1).locator('.task-body'));await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(life.x,life.y,{steps:15});await page.mouse.up();await expect.poll(titles).toEqual(['A','B']);expect((await snap()).state.tasks.find(t=>t.title==='A').groupId).toBe('work');
 await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(a.x,a.y+25,{steps:6});await cmd({type:'update',id:(await snap()).state.tasks[1].id,title:'Updated B'});await expect(page.locator('.row-dragging')).toHaveCount(0);await page.mouse.up();await expect.poll(titles).toEqual(['A','Updated B']);
 await rows().first().getByLabel('编辑 A',{exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.getByLabel('关闭对话框',{exact:true}).click();await cmd({type:'update',id:(await snap()).state.tasks[0].id,status:'pending'});await page.getByRole('button',{name:/^Pending/}).click();expect(await page.locator('.task[data-reorderable=true]').count()).toBe(0);
});
test('long list autoscroll, empty/single group, ball hover, Pin and opacity',async()=>{
 const h=await page.locator('.group-heading').first().boundingBox();await page.mouse.move(h.x+30,h.y+8);await page.mouse.down();await page.mouse.move(h.x+30,h.y+40);await page.mouse.up();expect((await snap()).state.tasks).toHaveLength(0);
 await add('single');await page.locator('.task-body').click();await page.getByLabel('关闭对话框',{exact:true}).click();for(let i=0;i<34;i++)await add(`Long ${i}`);
 const first=await point(rows().first().locator('.task-body')),l=await page.locator('.task-list').boundingBox();await page.mouse.move(first.x,first.y);await page.mouse.down();await page.mouse.move(first.x,l.y+l.height-10,{steps:20});await expect.poll(()=>page.locator('.task-list').evaluate(e=>e.scrollTop)).toBeGreaterThan(100);await page.mouse.up();await expect(page.locator('.row-dragging')).toHaveCount(0);await expect.poll(async()=>(await titles()).indexOf('single')).toBeGreaterThan(8);
 await page.getByRole('button',{name:'取消固定，收起为悬浮球',exact:true}).click();await expect(page.locator('.float-ball')).toBeVisible();await nativeCursor(page.locator('.float-ball'));await expect(page.locator('.panel')).toBeVisible();await page.getByRole('button',{name:'固定展开',exact:true}).click();await expect.poll(async()=>(await snap()).state.settings.pinned).toBe(true);expect((await snap()).interaction.activeOpacity).toBe(.85);
});



