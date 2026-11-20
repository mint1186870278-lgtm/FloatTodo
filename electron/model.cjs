const { randomUUID } = require('node:crypto');
const {validateSync}=require('./sync-state.cjs');
const STATES = ['todo', 'pending', 'completed', 'cancelled'];
const MAX_TASKS = 20000;
const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
function check(ok, message) { if (!ok) throw new Error(message); }
function text(value, label, max, optional = false) {
  if (optional && (value === undefined || value === null)) return '';
  check(typeof value === 'string', `${label}必须是文本`);
  const result = value.trim();
  check((optional || result.length > 0) && result.length <= max, `${label}须为${optional ? '0' : '1'}–${max}个字符`);
  return result;
}
function date(value) {
  if (!value) return '';
  check(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(value).toISOString().slice(0, 10) === value, '截止日期无效');
  return value;
}
function defaults() {
  return { schemaVersion: 1, revision: 0,
    groups: ['work', 'life', 'content', 'study'].map(name => ({ id: name, name, collapsed: false })), tasks: [],
    settings: { pinned: true, alwaysOnTop: false, autoOpacity:true, opacity: .94, launchAtLogin: false, bounds: null, ballPosition:null, selectedGroupId:'work', layoutVersion:2 }, processed: {} };
}
function validateState(input) {
  check(plain(input), '数据必须是 JSON 对象');
  const v = structuredClone(input);
  check(v.schemaVersion === undefined || v.schemaVersion === 0 || v.schemaVersion === 1, '不支持的数据版本，请使用更新版本的 FloatTodo');
  // v0 migration adds settings, timestamps and ordering; invalid references are never dropped.
  const old = !v.schemaVersion;
  check(Array.isArray(v.groups) && v.groups.length > 0 && v.groups.length <= 100, '分组数须为1–100');
  const groups = v.groups.map(g => {
    check(plain(g), '分组无效');
    return { id: text(g.id, '分组 ID', 100), name: text(g.name, '分组名', 40), collapsed: !!g.collapsed };
  });
  check(new Set(groups.map(g => g.id)).size === groups.length && new Set(groups.map(g => g.name.toLowerCase())).size === groups.length, '分组 ID 或名称重复');
  check(Array.isArray(v.tasks) && v.tasks.length <= MAX_TASKS, '任务列表无效或超过20000项');
  const tasks = v.tasks.map((t, i) => {
    check(plain(t), '任务无效');
    check(groups.some(g => g.id === t.groupId), '任务指向不存在的分组');
    check(STATES.includes(t.status), '任务状态无效');
    return { id: text(t.id, '任务 ID', 100), title: text(t.title, '标题', 500), notes: text(t.notes, '备注', 10000, true), dueDate: date(t.dueDate),
      groupId: t.groupId, status: t.status, order: Number.isFinite(t.order) ? t.order : i,
      createdAt: text(t.createdAt ?? (old ? new Date().toISOString() : undefined), '创建时间', 50),
      updatedAt: text(t.updatedAt ?? t.createdAt ?? (old ? new Date().toISOString() : undefined), '更新时间', 50) };
  });
  check(new Set(tasks.map(t => t.id)).size === tasks.length, '任务 ID 重复');
  const s = { ...defaults().settings, ...(plain(v.settings) ? v.settings : {}) };
  check(typeof s.pinned === 'boolean' && typeof s.alwaysOnTop === 'boolean' && typeof s.launchAtLogin === 'boolean', '窗口设置无效');
  check(typeof s.autoOpacity==='boolean','自动透明度设置无效');
  check(Number.isFinite(s.opacity) && s.opacity >= .3 && s.opacity <= 1, '透明度须为0.30–1.00');
  if (s.bounds !== null) check(plain(s.bounds) && ['x','y','width','height'].every(k => Number.isFinite(s.bounds[k])) && s.bounds.width >= 300 && s.bounds.height >= 300, '窗口位置无效');
  if(s.ballPosition!==null)check(plain(s.ballPosition)&&['x','y'].every(k=>Number.isFinite(s.ballPosition[k])&&Math.abs(s.ballPosition[k])<1000000),'悬浮球位置无效');
  check(typeof s.selectedGroupId==='string','默认分组无效');
  if(!groups.some(g=>g.id===s.selectedGroupId))s.selectedGroupId=groups[0].id;
  const processed = plain(v.processed) ? v.processed : {};
  return { schemaVersion: 1, revision: Number.isSafeInteger(v.revision) ? v.revision : 0, groups, tasks,
    settings: { pinned: s.pinned, alwaysOnTop: s.alwaysOnTop, autoOpacity:s.autoOpacity, launchAtLogin: s.launchAtLogin, opacity: s.opacity, bounds: s.bounds,
      ballPosition:s.ballPosition,selectedGroupId:s.selectedGroupId,layoutVersion:2 }, processed, ...(v.sync?{sync:validateSync(v.sync)}:{}) };
}
function applyCommand(state, command) {
  check(plain(command) && typeof command.type === 'string', '命令无效');
  const v = structuredClone(state);
  let result = {};
  const task = () => { const t = v.tasks.find(t => t.id === command.id); check(t, '任务不存在'); return t; };
  const group = id => { const g = v.groups.find(g => g.id === id || g.name === id); check(g, '分组不存在'); return g; };
  const now = new Date().toISOString();
  switch (command.type) {
    case 'add': {
      check(v.tasks.length < MAX_TASKS, '任务已达20000项上限');
      const g = group(command.groupId ?? command.category ?? v.groups[0].id);
      const t = { id: randomUUID(), title: text(command.title, '标题', 500), notes: text(command.notes, '备注', 10000, true),
        dueDate: date(command.dueDate), groupId: g.id, status: 'todo', order: Math.max(-1, ...v.tasks.map(t => t.order)) + 1, createdAt: now, updatedAt: now };
      v.tasks.push(t); g.collapsed = false; result = { id: t.id }; break;
    }
    case 'update': {
      const t = task();
      if ('title' in command) t.title = text(command.title, '标题', 500);
      if ('notes' in command) t.notes = text(command.notes, '备注', 10000, true);
      if ('dueDate' in command) t.dueDate = date(command.dueDate);
      if ('status' in command) { check(STATES.includes(command.status), '状态无效'); t.status = command.status; }
      if ('groupId' in command || 'category' in command) { const g = group(command.groupId ?? command.category); t.groupId = g.id; g.collapsed = false; }
      t.updatedAt = now; result = { id: t.id }; break;
    }
    case 'toggle': { const t = task(); t.status = t.status === 'completed' ? 'todo' : 'completed'; t.updatedAt = now; break; }
    case 'delete': { const t = task(); result = { deleted: t }; v.tasks = v.tasks.filter(x => x.id !== t.id); break; }
    case 'restore': {
      check(plain(command.task) && !v.tasks.some(t => t.id === command.task.id), '无法撤销，任务已存在');
      const t = { ...command.task, groupId: v.groups.some(g => g.id === command.task.groupId) ? command.task.groupId : v.groups[0].id };
      v.tasks.push(t); validateState(v); break;
    }
    case 'reorder': {
      if ('beforeId' in command) {
        const t = task(); check(t.status === 'todo', '仅支持 To-do 同组排序');
        const rows = v.tasks.filter(x => x.groupId === t.groupId && x.status === 'todo').sort((a,b) => a.order - b.order);
        check(Array.isArray(command.expectedIds) && command.expectedIds.length === rows.length && rows.every((x,i) => command.expectedIds[i] === x.id), '任务列表已更新，请重新拖动');
        check(command.beforeId === null || rows.some(x => x.id === command.beforeId && x.id !== t.id), '不能跨分组或跨状态排序');
        const next = rows.filter(x => x.id !== t.id);
        const at = command.beforeId === null ? next.length : next.findIndex(x => x.id === command.beforeId);
        next.splice(at, 0, t);
        next.forEach((x,i) => { x.order = i; });
        break;
      }
      const t = task(); check(command.direction === 'up' || command.direction === 'down', '排序方向无效');
      const rows = v.tasks.filter(x => x.groupId === t.groupId && x.status === t.status).sort((a,b) => a.order - b.order);
      rows.forEach((x, i) => { x.order = i; });
      const at = rows.findIndex(x => x.id === t.id), other = rows[at + (command.direction === 'up' ? -1 : 1)];
      if (other) [t.order, other.order] = [other.order, t.order]; break;
    }
    case 'group-add': {
      check(v.groups.length < 100, '最多100个分组'); const name = text(command.name, '分组名', 40);
      check(!v.groups.some(g => g.name.toLowerCase() === name.toLowerCase()), '分组名称已存在');
      const g = { id: randomUUID(), name, collapsed: false }; v.groups.push(g); result = { id: g.id }; break;
    }
    case 'group-update': {
      const g = group(command.id);
      if ('name' in command) { const name = text(command.name, '分组名', 40); check(!v.groups.some(x => x.id !== g.id && x.name.toLowerCase() === name.toLowerCase()), '分组名称已存在'); g.name = name; }
      if ('collapsed' in command) { check(typeof command.collapsed === 'boolean', '折叠状态无效'); g.collapsed = command.collapsed; } break;
    }
    case 'group-delete': {
      const g = group(command.id); check(v.groups.length > 1, '至少保留一个分组');
      const affected = v.tasks.filter(t => t.groupId === g.id);
      if (affected.length) { const target = group(command.targetGroupId); check(target.id !== g.id, '请选择其他分组接收任务'); affected.forEach(t => { t.groupId = target.id; }); }
      v.groups = v.groups.filter(x => x.id !== g.id);
      if(v.settings.selectedGroupId===g.id)v.settings.selectedGroupId=command.targetGroupId&&v.groups.some(x=>x.id===command.targetGroupId)?command.targetGroupId:v.groups[0].id;
      break;
    }
    case 'settings': {
      check(plain(command.settings), '设置无效');
      check(Object.keys(command.settings).every(k => ['pinned','alwaysOnTop','autoOpacity','opacity','bounds','launchAtLogin','ballPosition','selectedGroupId','layoutVersion'].includes(k)), '未知设置');
      if('selectedGroupId' in command.settings)check(v.groups.some(g=>g.id===command.settings.selectedGroupId),'默认分组不存在');
      if('layoutVersion' in command.settings)check(command.settings.layoutVersion===2,'布局版本无效');
      v.settings = { ...v.settings, ...command.settings }; validateState(v); break;
    }
    default: throw new Error('不支持的操作');
  }
  v.revision++; return { state: v, result };
}
module.exports = { defaults, validateState, applyCommand, check, STATES };
