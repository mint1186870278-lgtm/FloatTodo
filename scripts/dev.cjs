const { spawn } = require('node:child_process');
const path = require('node:path');
const vite = spawn(process.execPath, [path.resolve('node_modules/vite/bin/vite.js')], { stdio: 'inherit' });
let electron;
const timer = setInterval(async () => {
  try {
    await fetch('http://127.0.0.1:5173');
    clearInterval(timer);
    const env = { ...process.env, FLOATTODO_DEV_URL: 'http://127.0.0.1:5173' };
    delete env.ELECTRON_RUN_AS_NODE;
    electron = spawn(require('electron'), ['.'], { stdio: 'inherit', env });
    electron.on('exit', () => { vite.kill(); process.exit(); });
  } catch { /* wait until Vite is ready */ }
}, 250);
process.on('SIGINT', () => { clearInterval(timer); electron?.kill(); vite.kill(); process.exit(); });
vite.on('exit', () => { clearInterval(timer); electron?.kill(); });
