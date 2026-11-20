const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { atomicWrite } = require('../electron/store.cjs');
const { validateState, check } = require('../electron/model.cjs');
const dir = process.env.FLOATTODO_DATA_DIR || path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'FloatTodo-v1.2');
async function main() {
  const [verb = 'help', ...args] = process.argv.slice(2);
  const opts = {};
  for (let i=0; i<args.length; i+=2) { check(args[i].startsWith('--') && args[i+1] !== undefined, '参数格式：--key value'); opts[args[i].slice(2)] = args[i+1]; }
  if (verb === 'help') { console.log('FloatTodo: add --title "book friday dinner" --category life [--notes text] [--due 2026-12-01]\nlist | complete --id ID | move --id ID --category work | update --id ID --status pending --title text\nstatus --command-id ID\n写操作入队；运行中的应用消费。--wait 8000 等待确认；--command-id ID 可用于幂等重试。'); return; }
  if (verb === 'list') {
    let state; try { state = validateState(JSON.parse(await fs.readFile(path.join(dir, 'data.json'), 'utf8'))); }
    catch (err) { if (err.code !== 'ENOENT') throw err; console.log(JSON.stringify({ tasks: [], message: '应用尚未启动；未提交的队列不会显示。', dataDir: dir }, null, 2)); return; }
    console.log(JSON.stringify({ revision: state.revision, tasks: state.tasks.map(t => ({ ...t, category: state.groups.find(g => g.id === t.groupId).name })) }, null, 2)); return;
  }
  if (verb === 'status') {
    check(/^[a-zA-Z0-9_-]{1,100}$/.test(opts['command-id']), '请提供有效 --command-id');
    try { const receipt = JSON.parse(await fs.readFile(path.join(dir,'results',`${opts['command-id']}.json`),'utf8')); console.log(JSON.stringify(receipt,null,2)); if (receipt.status === 'failed') process.exitCode = 1; }
    catch (err) { if(err.code !== 'ENOENT') throw err; console.log(JSON.stringify({status:'queued-or-unknown', commandId:opts['command-id']})); process.exitCode=2; } return;
  }
  const allowed = { add: ['title','category','notes','due'], complete: ['id'], move: ['id','category'], update: ['id','title','notes','due','status','category'] };
  check(allowed[verb], '未知命令，运行 npm run todo -- help');
  check(Object.keys(opts).every(k => [...allowed[verb],'wait','command-id'].includes(k)), '包含未知参数');
  let command;
  if (verb === 'add') { check(typeof opts.title === 'string' && opts.title.trim().length > 0 && opts.title.trim().length <= 500, '请输入1–500字符的标题'); command = {type:'add',title:opts.title,category:opts.category || 'work',notes:opts.notes,dueDate:opts.due}; }
  else { check(opts.id, '缺少 --id'); command = {type:'update',id:opts.id}; if(verb==='complete') command.status='completed'; if(verb==='move') {check(opts.category,'缺少 --category'); command.category=opts.category;} if(verb==='update') for(const k of allowed.update.filter(k=>k!=='id')) if(opts[k]!==undefined) command[k==='due'?'dueDate':k]=opts[k]; }
  const commandId = opts['command-id'] || randomUUID(); check(/^[a-zA-Z0-9_-]{1,100}$/.test(commandId), 'commandId 无效');
  const wait = Number(opts.wait || 0); check(Number.isFinite(wait) && wait >= 0 && wait <= 60000, '--wait 须为0–60000毫秒');
  await fs.mkdir(path.join(dir,'inbox'),{recursive:true});
  await atomicWrite(path.join(dir,'inbox',`${Date.now()}_${commandId}.json`),{commandId,command,createdAt:new Date().toISOString()});
  console.log(JSON.stringify({status:'queued',commandId,dataDir:dir,message:'已入队；应用启动并消费后才会生效。'}));
  if(wait) {
    const until=Date.now()+wait;
    do { try { const result=JSON.parse(await fs.readFile(path.join(dir,'results',`${commandId}.json`),'utf8')); console.log(JSON.stringify(result)); if(result.status==='failed') process.exitCode=1; return; } catch(err) { if(err.code!=='ENOENT')throw err; } await new Promise(r=>setTimeout(r,100)); } while(Date.now()<until);
    console.log(JSON.stringify({status:'queued',commandId,message:'等待超时；命令仍在队列。应用启动后消费，可使用 status 查询。'})); process.exitCode=2;
  }
}
main().catch(err=>{console.error(`FloatTodo: ${err.message}`);process.exitCode=1;});
