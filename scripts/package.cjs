const { spawnSync } = require('node:child_process');
const path = require('node:path');
const env = { ...process.env, ELECTRON_CACHE: path.resolve('.cache/electron'), ELECTRON_BUILDER_CACHE: path.resolve('.cache/electron-builder'), CSC_IDENTITY_AUTO_DISCOVERY: 'false' };
// Reuse the installed, version-pinned runtime; packaging must not depend on a second download.
const result = spawnSync(process.execPath, [require.resolve('electron-builder/cli.js'), '--win', '--x64', `--config.electronDist=${path.resolve('node_modules/electron/dist')}`], { stdio: 'inherit', env });
process.exit(result.status ?? 1);
