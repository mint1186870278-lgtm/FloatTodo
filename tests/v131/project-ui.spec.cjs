const {test,expect,_electron:electron}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve('.');let app,page,dir;
async function open(){const env={...process.env,FLOATTODO_DATA_DIR:dir,FLOATTODO_TEST:'1',FLOATTODO_TEST_SHORTCUT:'Control+Alt+Shift+F12'};delete env.ELECTRON_RUN_AS_NODE;app=await electron.launch(process.env.FLOATTODO_V131_EXE?{executablePath:path.resolve(process.env.FLOATTODO_V131_EXE),env}:{args:[root],env});page=await app.firstWindow();await expect(page.locator('.quick-add')).toBeVisible();}
test.afterEach(async()=>{if(app)await app.close()});
test('real settings select and confirm by ID, no old uploads, root task sync, restart binding',async()=>{
 await fs.mkdir('artifacts/test-data',{recursive:true});await fs.mkdir('artifacts/v131',{recursive:true});dir=await fs.mkdtemp(path.join(root,'artifacts/test-data/v131-gui-'));await open();
 await app.evaluate(({app},root)=>{const path=process.getBuiltinModule('path'),load=process.getBuiltinModule('module').createRequire(path.join(root,'package.json'));const f=new(load(path.join(root,'tests/helpers/fake-todoist.cjs')).FakeTodoist)();f.projects.push({id:'demo',name:'FloatTodo Demo'},{id:'same-name-other-id',name:'FloatTodo Demo'});f.sectionRows.push(...['work','life','content','study'].map((name,i)=>({id:`d${i}`,project_id:'demo',name})));app.floatTodoTest.sync.clientFactory=()=>f;globalThis.projectFake=f;},root);
 const add=await page.evaluate(()=>window.floatTodo.command({type:'add',title:'保留本地演示任务',groupId:'work'}));expect(add.ok).toBe(true);
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.locator('.todoist-settings summary').click();await page.getByLabel('Todoist API Token',{exact:true}).fill('fake-token-for-isolated-gui-only');await page.getByLabel('我授权本机验证账户、只读查询项目，并加密保存凭证。',{exact:true}).check();await page.getByRole('button',{name:'连接并只读预览',exact:true}).click();
 await expect(page.getByLabel('选择同步项目',{exact:true}).locator('option')).toHaveCount(4);
 await page.getByLabel('选择同步项目',{exact:true}).selectOption('demo');await page.getByRole('button',{name:'只读预览所选项目',exact:true}).click();await expect(page.locator('.sync-preview')).toContainText('FloatTodo Demo');
 await page.getByLabel('选择同步项目',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:'artifacts/v131/project-selector.png'});
 await page.locator('.sync-preview > .sync-check input').check();await page.getByRole('button',{name:'确认选择并启用同步',exact:true}).click();await expect(page.locator('.sync-preview')).toHaveCount(0);
 const bound=await page.evaluate(()=>window.floatTodo.sync('status'));expect(bound.data.projectId).toBe('demo');expect(bound.data.queued).toBe(0);
 await app.evaluate(async({app})=>{globalThis.projectFake.add('云端无分组任务',{project_id:'demo',section_id:null});await app.floatTodoTest.sync.sync()});
 await page.getByLabel('关闭对话框',{exact:true}).click();await expect(page.locator('.task-title')).toHaveText(['保留本地演示任务','云端无分组任务']);
 const saved=JSON.parse(await fs.readFile(path.join(dir,'data.json'),'utf8'));expect(saved.sync.projectId).toBe('demo');expect(saved.sync.sync_outbox).toEqual([]);expect(saved.tasks[0].id).toBe(add.data.id);
 await app.close();app=null;await open();const status=(await page.evaluate(()=>window.floatTodo.sync('status'))).data;expect(status.connected).toBe(true);expect(status.projectId).toBe('demo');expect(status.projectName).toBe('FloatTodo Demo');await expect(page.locator('.task-title')).toHaveText(['保留本地演示任务','云端无分组任务']);
 await fs.writeFile('artifacts/v131/gui-project-evidence.json',JSON.stringify({version:(await page.evaluate(()=>window.floatTodo.get())).data.version,projectId:status.projectId,restarted:true,dataDir:dir,oldTaskPreserved:true},null,2));
});
