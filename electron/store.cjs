const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { defaults, validateState, applyCommand, check } = require('./model.cjs');
const {captureLocal,normalize}=require('./sync-state.cjs');
async function atomicWrite(file, value) {
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    const h = await fs.open(temp, 'wx');
    try { await h.writeFile(JSON.stringify(value, null, 2), 'utf8'); await h.sync(); } finally { await h.close(); }
    // Windows scanners/readers may briefly hold the destination without delete sharing.
    // Keep the same fully flushed temp file; never delete the previous committed copy.
    for(let attempt=0;;attempt++){
      try{await fs.rename(temp,file);break;}
      catch(err){if(attempt>=5||!['EPERM','EACCES','EBUSY'].includes(err.code))throw err;await new Promise(resolve=>setTimeout(resolve,20*2**attempt));}
    }
  } finally { await fs.unlink(temp).catch(() => {}); }
}
class Store {
  constructor(dir, onChange = () => {}, onWarning = () => {}) { this.dir = dir; this.file = path.join(dir, 'data.json'); this.onChange = onChange; this.onWarning = onWarning; this.chain = Promise.resolve(); }
  async init() {
    await fs.mkdir(this.dir, { recursive: true });
    await fs.mkdir(path.join(this.dir, 'inbox'), { recursive: true });
    await fs.mkdir(path.join(this.dir, 'results'), { recursive: true });
    let original;
    try {
      original=await fs.readFile(this.file,'utf8');const parsed=JSON.parse(original);
      this.state=validateState(parsed);this.legacyLayout=parsed.settings?.layoutVersion!==2;
    }
    catch (err) {
      if (err.code === 'ENOENT') {
        // A backup can outlive the primary file after interruption; recover it before creating an empty file.
        try { this.state = validateState(JSON.parse(await fs.readFile(`${this.file}.bak`, 'utf8'))); this.onWarning('主数据缺失，已从备份恢复。'); }
        catch (backupErr) { if (backupErr.code !== 'ENOENT') throw new Error(`备份无法读取，未覆盖任何数据：${backupErr.message}`); this.state = defaults(); }
        await atomicWrite(this.file, this.state);
      } else {
        if (original !== undefined) await fs.copyFile(this.file, `${this.file}.corrupt-${Date.now()}`);
        try { this.state = validateState(JSON.parse(await fs.readFile(`${this.file}.bak`, 'utf8'))); }
        catch { throw new Error(`主数据及备份均不可用，原文件已保留。请手工恢复 JSON。${err.message}`); }
        await atomicWrite(this.file, this.state); this.onWarning('数据文件损坏，已恢复上一次成功保存的备份；损坏文件已保留。');
      }
    }
    // Backup failures must stop the upgrade, never be mistaken for primary-file corruption.
    if(this.legacyLayout)await fs.copyFile(this.file,path.join(this.dir,`before-v1.1-${Date.now()}.json`));
    return this.snapshot();
  }
  snapshot() { const next=structuredClone(this.state);if(next.sync)normalize(next.sync);return next; }
  serial(fn) { const p = this.chain.then(fn); this.chain = p.catch(() => {}); return p; }
  async commit(next) {
    await atomicWrite(`${this.file}.bak`, this.state);
    await atomicWrite(this.file, next);
    this.state = next; this.onChange(this.snapshot());
  }
  execute(command, commandId) { return this.serial(async () => {
    if (commandId && Object.hasOwn(this.state.processed, commandId)) return this.state.processed[commandId];
    const { state, result } = applyCommand(this.state, command);
    captureLocal(this.state,state);
    const receipt = { status: 'applied', commandId, ...result, revision: state.revision };
    if (commandId) Object.defineProperty(state.processed, commandId, { value: receipt, enumerable: true, writable: true, configurable: true });
    await this.commit(state); return receipt;
  }); }
  replace(input) { return this.serial(async () => {
    const next = validateState(input);
    // Imported receipts are untrusted and must not erase local dedup history.
    next.processed = structuredClone(this.state.processed);
    // Imported IDs/receipts must never authorize writes against a live account.
    delete next.sync;
    if(this.state.sync){next.sync=structuredClone(this.state.sync);next.sync.enabled=false;next.sync.writesApproved=false;next.sync.sync_links={};next.sync.sync_outbox=[];next.sync.conflicts={};next.sync.syncToken='*';next.sync.contexts={};next.sync.excludedLocalIds=next.tasks.map(t=>t.id);}
    next.revision = this.state.revision + 1;
    const backup = path.join(this.dir, `before-import-${Date.now()}.json`);
    await atomicWrite(backup, this.state); await this.commit(next); return this.snapshot();
  }); }
  async drain() {
    if (this.draining) return;
    this.draining = true;
    try {
      const files = (await fs.readdir(path.join(this.dir, 'inbox'))).filter(x => /^[a-zA-Z0-9_-]+\.json$/.test(x)).sort();
      for (const file of files) {
        const full = path.join(this.dir, 'inbox', file);
        let envelope, receipt;
        try {
          const stat = await fs.stat(full); check(stat.size < 100000, '命令文件过大');
          envelope = JSON.parse(await fs.readFile(full, 'utf8'));
          check(envelope && /^[a-zA-Z0-9_-]{1,100}$/.test(envelope.commandId), 'commandId 无效');
          check(file.endsWith(`_${envelope.commandId}.json`), '命令 ID 与文件名不一致');
          check(['add','update','toggle','delete','reorder','group-add','group-update','group-delete'].includes(envelope.command?.type), 'CLI 命令不允许该操作');
          receipt = await this.execute(envelope.command, envelope.commandId);
        } catch (err) {
          receipt = { status: 'failed', error: err.message };
          // Storage failures retain valid commands for retry; invalid commands get a failed receipt.
          if (err.code && ['EACCES','EPERM','ENOSPC','EBUSY','EIO'].includes(err.code)) { this.onWarning(`队列保存失败，将重试：${err.message}`); break; }
        }
        const id = envelope?.commandId;
        const safeId = typeof id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(id) ? id : `invalid-${file.slice(0,100)}`;
        await atomicWrite(path.join(this.dir, 'results', `${safeId}.json`), receipt);
        await fs.unlink(full);
      }
    } finally { this.draining = false; }
  }
}
module.exports = { Store, atomicWrite };
