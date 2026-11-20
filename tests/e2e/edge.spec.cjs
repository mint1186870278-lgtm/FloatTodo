const {test,expect,_electron:electron}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),{execFileSync}=require('node:child_process');
test('native 250% ball before-after on identical light, dark and patterned backgrounds',async()=>{
 test.skip(!require('node:fs').existsSync(path.resolve('release/v1.1.0/win-unpacked/FloatTodo.exe')),'Historical V1.1.0 comparison executable is not present; current ball/hover is tested by native regression.');
 test.setTimeout(90000);const root=path.resolve('.'),evidence=[];
 for(const kind of ['before','after']){
  const dir=await fs.mkdtemp(path.join(root,'artifacts/test-data/edge-'));const env={...process.env,FLOATTODO_DATA_DIR:dir,FLOATTODO_TEST:'1',FLOATTODO_TEST_SHORTCUT:'Control+Alt+Shift+F12'};delete env.ELECTRON_RUN_AS_NODE;
  const afterExecutable=process.env.FLOATTODO_EDGE_EXE;
  const app=await electron.launch(kind==='before'?{executablePath:path.join(root,'release/v1.1.0/win-unpacked/FloatTodo.exe'),env,args:[]}:afterExecutable?{executablePath:path.resolve(afterExecutable),env,args:[]}:{args:[root],env});
  try{
   const page=await app.firstWindow();await expect(page.locator('.quick-add')).toBeVisible();
   await page.evaluate(()=>window.floatTodo.command({type:'settings',settings:{pinned:false,alwaysOnTop:true}}));await expect(page.locator('.float-ball')).toBeVisible();
   const rect=await app.evaluate(async({BrowserWindow,screen})=>{
    const main=BrowserWindow.getAllWindows()[0];main.setPosition(600,200);globalThis.edgeMain=main;
    const back=new BrowserWindow({x:480,y:100,width:300,height:300,frame:false,show:false,resizable:false,backgroundColor:'#ffffff',webPreferences:{sandbox:true}});globalThis.edgeBack=back;
    await back.loadURL('data:text/html,<style>html,body{margin:0;width:100%;height:100%}</style><body></body>');back.setAlwaysOnTop(true);back.show();main.show();main.moveTop();
    back.focus();main.focus();const a=screen.dipToScreenPoint({x:576,y:176}),b=screen.dipToScreenPoint({x:672,y:272});return{X:a.x,Y:a.y,Width:b.x-a.x,Height:b.y-a.y,scale:screen.getPrimaryDisplay().scaleFactor,backHandle:String(back.getNativeWindowHandle().readBigUInt64LE()),mainHandle:String(main.getNativeWindowHandle().readBigUInt64LE())};
   });
   expect(rect.scale).toBe(2.5);expect(rect.Width).toBe(240);
   for(const handle of [rect.backHandle,rect.mainHandle])execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts/native-test.ps1'),'-Action','activate','-WindowHandle',handle],{windowsHide:true});
   for(const [name,background] of [['light','#eeeeee'],['dark','#18202c'],['pattern','repeating-conic-gradient(#1c456b 0% 25%,#dec291 0% 50%) 0 0/16px 16px']]){
    const bg=await app.evaluate(async(_,background)=>{const back=globalThis.edgeBack;back.setBackgroundColor(background.startsWith('#')?background:'#dec291');await back.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(`<style>html,body{margin:0;width:100%;height:100%;background:${background}}</style><body></body>`));back.show();back.moveTop();globalThis.edgeMain.moveTop();await back.webContents.executeJavaScript('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');return{bounds:back.getBounds(),visible:back.isVisible(),css:await back.webContents.executeJavaScript('getComputedStyle(document.body).background')};},background);await page.waitForTimeout(300);
    const file=path.join(root,`artifacts/ui-validation/ball-${kind}-${name}-native250.png`);
    execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts/native-test.ps1'),'-Action','capture','-X',String(rect.X),'-Y',String(rect.Y),'-Width',String(rect.Width),'-Height',String(rect.Height),'-OutputPath',file],{windowsHide:true});
    const probes=JSON.parse(execFileSync('python',['-c','from PIL import Image;import sys,json;im=Image.open(sys.argv[1]);print(json.dumps([im.getpixel(p)[:3] for p in [(10,10),(30,10),(10,30),(30,30)]]))',file],{encoding:'utf8',windowsHide:true}));
    if(name==='light')expect(probes).toEqual(Array(4).fill([238,238,238]));
    if(name==='dark')expect(probes).toEqual(Array(4).fill([24,32,44]));
    if(name==='pattern'){expect(probes).toContainEqual([28,69,107]);expect(probes).toContainEqual([222,194,145]);}
    evidence.push({kind,afterExecutable:afterExecutable||'source Electron',background:name,backgroundWindow:bg,backgroundPixelProbes:probes,rect,file:path.relative(root,file),method:'Windows CopyFromScreen, DPI-aware, same native position and backdrop, no resampling'});
   }
   await app.evaluate(()=>{globalThis.edgeMain.setParentWindow(null);globalThis.edgeBack.destroy();});
  }finally{await app.close();}
 }
 await fs.writeFile('artifacts/ui-validation/ball-edge-native.json',JSON.stringify(evidence,null,2));
});
