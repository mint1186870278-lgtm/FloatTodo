const {test,expect,_electron:electron}=require('@playwright/test');
const fs=require('node:fs/promises');const path=require('node:path');const{execFileSync}=require('node:child_process');const{fixture}=require('../../scripts/ui-fixture.cjs');
const root=path.resolve('.');let app,page,dir;
function native(action,opts={}){const args=['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts/native-test.ps1'),'-Action',action];for(const[k,v]of Object.entries(opts))args.push(`-${k}`,String(v));return execFileSync('powershell.exe',args,{windowsHide:true,encoding:'utf8'}).trim();}
async function launch(collapsed=false){const env={...process.env,FLOATTODO_DATA_DIR:dir,FLOATTODO_TEST:'1',FLOATTODO_TEST_SHORTCUT:'Control+Alt+Shift+F12'};delete env.ELECTRON_RUN_AS_NODE;app=await electron.launch({args:[root],env});page=await app.firstWindow();await expect(page.locator(collapsed?'.float-ball':'.quick-add')).toBeVisible();}
async function cmd(c){const r=await page.evaluate(c=>window.floatTodo.command(c),c);expect(r.ok,r.error).toBe(true);return r.data;}
async function state(){return(await page.evaluate(()=>window.floatTodo.get())).data.state;}
async function bounds(){return app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getBounds());}
async function point(p){return app.evaluate(({screen},p)=>screen.dipToScreenPoint(p),p);}
async function cursor(p){const q=await point(p);native('cursor',{X:q.x,Y:q.y});}
test.beforeEach(async()=>{await fs.mkdir('artifacts/test-data',{recursive:true});dir=await fs.mkdtemp(path.join(root,'artifacts/test-data/refinement-'));await launch();});
test.afterEach(async()=>{if(app)await app.close();});
test('video-matched seven tasks and empty state fit compact panel at native 250%',async()=>{
  await page.screenshot({path:'artifacts/ui-validation/v11-empty-250.png'});
  for(const[category,title]of fixture)await cmd({type:'add',title,category});
  await expect(page.locator('.task')).toHaveCount(7);
  await page.screenshot({path:'artifacts/ui-validation/v11-same-tasks-250.png'});
  const metrics=await page.evaluate(()=>{const b=s=>{const el=document.querySelector(s),r=el.getBoundingClientRect(),s2=getComputedStyle(el);return{width:r.width,height:r.height,fontSize:s2.fontSize,lineHeight:s2.lineHeight,margin:s2.margin};};const list=document.querySelector('.task-list');return{devicePixelRatio,window:{width:innerWidth,height:innerHeight},tasks:document.querySelectorAll('.task').length,titlebar:b('.titlebar'),tabs:b('.tabs'),row:b('.task'),footer:b('footer'),taskFont:b('.task-title'),dateFont:b('.titlebar time'),list:{client:list.clientHeight,scroll:list.scrollHeight}};});
  expect(metrics.window.width).toBe(340);expect(Math.abs(metrics.window.height-450)).toBeLessThanOrEqual(3);expect(metrics.row.height).toBeLessThanOrEqual(24.5);expect(metrics.footer.height).toBeLessThan(36);expect(metrics.list.scroll).toBeLessThanOrEqual(metrics.list.client+1);
  await fs.writeFile('artifacts/ui-validation/v11-metrics.json',JSON.stringify(metrics,null,2));
  await page.getByRole('button',{name:'新增选项',exact:true}).click();await expect(page.getByLabel('新增任务分组',{exact:true})).toBeVisible();await page.screenshot({path:'artifacts/ui-validation/v11-add-options.png'});
});
test('native circular ball drag, corner click-through, saved position, hover bridge and pin',async()=>{
  await cursor({x:40,y:40});await cmd({type:'settings',settings:{pinned:false,alwaysOnTop:true}});await expect.poll(async()=>(await bounds()).width).toBe(48);
  await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.show();w.moveTop();w.focus();});
  const before=await bounds(),start=await point({x:before.x+24,y:before.y+24}),end=await point({x:before.x-220,y:before.y+210});
  native('drag',{X:start.x,Y:start.y,EndX:end.x,EndY:end.y});
  await expect.poll(async()=>(await bounds()).x).not.toBe(before.x);
  const moved=await bounds();expect(Math.abs(moved.width-48)).toBeLessThanOrEqual(1);expect(Math.abs(moved.height-48)).toBeLessThanOrEqual(1);
  await expect.poll(async()=>(await state()).settings.ballPosition?.x).toBe(moved.x);
  await cursor({x:40,y:40});await page.screenshot({path:'artifacts/ui-validation/v11-ball.png',omitBackground:true});
  const rect=await app.evaluate(async({BrowserWindow,screen})=>{const main=BrowserWindow.getAllWindows()[0],b=main.getBounds();globalThis.ballMain=main;const back=new BrowserWindow({x:b.x-15,y:b.y-15,width:78,height:78,frame:false,backgroundColor:'#143c78',show:false,webPreferences:{sandbox:true}});globalThis.ballBack=back;await back.loadURL('data:text/html,<body style="background:%23143c78;margin:0"></body>');await back.webContents.executeJavaScript("window.hits=0;document.addEventListener('click',()=>window.hits++);");main.setParentWindow(back);back.setAlwaysOnTop(true);back.show();main.show();main.moveTop();const p=screen.dipToScreenPoint({x:b.x-15,y:b.y-15}),end=screen.dipToScreenPoint({x:b.x+63,y:b.y+63});return{X:p.x,Y:p.y,Width:end.x-p.x,Height:end.y-p.y};});
  const corner=await point({x:moved.x+1,y:moved.y+1});native('click',{X:corner.x,Y:corner.y});
  await expect.poll(()=>app.evaluate(()=>globalThis.ballBack.webContents.executeJavaScript('window.hits'))).toBe(1);
  native('capture',{...rect,OutputPath:path.join(root,'artifacts/ui-validation/v11-ball-native-corners.png')});
  await app.evaluate(()=>{globalThis.ballMain.setParentWindow(null);globalThis.ballBack.destroy();});
  await app.close();app=null;await launch(true);const restored=await bounds();expect(restored.x).toBe(moved.x);expect(restored.y).toBe(moved.y);expect(Math.abs(restored.width-48)).toBeLessThanOrEqual(1);
  const b=await bounds();await cursor({x:b.x+24,y:b.y+24});await expect.poll(async()=>(await bounds()).width).toBe(340);
  const expanded=await bounds();await cursor({x:expanded.x+25,y:expanded.y+95});await page.waitForTimeout(1300);expect((await bounds()).width).toBe(340);
  await page.screenshot({path:'artifacts/ui-validation/v11-hover-expanded.png'});
  await page.getByRole('button',{name:'固定展开',exact:true}).click();await cursor({x:40,y:40});await page.waitForTimeout(1300);expect((await bounds()).width).toBe(340);expect((await state()).settings.pinned).toBe(true);
  await page.screenshot({path:'artifacts/ui-validation/v11-pinned.png'});
  await fs.writeFile('artifacts/ui-validation/ball-native.json',JSON.stringify({before,moved,restored:b,expanded,cornerClickReachedBackground:true},null,2));
});
test('quick draft and add menu prevent collapse; default group and detailed fields survive',async()=>{
  await cursor({x:40,y:40});await cmd({type:'settings',settings:{pinned:false}});await expect.poll(async()=>(await bounds()).width).toBe(48);await page.evaluate(()=>window.floatTodo.window('restore'));
  await page.getByLabel('新任务标题',{exact:true}).fill('正在编辑');await cursor({x:40,y:40});await page.waitForTimeout(1400);expect((await bounds()).width).toBe(340);
  await page.getByLabel('新任务标题',{exact:true}).fill('');await page.getByRole('button',{name:'新增选项',exact:true}).click();await cursor({x:40,y:40});await page.waitForTimeout(1400);expect((await bounds()).width).toBe(340);
  await page.getByLabel('新增任务分组',{exact:true}).selectOption('life');await expect.poll(async()=>(await state()).settings.selectedGroupId).toBe('life');
  await page.getByRole('button',{name:/详细添加/}).click();await expect(page.getByLabel('事项分组')).toHaveValue('life');await page.getByLabel('标题',{exact:true}).fill('中文详细事项');await page.getByLabel('备注',{exact:true}).fill('保留原有备注功能');await page.getByLabel('截止日期',{exact:true}).fill('2026-12-18');await page.getByRole('button',{name:'保存',exact:true}).click();await expect(page.locator('.task-title')).toHaveText('中文详细事项');
  await cmd({type:'settings',settings:{pinned:true}});await app.close();app=null;await launch();expect((await state()).settings.selectedGroupId).toBe('life');expect((await state()).tasks[0].notes).toBe('保留原有备注功能');
});
// Historical V1 source snapshots are deliberately excluded from the public candidate.
test.skip('V1 migration comparison requires excluded historical source',()=>{});

test('actual npm --prefix from unrelated cwd: Chinese add, failure, offline queue and idempotence',async()=>{
  test.setTimeout(60000);const cwd=path.join(root,'.cache/unrelated-cwd');await fs.mkdir(cwd,{recursive:true});const env={...process.env,FLOATTODO_DATA_DIR:dir};const outputs=[];
  const cli=(verb,opts={})=>{const args=['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts/invoke-cli.ps1'),'-ProjectPath',root,'-Verb',verb];for(const[k,v]of Object.entries(opts))args.push(`-${k}`,String(v));const text=execFileSync('powershell.exe',args,{cwd,env,encoding:'utf8',windowsHide:true});outputs.push(text);return text;};
  expect(cli('add',{Title:'周五订晚餐',Category:'life',CommandId:'prefix-dinner',Wait:8000})).toContain('applied');await expect(page.locator('.task-title')).toHaveText('周五订晚餐');expect((await state()).tasks[0].groupId).toBe('life');
  cli('add',{Title:'周五订晚餐',Category:'life',CommandId:'prefix-dinner',Wait:8000});await page.waitForTimeout(600);expect((await state()).tasks).toHaveLength(1);
  const listed=cli('list'),id=(await state()).tasks[0].id;expect(listed).toContain('周五订晚餐');await page.screenshot({path:'artifacts/ui-validation/v11-cli-chinese.png'});
  try{cli('add',{Title:'不会提交的事项',Category:'missing-group',CommandId:'prefix-failed',Wait:8000});throw new Error('应当拒绝无效分组');}catch(e){expect(e.status).toBe(1);expect(String(e.stdout)).toContain('failed');expect(String(e.stdout)).toContain('分组不存在');outputs.push(String(e.stdout));}expect((await state()).tasks).toHaveLength(1);
  await app.close();app=null;const queued=cli('add',{Title:'准备周末采购',Category:'life',CommandId:'prefix-offline'});expect(queued).toContain('queued');expect(queued).not.toContain('applied');expect(JSON.parse(await fs.readFile(path.join(dir,'data.json'),'utf8')).tasks).toHaveLength(1);
  await launch();await expect(page.locator('.task-title')).toHaveCount(2);cli('complete',{Id:id,Wait:8000});cli('move',{Id:id,Category:'work',Wait:8000});
  await app.close();app=null;await launch();expect((await state()).tasks).toHaveLength(2);expect((await state()).tasks.find(t=>t.id===id)).toMatchObject({groupId:'work',status:'completed'});outputs.push(cli('list'));
  await fs.writeFile('artifacts/ui-validation/cli-prefix-output.txt',outputs.join('\n'));await fs.writeFile('artifacts/ui-validation/cli-prefix-context.json',JSON.stringify({cwd,prefix:root,isolatedData:dir,commandsUsed:'npm.cmd --prefix <project> run todo -- <verb>',realUserDatabaseTouched:false},null,2));
});
