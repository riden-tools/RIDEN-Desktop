// Converts snapped block connections directly into the validated interpreter AST.
// Unconnected blocks remain on the canvas as drafts and never execute.
const number = (value) => ({ kind: 'number', value });
const variableField = (name) => ({ name, type: '' });
const input = (state) => ({ block: state });
function conditionState(e) {
  if (e.kind === 'number') return { type: 'riden_bool', fields: { VALUE: e.value ? '1' : '0' } };
  if (['not', 'between', 'approx', 'state'].includes(e.kind) || e.kind === 'binary' && ['<', '<=', '>', '>=', '==', '!=', 'and', 'or', 'xor'].includes(e.op)) return expressionState(e);
  return expressionState({ kind: 'binary', op: '!=', left: e, right: number(0) });
}
function expressionState(e) {
  // Display the standard three-part charge test as one readable domain block.
  // It compiles back to the same general-purpose comparison AST.
  const a = e.left, b = e.right?.left, c = e.right?.right;
  if (e.kind === 'binary' && e.op === 'and' && e.right?.op === 'and' &&
      a?.op === '<' && a.left?.kind === 'telemetry' && a.left.field === 'i' &&
      b?.op === '==' && b.left?.kind === 'telemetry' && b.left.field === 'cc' && b.right?.kind === 'number' && b.right.value === 0 &&
      c?.op === '>=' && c.left?.kind === 'telemetry' && c.left.field === 'v' &&
      a.left.device === b.left.device && a.left.device === c.left.device) {
    return { type: 'riden_charge_ready', fields: { DEVICE: a.left.device }, inputs: { CURRENT: input(expressionState(a.right)), MINV: input(expressionState(c.right)) } };
  }
  switch (e.kind) {
    case 'number': return { type: 'riden_number', fields: { NUM: e.value } };
    case 'variable': return { type: 'riden_get', fields: { NAME: variableField(e.name) } };
    case 'param': return { type: 'riden_param', fields: { NAME: e.name } };
    case 'telemetry': return { type: 'riden_read', fields: { DEVICE: e.device, FIELD: e.field } };
    case 'limit': case 'state': return { type: `riden_${e.kind}`, fields: { DEVICE: e.device, FIELD: e.field } };
    case 'constant': return { type: 'riden_constant', fields: { NAME: e.name } };
    case 'timer': return { type: 'riden_timer', fields: { NAME: e.name } };
    case 'listStat': return { type: 'riden_listStat', fields: { NAME: { name: e.name, type: 'list' }, OP: e.op } };
    case 'text': return { type: 'riden_text', fields: { TEXT: e.value } };
    case 'binary': {
      const logic = ['and', 'or', 'xor'].includes(e.op);
      const type = logic ? 'logic' : ['<', '<=', '>', '>=', '==', '!='].includes(e.op) ? 'compare' : 'math';
      const child = logic ? conditionState : expressionState;
      return { type: `riden_${type}`, fields: { OP: e.op }, inputs: { LEFT: input(child(e.left)), RIGHT: input(child(e.right)) } };
    }
  }
  const mappings = { unary: ['value'], not: ['value'], clamp: ['value', 'min', 'max'], between: ['value', 'min', 'max'], map: ['value', 'fromMin', 'fromMax', 'toMin', 'toMax'], random: ['min', 'max'], approx: ['left', 'right', 'tolerance'], choose: ['condition', 'then', 'else'], listItem: ['index'], join: ['left', 'right'], format: ['value', 'digits'] };
  if (mappings[e.kind]) {
    const state = { type: `riden_${e.kind}`, fields: {}, inputs: {} };
    if (e.kind === 'unary') state.fields.OP = e.op;
    if (e.kind === 'random') state.fields.INTEGER = String(e.integer);
    if (e.kind === 'listItem') state.fields.NAME = { name: e.name, type: 'list' };
    for (const key of mappings[e.kind]) state.inputs[key.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()] = input(key === 'condition' || e.kind === 'not' ? conditionState(e[key]) : expressionState(e[key]));
    return state;
  }
  throw new Error('不支持的表达式');
}
function listState(blocks) {
  let next;
  for (let i = blocks.length - 1; i >= 0; i--) { const b = blockState(blocks[i]); if (next) b.next = input(next); next = b; }
  return next;
}
function blockState(b) {
  const s = { type: `riden_${b.type}`, id: b.id, fields: {}, inputs: {} };
  if (b.device) s.fields.DEVICE = b.device;
  const expr = (name, e) => { s.inputs[name] = input(expressionState(e)); };
  const cond = (e) => { s.inputs.CONDITION = input(conditionState(e)); };
  const body = (name, list) => { if (list.length) s.inputs[name] = input(listState(list)); };
  switch (b.type) {
    case 'set': expr('V', b.voltage); expr('I', b.current); break;
    case 'single': case 'adjust': s.fields.FIELD = b.field; expr('VALUE', b.value); break;
    case 'recall': expr('SLOT', b.slot); break;
    case 'savePreset': expr('SLOT', b.slot); expr('V', b.voltage); expr('I', b.current); expr('OVP', b.ovp); expr('OCP', b.ocp); break;
    case 'backlight': expr('VALUE', b.value); break;
    case 'resetStats': break;
    case 'readBattery': s.fields.NAME = variableField(b.name); break;
    case 'output': s.fields.ON = String(b.on); break;
    case 'protection': expr('OVP', b.ovp); expr('OCP', b.ocp); break;
    case 'ramp': s.fields.FIELD = b.field; expr('TO', b.to); expr('SECONDS', b.seconds); break;
    case 'wait': expr('SECONDS', b.seconds); break;
    case 'until': cond(b.condition); expr('HOLD', b.hold); expr('TIMEOUT', b.timeout); break;
    case 'if': cond(b.condition); body('THEN', b.then); body('ELSE', b.else); break;
    case 'repeat': if (b.condition) { s.type = 'riden_while'; cond(b.condition); } expr('COUNT', b.count); body('BODY', b.body); break;
    case 'for': s.fields.NAME = variableField(b.name); expr('FROM', b.from); expr('TO', b.to); expr('STEP', b.step); body('BODY', b.body); break;
    case 'forever': body('BODY', b.body); break;
    case 'repeatUntil': cond(b.condition); body('BODY', b.body); break;
    case 'break': case 'continue': break;
    case 'assert': cond(b.condition); s.fields.MESSAGE = b.message; break;
    case 'parallel': s.fields.COUNT = String(b.branches.length); s.extraState = { count: b.branches.length }; b.branches.forEach((a, i) => body(`BRANCH${i}`, a)); break;
    case 'variable': s.fields.NAME = variableField(b.name); expr('VALUE', b.value); break;
    case 'change': s.fields.NAME = variableField(b.name); expr('VALUE', b.value); break;
    case 'timerReset': case 'call': s.fields.NAME = b.name; break;
    case 'listClear': case 'listAppend': case 'listSet': case 'listDelete':
      s.fields.NAME = { name: b.name, type: 'list' };
      if (b.value) expr('VALUE', b.value);
      if (b.index) expr('INDEX', b.index);
      break;
    case 'battery': s.fields.NAME = variableField(b.name); break;
    case 'log': s.fields.MESSAGE = b.message; expr('VALUE', b.value || number(0)); break;
    case 'logText': expr('VALUE', b.value); break;
    case 'stop': s.fields.MESSAGE = b.message; break;
  }
  return s;
}
export function programWorkspace(program) {
  const start = { type: 'riden_start', id: 'program-start', x: 40, y: 35 };
  if (program.blocks.length) start.next = input(listState(program.blocks));
  const definitions = (program.procedures || []).map((d, i) => ({ type: 'riden_define', id: d.id, fields: { NAME: d.name }, x: 850, y: 35 + i * 220, ...(d.body.length ? { inputs: { BODY: input(listState(d.body)) } } : {}) }));
  return { blocks: { languageVersion: 0, blocks: [start, ...definitions] } };
}
export function workspaceDefinition(workspace) {
  const starts = workspace.getAllBlocks(false).filter((b) => b.type === 'riden_start' && b.isEnabled());
  if (starts.length !== 1) throw new Error('画布上需要且只需一个「当点击 ▶ 运行」积木');
  let size = 0;
  const need = (b, name) => { const child = b.getInputTargetBlock(name); if (!child) throw new Error(`「${b.toString(35)}」有空槽，请填入数值或拖入对应形状的积木`); return child; };
  const variableName = (b) => { const field = b.getField('NAME'); return field.getVariable()?.name || field.getText(); };
  const expression = (b) => {
    if (!b || ++size > 3000) throw new Error('表达式过多或连接无效');
    if (!b.isEnabled()) throw new Error('数值或条件积木已停用，请启用后再运行');
    switch (b.type) {
      case 'riden_number': return number(Number(b.getFieldValue('NUM')));
      case 'riden_bool': return number(Number(b.getFieldValue('VALUE')));
      case 'riden_get': return { kind: 'variable', name: variableName(b) };
      case 'riden_param': return { kind: 'param', name: b.getFieldValue('NAME') };
      case 'riden_read': return { kind: 'telemetry', device: b.getFieldValue('DEVICE'), field: b.getFieldValue('FIELD') };
      case 'riden_state': case 'riden_limit': return { kind: b.type.slice(6), device: b.getFieldValue('DEVICE'), field: b.getFieldValue('FIELD') };
      case 'riden_constant': case 'riden_timer': return { kind: b.type.slice(6), name: b.getFieldValue('NAME') };
      case 'riden_text': return { kind: 'text', value: b.getFieldValue('TEXT') };
      case 'riden_listStat': return { kind: 'listStat', name: variableName(b), op: b.getFieldValue('OP') };
      case 'riden_math': case 'riden_compare': case 'riden_logic': return { kind: 'binary', op: b.getFieldValue('OP'), left: expression(need(b, 'LEFT')), right: expression(need(b, 'RIGHT')) };
      case 'riden_charge_ready': {
        const device = b.getFieldValue('DEVICE');
        const data = (field) => ({ kind: 'telemetry', device, field });
        const binary = (op, left, right) => ({ kind: 'binary', op, left, right });
        return binary('and', binary('<', data('i'), expression(need(b, 'CURRENT'))), binary('and', binary('==', data('cc'), number(0)), binary('>=', data('v'), expression(need(b, 'MINV')))));
      }
      default: {
        const kind = b.type.slice(6);
        const mappings = { unary: ['value'], not: ['value'], clamp: ['value', 'min', 'max'], between: ['value', 'min', 'max'], map: ['value', 'fromMin', 'fromMax', 'toMin', 'toMax'], random: ['min', 'max'], approx: ['left', 'right', 'tolerance'], choose: ['condition', 'then', 'else'], listItem: ['index'], join: ['left', 'right'], format: ['value', 'digits'] };
        if (!mappings[kind]) throw new Error('这个槽需要数值、变量、实时读数或条件积木');
        const e = { kind };
        if (kind === 'unary') e.op = b.getFieldValue('OP');
        if (kind === 'random') e.integer = b.getFieldValue('INTEGER') === 'true';
        if (kind === 'listItem') e.name = variableName(b);
        for (const key of mappings[kind]) e[key] = expression(need(b, key.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()));
        return e;
      }
    }
  };
  const list = (first) => {
    const out = [];
    for (let b = first; b; b = b.getNextBlock()) {
      if (!b.isEnabled()) continue;
      if (++size > 3000) throw new Error('积木过多');
      const r = { id: b.id, type: b.type.replace('riden_', '') };
      const ex = (name) => expression(need(b, name));
      if (b.getField('DEVICE')) r.device = b.getFieldValue('DEVICE');
      switch (r.type) {
        case 'set': r.voltage = ex('V'); r.current = ex('I'); break;
        case 'single': case 'adjust': r.field = b.getFieldValue('FIELD'); r.value = ex('VALUE'); break;
        case 'recall': r.slot = ex('SLOT'); break;
        case 'savePreset': r.slot = ex('SLOT'); r.voltage = ex('V'); r.current = ex('I'); r.ovp = ex('OVP'); r.ocp = ex('OCP'); break;
        case 'backlight': r.value = ex('VALUE'); break;
        case 'resetStats': break;
        case 'readBattery': r.name = variableName(b); break;
        case 'output': r.on = b.getFieldValue('ON') === 'true'; break;
        case 'protection': r.ovp = ex('OVP'); r.ocp = ex('OCP'); break;
        case 'ramp': r.field = b.getFieldValue('FIELD'); r.to = ex('TO'); r.seconds = ex('SECONDS'); break;
        case 'wait': r.seconds = ex('SECONDS'); break;
        case 'until': r.condition = ex('CONDITION'); r.hold = ex('HOLD'); r.timeout = ex('TIMEOUT'); break;
        case 'if': r.condition = ex('CONDITION'); r.then = list(b.getInputTargetBlock('THEN')); r.else = list(b.getInputTargetBlock('ELSE')); break;
        case 'while': case 'repeat': r.condition = r.type === 'while' ? ex('CONDITION') : null; r.type = 'repeat'; r.count = ex('COUNT'); r.body = list(b.getInputTargetBlock('BODY')); break;
        case 'for': r.name = variableName(b); r.from = ex('FROM'); r.to = ex('TO'); r.step = ex('STEP'); r.body = list(b.getInputTargetBlock('BODY')); break;
        case 'forever': r.body = list(b.getInputTargetBlock('BODY')); break;
        case 'repeatUntil': r.condition = ex('CONDITION'); r.body = list(b.getInputTargetBlock('BODY')); break;
        case 'break': case 'continue': break;
        case 'assert': r.condition = ex('CONDITION'); r.message = b.getFieldValue('MESSAGE'); break;
        case 'parallel': r.branches = Array.from({ length: b.branchCount }, (_, i) => list(b.getInputTargetBlock(`BRANCH${i}`))); break;
        case 'variable': r.name = variableName(b); r.value = ex('VALUE'); break;
        case 'change': r.name = variableName(b); r.value = ex('VALUE'); break;
        case 'timerReset': case 'call': r.name = b.getFieldValue('NAME'); break;
        case 'listClear': case 'listAppend': case 'listSet': case 'listDelete':
          r.name = variableName(b);
          if (b.getInput('VALUE')) r.value = ex('VALUE');
          if (b.getInput('INDEX')) r.index = ex('INDEX');
          break;
        case 'battery': r.name = variableName(b); break;
        case 'log': r.message = b.getFieldValue('MESSAGE'); r.value = ex('VALUE'); break;
        case 'logText': r.value = ex('VALUE'); break;
        case 'stop': r.message = b.getFieldValue('MESSAGE'); break;
        default: throw new Error('开始积木下面只能接动作和流程积木');
      }
      out.push(r);
    }
    return out;
  };
  const blocks = list(starts[0].getNextBlock());
  const procedures = workspace.getAllBlocks(false).filter((b) => b.type === 'riden_define' && b.isEnabled()).map((b) => ({ id: b.id, name: b.getFieldValue('NAME'), body: list(b.getInputTargetBlock('BODY')) }));
  return { blocks, procedures };
}
export function workspaceProgram(workspace) { return workspaceDefinition(workspace).blocks; }
