const {test,expect,_electron:electron}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve('.');let app,page,dir,errors;
async function open(){const env={...process.env,FLOATTODO_DATA_DIR:dir,FLOATTODO_TEST:'1',FLOATTODO_TEST_SHORTCUT:'Control+Alt+Shift+F12'};delete env.ELECTRON_RUN_AS_NODE;app=await electron.launch({args:[root],env});page=await app.firstWindow();await expect(page.locator('.quick-add')).toBeVisible();page.on('pageerror',e=>errors.push(e.message));const p=await app.evaluate(({BrowserWindow,screen})=>{const b=BrowserWindow.getAllWindows()[0].getBounds();return screen.dipToScreenPoint({x:b.x+120,y:b.y+120})});execFileSync('powershell.exe',['-NoProfile','-File',path.join(root,'scripts/native-test.ps1'),'-Action','cursor','-X',String(p.x),'-Y',String(p.y)],{windowsHide:true});}
async function cmd(c){const r=await page.evaluate(c=>window.floatTodo.command(c),c);expect(r.ok,r.error).toBe(true);return r.data;}
async function state(){return(await page.evaluate(()=>window.floatTodo.get())).data.state;}
const row=id=>page.locator(`[data-task-id="${id}"]`);
test.beforeEach(async()=>{errors=[];dir=await fs.mkdtemp(path.join(root,'artifacts/test-data/final-'));await open();});
test.afterEach(async()=>{if(app)await app.close();expect(errors).toEqual([]);});
test('static category dots ignore persisted collapse and clicks; management remains accessible',async()=>{
 for(const category of ['work','life','content','study'])await cmd({type:'add',title:`${category} item`,category});
 await cmd({type:'group-update',id:'work',collapsed:true});
 await expect(page.locator('.group-dot')).toHaveCount(4);await expect(page.locator('.group-title button,.group-toggle,.arrow')).toHaveCount(0);
 const before=await state();for(const dot of await page.locator('.group-dot').all())await dot.click();expect(await state()).toEqual(before);await expect(page.locator('.task')).toHaveCount(4);
 await page.screenshot({path:'artifacts/ui-validation/final-category-dots.png'});
 await page.getByRole('button',{name:'管理分组 work',exact:true}).click();await expect(page.getByLabel('分组名',{exact:true})).toHaveValue('work');await page.getByRole('button',{name:'关闭对话框',exact:true}).click();
});
test('completion immediately commits, holds original position then fades and closes the gap',async()=>{
 const a=await cmd({type:'add',title:'周五订晚餐',category:'life',notes:'两人靠窗',dueDate:'2026-12-11'}),b=await cmd({type:'add',title:'下一件小事',category:'life'});
 await page.screenshot({path:'artifacts/ui-validation/completion-before.png'});
 const original=await row(b.id).boundingBox();
 await page.evaluate(id=>{const el=document.querySelector(`[data-task-id="${id}"] input`);window.completionStart=0;el.addEventListener('change',()=>window.completionStart=performance.now(),{once:true});window.completionFrames=[];const start=performance.now();function sample(){const row=document.querySelector(`[data-task-id="${id}"]`),next=row?.nextElementSibling;if(window.completionStart)window.completionFrames.push({ms:performance.now()-window.completionStart,exists:!!row,checked:row?.querySelector('input').checked,strike:row?getComputedStyle(row.querySelector('.task-title')).textDecorationLine:null,height:row?.getBoundingClientRect().height,nextTop:next?.getBoundingClientRect().top,opacity:row?getComputedStyle(row).opacity:null});if(performance.now()-start<2200)requestAnimationFrame(sample);}requestAnimationFrame(sample);},a.id);
 await row(a.id).getByRole('checkbox').click();
 await expect(row(a.id).getByRole('checkbox')).toBeChecked();await expect(row(a.id).getByRole('checkbox')).toBeDisabled();
 await expect.poll(async()=>JSON.parse(await fs.readFile(path.join(dir,'data.json'),'utf8')).tasks.find(t=>t.id===a.id).status).toBe('completed');
 await page.screenshot({path:'artifacts/ui-validation/completion-checked.png'});
 await row(b.id).locator('.task-body').focus();await page.waitForTimeout(350);await expect(row(a.id)).toBeVisible();expect((await row(b.id).boundingBox()).y).toBe(original.y);
 await expect(row(a.id)).toHaveCount(0);await page.screenshot({path:'artifacts/ui-validation/completion-after.png'});
 expect((await row(b.id).boundingBox()).y).toBeLessThan(original.y-20);await expect(row(b.id).locator('.task-body')).toBeFocused();
 const frames=await page.evaluate(()=>window.completionFrames.filter(f=>f.ms>=0&&f.ms<2000));
 const held=frames.filter(f=>f.ms>30&&f.ms<500);expect(held.length).toBeGreaterThan(3);expect(held.every(f=>f.exists&&f.checked&&f.strike==='line-through')).toBe(true);
 const exit=frames.find(f=>f.ms>500&&!f.exists);expect(exit.ms).toBeGreaterThanOrEqual(1000);expect(exit.ms).toBeLessThan(1250);
 expect(frames.some(f=>f.ms>900&&f.exists&&Number(f.opacity)<1&&f.height>0)).toBe(true);
 await fs.writeFile('artifacts/ui-validation/completion-timing.json',JSON.stringify({dataDir:dir,heldSamples:held.length,firstAbsentMs:exit.ms,frames},null,2));
 await page.getByRole('button',{name:/^Completed/}).click();await expect(row(a.id)).toBeVisible();expect((await state()).tasks.find(t=>t.id===a.id)).toMatchObject({notes:'两人靠窗',dueDate:'2026-12-11',groupId:'life',status:'completed'});
 await app.close();app=null;await open();await page.getByRole('button',{name:/^Completed/}).click();await expect(row(a.id)).toBeVisible();
});
test('two completions, duplicate input, quick tab switch and regret restore have consistent data',async()=>{
 const a=await cmd({type:'add',title:'one'}),b=await cmd({type:'add',title:'two'}),c=await cmd({type:'add',title:'three'});
 await row(a.id).getByRole('checkbox').dblclick();await row(b.id).getByRole('checkbox').click();await expect(row(a.id).getByRole('checkbox')).toBeChecked();
 await page.getByRole('button',{name:/^Completed/}).click();await expect(page.locator('.task')).toHaveCount(2);
 await row(a.id).getByRole('checkbox').click();await page.getByRole('button',{name:/^To-do/}).click();await expect(page.locator('.task-title')).toHaveText(['one','three']);
 await page.waitForTimeout(1400);await expect(page.locator('.task-title')).toHaveText(['one','three']);
 await row(c.id).getByRole('checkbox').click();await app.close();app=null;await open();expect((await state()).tasks.map(t=>[t.id,t.status])).toEqual([[a.id,'todo'],[b.id,'completed'],[c.id,'completed']]);
});
test('reduced motion keeps hold feedback, and CLI complete/restore synchronizes during animation',async()=>{
 await page.emulateMedia({reducedMotion:'reduce'});const a=await cmd({type:'add',title:'reduced'}),b=await cmd({type:'add',title:'external'});
 await row(a.id).getByRole('checkbox').click();await page.waitForTimeout(350);await expect(row(a.id)).toBeVisible();expect(await row(a.id).evaluate(e=>getComputedStyle(e).transitionDuration)).toBe('0s');
 const cli=(args)=>execFileSync(process.execPath,['cli/todo.cjs',...args],{cwd:root,env:{...process.env,FLOATTODO_DATA_DIR:dir},encoding:'utf8',windowsHide:true});
 expect(cli(['complete','--id',b.id,'--wait','8000'])).toContain('applied');await expect(row(b.id)).toHaveCount(0);
 expect(cli(['update','--id',a.id,'--status','todo','--wait','8000'])).toContain('applied');await expect(row(a.id).getByRole('checkbox')).not.toBeChecked();await page.waitForTimeout(1200);await expect(row(a.id)).toBeVisible();
});
test('failed completion restores enabled todo and hiding clears local feedback without losing commit',async()=>{
 const a=await cmd({type:'add',title:'failure path'});
 // Inject a deterministic storage error at the actual IPC boundary, leaving unrelated writes intact.
 await app.evaluate(({ipcMain})=>{globalThis.originalCommand=ipcMain._invokeHandlers.get('ft:command');ipcMain.removeHandler('ft:command');ipcMain.handle('ft:command',(event,c)=>c.type==='update'&&c.status==='completed'?{ok:false,error:'测试保存失败'}:globalThis.originalCommand(event,c));});
 await row(a.id).getByRole('checkbox').click();await expect(page.getByRole('alert')).toContainText('测试保存失败');await expect(row(a.id).getByRole('checkbox')).toBeEnabled();await expect(row(a.id).getByRole('checkbox')).not.toBeChecked();expect((await state()).tasks[0].status).toBe('todo');
 await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('ft:command');ipcMain.handle('ft:command',globalThis.originalCommand);});
 await row(a.id).getByRole('checkbox').click();await expect.poll(async()=>(await state()).tasks[0].status).toBe('completed');await page.evaluate(()=>window.floatTodo.window('hide'));await page.waitForTimeout(1200);await page.evaluate(()=>window.floatTodo.window('restore'));await expect(row(a.id)).toHaveCount(0);await page.getByRole('button',{name:/^Completed/}).click();await expect(row(a.id)).toBeVisible();
});
test('single todo keeps feedback without flashing empty state; Completed is immediately available',async()=>{
 const a=await cmd({type:'add',title:'single task',category:'study'});await row(a.id).getByRole('checkbox').click();
 await page.waitForTimeout(400);await expect(row(a.id)).toBeVisible();await expect(page.locator('.empty-state')).toHaveCount(0);expect((await state()).tasks[0].status).toBe('completed');
 await page.getByRole('button',{name:/^Completed/}).click();await expect(row(a.id)).toBeVisible();await page.waitForTimeout(1300);await expect(row(a.id)).toBeVisible();
 await app.close();app=null;await open();await page.getByRole('button',{name:/^Completed/}).click();await expect(row(a.id)).toBeVisible();
});
