'use strict';
const { FIELDS, OPS, TYPES, UNARY, LIMITS, LIST_STATS } = require('../shared/program-types.json');
const validName = (n) => typeof n === 'string' && n.trim().length > 0 && n.length <= 40 && !/[\x00-\x1f]/.test(n);
const finite = (n) => typeof n === 'number' && Number.isFinite(n);
const named = (n) => { if (!validName(n)) throw new Error('变量、列表、计时器及自定义积木名应为 1–40 个字符'); };
const oneOf = (v, values, label) => { if (!values.includes(v)) throw new Error(`${label}无效`); };
function validateProgram(input) {
  if (!input || JSON.stringify(input).length > 512000) throw new Error('程序无效或过大');
  const p = structuredClone(input);
  if (p.version !== 1 || typeof p.id !== 'string' || !p.id || p.id.length > 100 || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 80) throw new Error('程序名称或版本无效');
  if (!Array.isArray(p.devices) || p.devices.length > 16) throw new Error('最多支持 16 个设备角色');
  const names = (list) => {
    const keys = new Set();
    for (const a of list) {
      if (!a || typeof a.key !== 'string' || !/^[a-zA-Z_][\w-]{0,39}$/.test(a.key) || keys.has(a.key) || typeof a.label !== 'string' || !a.label || a.label.length > 80) throw new Error('设备角色或参数名称无效或重复');
      keys.add(a.key);
    }
    return keys;
  };
  const slots = names(p.devices);
  if (!Array.isArray(p.parameters) || p.parameters.length > 32) throw new Error('参数过多');
  const parameters = names(p.parameters);
  for (const a of p.parameters) if (!finite(a.min) || !finite(a.max) || a.min > a.max || a.default !== null && (!finite(a.default) || a.default < a.min || a.default > a.max)) throw new Error('参数默认值或上下限无效');
  if (!finite(p.maxSeconds) || p.maxSeconds < 1 || p.maxSeconds > 86400) throw new Error('最长运行秒数应为 1–86400');
  const device = (d) => { if (!slots.has(d)) throw new Error(`未定义的设备角色：${d}`); };
  let expressions = 0;
  function expression(e, depth = 0, text = false) {
    if (!e || ++expressions > 6000 || depth > 14) throw new Error('表达式无效、过多或嵌套过深');
    const child = (v, t = false) => expression(v, depth + 1, t);
    switch (e.kind) {
      case 'number': if (!finite(e.value)) throw new Error('常量必须是有限数值'); break;
      case 'param': if (!parameters.has(e.name)) throw new Error(`未定义参数：${e.name}`); break;
      case 'variable': case 'timer': named(e.name); break;
      case 'telemetry': device(e.device); if (!Object.hasOwn(FIELDS, e.field)) throw new Error('未知读数'); break;
      case 'limit': device(e.device); if (!Object.hasOwn(LIMITS, e.field)) throw new Error('未知设备量程'); break;
      case 'state': device(e.device); oneOf(e.field, ['output', 'cv', 'cc'], '设备状态'); break;
      case 'constant': oneOf(e.name, ['pi', 'e'], '常数'); break;
      case 'binary': if (!Object.hasOwn(OPS, e.op)) throw new Error('未知运算符'); child(e.left); child(e.right); break;
      case 'unary': if (!Object.hasOwn(UNARY, e.op)) throw new Error('未知数学函数'); child(e.value); break;
      case 'not': child(e.value); break;
      case 'clamp': case 'between': child(e.value); child(e.min); child(e.max); break;
      case 'map': for (const k of ['value', 'fromMin', 'fromMax', 'toMin', 'toMax']) child(e[k]); break;
      case 'random': if (typeof e.integer !== 'boolean') throw new Error('随机数类型无效'); child(e.min); child(e.max); break;
      case 'approx': child(e.left); child(e.right); child(e.tolerance); break;
      case 'choose': child(e.condition); child(e.then); child(e.else); break;
      case 'listItem': named(e.name); child(e.index); break;
      case 'listStat': named(e.name); if (!Object.hasOwn(LIST_STATS, e.op)) throw new Error('未知列表统计'); break;
      case 'text': if (!text || typeof e.value !== 'string' || e.value.length > 1000) throw new Error('文字不能用于数值槽位或文字过长'); break;
      case 'join': if (!text) throw new Error('文字不能用于数值槽位'); child(e.left, true); child(e.right, true); break;
      case 'format': if (!text) throw new Error('文字不能用于数值槽位'); child(e.value); child(e.digits); break;
      default: throw new Error('未知表达式');
    }
  }
  const procedures = new Map();
  if (p.procedures !== undefined && (!Array.isArray(p.procedures) || p.procedures.length > 32)) throw new Error('自定义积木最多 32 个');
  for (const d of p.procedures || []) { named(d.name); if (procedures.has(d.name)) throw new Error(`自定义积木重名：${d.name}`); procedures.set(d.name, d); }
  let count = 0;
  const ids = new Set();
  function blocks(list, depth = 0, loops = 0) {
    if (!Array.isArray(list) || depth > 12) throw new Error('积木嵌套过深或列表无效');
    for (const b of list) {
      if (!b || ++count > 500 || !Object.hasOwn(TYPES, b.type) || typeof b.id !== 'string' || ids.has(b.id)) throw new Error('积木无效、过多或编号重复');
      ids.add(b.id);
      const ex = (...keys) => keys.forEach((k) => expression(b[k]));
      const body = (list, n = loops) => blocks(list, depth + 1, n);
      if (['set', 'single', 'adjust', 'output', 'protection', 'ramp', 'battery', 'readBattery', 'recall', 'savePreset', 'backlight', 'resetStats'].includes(b.type)) device(b.device);
      if (['variable', 'change', 'battery', 'readBattery', 'for', 'timerReset', 'listClear', 'listAppend', 'listSet', 'listDelete', 'call'].includes(b.type)) named(b.name);
      switch (b.type) {
        case 'set': ex('voltage', 'current'); break;
        case 'single': case 'adjust': oneOf(b.field, ['voltage', 'current'], '设定字段'); ex('value'); break;
        case 'output': if (typeof b.on !== 'boolean') throw new Error('输出开关无效'); break;
        case 'protection': ex('ovp', 'ocp'); break;
        case 'ramp': oneOf(b.field, ['voltage', 'current'], '渐变字段'); ex('to', 'seconds'); break;
        case 'recall': ex('slot'); break;
        case 'savePreset': ex('slot', 'voltage', 'current', 'ovp', 'ocp'); break;
        case 'backlight': ex('value'); break;
        case 'resetStats': case 'readBattery': case 'battery': case 'timerReset': case 'listClear': break;
        case 'variable': case 'change': case 'listAppend': ex('value'); break;
        case 'listSet': ex('index', 'value'); break;
        case 'listDelete': ex('index'); break;
        case 'wait': ex('seconds'); break;
        case 'until': ex('condition', 'hold', 'timeout'); break;
        case 'if': ex('condition'); body(b.then); body(b.else); break;
        case 'repeat': ex('count'); if (b.condition) ex('condition'); body(b.body, loops + 1); break;
        case 'for': ex('from', 'to', 'step'); body(b.body, loops + 1); break;
        case 'repeatUntil': ex('condition'); body(b.body, loops + 1); break;
        case 'forever': body(b.body, loops + 1); break;
        case 'break': case 'continue': if (!loops) throw new Error('跳出 / 下一次循环必须放在当前分支的循环内部'); break;
        case 'parallel':
          if (!Array.isArray(b.branches) || b.branches.length < 2 || b.branches.length > 8) throw new Error('并行分支需要 2–8 路');
          b.branches.forEach((a) => body(a, 0)); break;
        case 'call': if (!procedures.has(b.name)) throw new Error(`未定义自定义积木：${b.name}`); break;
        case 'assert': ex('condition'); if (typeof b.message !== 'string' || b.message.length > 300) throw new Error('检查失败消息无效'); break;
        case 'log': if (typeof b.message !== 'string' || b.message.length > 300) throw new Error('消息过长'); if (b.value) ex('value'); break;
        case 'logText': expression(b.value, 0, true); break;
        case 'stop': if (typeof b.message !== 'string' || b.message.length > 300) throw new Error('结束消息无效'); break;
      }
    }
  }
  blocks(p.blocks);
  if (!p.blocks.length) throw new Error('请先添加积木');
  for (const d of procedures.values()) { if (typeof d.id !== 'string' || ids.has(d.id)) throw new Error('自定义积木编号无效或重复'); ids.add(d.id); blocks(d.body); }
  const cache = new Map(), visiting = new Set();
  function procedureResources(name) {
    if (visiting.has(name)) throw new Error('自定义积木不能递归调用');
    if (cache.has(name)) return cache.get(name);
    visiting.add(name); const r = resources(procedures.get(name).body); visiting.delete(name); cache.set(name, r); return r;
  }
  function resources(list) {
    const r = new Set();
    for (const b of list) {
      if (b.device) r.add(`device:${b.device}`);
      if (['variable', 'change', 'battery', 'readBattery', 'for'].includes(b.type)) r.add(`variable:${b.name}`);
      if (b.type.startsWith('list')) r.add(`list:${b.name}`);
      if (b.type === 'timerReset') r.add(`timer:${b.name}`);
      if (b.type === 'call') for (const k of procedureResources(b.name)) r.add(k);
      for (const child of [b.then, b.else, b.body, ...(b.branches || [])].filter(Boolean)) for (const k of resources(child)) r.add(k);
      if (b.type === 'parallel') {
        const seen = new Set();
        for (const a of b.branches) for (const k of resources(a)) { if (seen.has(k)) throw new Error(`并行分支不能同时修改 ${k}，请分配不同设备 / 变量 / 列表 / 计时器`); seen.add(k); }
      }
    }
    return r;
  }
  for (const name of procedures.keys()) procedureResources(name);
  resources(p.blocks);
  return p;
}
module.exports = { validateProgram };
