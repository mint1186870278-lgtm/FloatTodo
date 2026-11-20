const{test,expect,_electron:electron}=require('@playwright/test');
const{spawn}=require('node:child_process');const fs=require('node:fs/promises');const path=require('node:path');
test('Vite development entry boots the real Electron UI with valid dev CSP',async()=>{
  test.setTimeout(45000);
  const root=path.resolve('.');await fs.mkdir('artifacts/test-data',{recursive:true});const dir=await fs.mkdtemp(path.join(root,'artifacts/test-data/dev-'));
  const vite=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js')],{cwd:root,windowsHide:true,stdio:'pipe'});let output='';vite.stdout.on('data',d=>output+=d);vite.stderr.on('data',d=>output+=d);
  let app;
  try{
    await expect.poll(async()=>{try{return(await fetch('http://127.0.0.1:5173')).ok;}catch{return false;}},{timeout:15000}).toBe(true);
    const env={...process.env,FLOATTODO_DEV_URL:'http://127.0.0.1:5173',FLOATTODO_DATA_DIR:dir,FLOATTODO_TEST:'1',FLOATTODO_TEST_SHORTCUT:'Control+Alt+Shift+F12'};delete env.ELECTRON_RUN_AS_NODE;
    app=await electron.launch({args:[root],env});const page=await app.firstWindow();await expect(page.getByLabel('新任务标题',{exact:true})).toBeVisible();
    await page.getByLabel('新任务标题',{exact:true}).fill('dev mode check');await page.getByLabel('新任务标题',{exact:true}).press('Enter');await expect(page.locator('.task-title')).toHaveText('dev mode check');
  }finally{if(app)await app.close();vite.kill();await fs.writeFile('artifacts/ui-validation/dev-smoke.log',output);}
});
