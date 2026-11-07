import * as BlocklyModule from 'blockly/core';
const Blockly = Reflect.get(BlocklyModule, 'default') || BlocklyModule;
import * as Zh from 'blockly/msg/zh-hans';
import schema from '../../shared/program-types.json' with { type: 'json' };
Blockly.setLocale(Zh);
const { FIELDS, OPS, UNARY, LIMITS, LIST_STATS } = schema;
const colours = { event: '#75924c', control: '#438a77', flow: '#b28132', data: '#8764a9', math: '#467eaa', logic: '#527d58' };
const numberInput = (name) => ({ type: 'input_value', name, check: ['Number', 'Boolean'] });
const conditionInput = (name = 'CONDITION') => ({ type: 'input_value', name, check: 'Boolean' });
const text = (name, value) => ({ type: 'field_input', name, text: value });
const dropdown = (name, options) => ({ type: 'field_dropdown', name, options });
function roleOptions() { const roles = this.getSourceBlock()?.workspace.ridenDevices || [{ key: 'supply', label: '电源 A' }]; return roles.length ? roles.map((d) => [d.label, d.key]) : [['请先添加设备角色', '__none__']]; }
function paramOptions() { const ps = this.getSourceBlock()?.workspace.ridenParameters || []; return ps.length ? ps.map((p) => [p.label, p.key]) : [['请先添加启动参数', '']]; }
const device = () => dropdown('DEVICE', roleOptions);
const varField = (name = 'NAME') => ({ type: 'field_variable', name, variable: '数值' });
const statement = (type, message0, args0, colour, extra = {}) => ({ type: `riden_${type}`, message0, args0, style: `${colour}_blocks`, previousStatement: null, nextStatement: null, inputsInline: true, ...extra });
const defs = [
  { type: 'riden_start', message0: '当点击 ▶ 运行', style: 'event_blocks', nextStatement: null, hat: 'cap', tooltip: '把要运行的积木接在下面。未连接的积木不会执行。' },
  statement('set', '将 %1 设为 %2 V  限流 %3 A', [device(), numberInput('V'), numberInput('I')], 'control'),
  statement('output', '将 %1 输出 %2', [device(), dropdown('ON', [['开启', 'true'], ['关闭', 'false']])], 'control'),
  statement('protection', '将 %1 保护设为 OVP %2 V  OCP %3 A', [device(), numberInput('OVP'), numberInput('OCP')], 'control', { tooltip: '即时应用 HR82/83，同时改变 M0 存储。' }),
  statement('ramp', '用 %1 秒将 %2 的 %3 渐变到 %4', [numberInput('SECONDS'), device(), dropdown('FIELD', [['电压 V', 'voltage'], ['电流 A', 'current']]), numberInput('TO')], 'control'),
  statement('wait', '等待 %1 秒', [numberInput('SECONDS')], 'flow'),
  statement('until', '等待 %1 连续成立超过 %2 秒\n最多等待 %3 秒', [conditionInput(), numberInput('HOLD'), numberInput('TIMEOUT')], 'flow'),
  statement('if', '如果 %1', [conditionInput()], 'flow', { message1: '那么 %1', args1: [{ type: 'input_statement', name: 'THEN' }], message2: '否则 %1', args2: [{ type: 'input_statement', name: 'ELSE' }] }),
  statement('repeat', '重复执行 %1 次', [numberInput('COUNT')], 'flow', { message1: '%1', args1: [{ type: 'input_statement', name: 'BODY' }] }),
  statement('while', '当 %1 重复执行，最多 %2 次', [conditionInput(), numberInput('COUNT')], 'flow', { message1: '%1', args1: [{ type: 'input_statement', name: 'BODY' }] }),
  statement('variable', '将变量 %1 设为 %2', [varField(), numberInput('VALUE')], 'data'),
  statement('battery', '识别 %1 电池串数，存入 %2', [device(), varField()], 'data', { tooltip: '输出关闭时读取电池电压；HR33 为零时使用 HR10 端电压。估算串数后等待确认。仅普通 4.2 V 锂电池。' }),
  statement('log', '记录 %1 数值 %2', [text('MESSAGE', '当前读数'), numberInput('VALUE')], 'data'),
  statement('stop', '结束程序 %1', [text('MESSAGE', '程序完成')], 'flow', { nextStatement: undefined, tooltip: '结束所有分支，关闭本程序全部绑定设备的输出。' }),
  { type: 'riden_number', message0: '%1', args0: [{ type: 'field_number', name: 'NUM', value: 0 }], output: 'Number', style: 'math_blocks' },
  { type: 'riden_read', message0: '%1 的 %2', args0: [device(), dropdown('FIELD', Object.entries(FIELDS).map(([k, [label, unit]]) => [label + (unit ? ` ${unit}` : ''), k]))], output: 'Number', style: 'data_blocks' },
  { type: 'riden_param', message0: '参数 %1', args0: [dropdown('NAME', paramOptions)], output: 'Number', style: 'data_blocks' },
  { type: 'riden_get', message0: '%1', args0: [varField()], output: 'Number', style: 'data_blocks' },
  { type: 'riden_math', message0: '%1 %2 %3', args0: [numberInput('LEFT'), dropdown('OP', Object.entries(OPS).filter(([k]) => ['+', '-', '*', '/', 'min', 'max', '%', '**'].includes(k)).map(([k, v]) => [v, k])), numberInput('RIGHT')], output: 'Number', style: 'math_blocks', inputsInline: true },
  { type: 'riden_compare', message0: '%1 %2 %3', args0: [numberInput('LEFT'), dropdown('OP', Object.entries(OPS).filter(([k]) => ['<', '<=', '>', '>=', '==', '!='].includes(k)).map(([k, v]) => [v, k])), numberInput('RIGHT')], output: 'Boolean', style: 'logic_blocks', inputsInline: true },
  { type: 'riden_logic', message0: '%1 %2 %3', args0: [conditionInput('LEFT'), dropdown('OP', [['并且', 'and'], ['或者', 'or'], ['异或', 'xor']]), conditionInput('RIGHT')], output: 'Boolean', style: 'logic_blocks', inputsInline: true },
  { type: 'riden_bool', message0: '%1', args0: [dropdown('VALUE', [['成立', '1'], ['不成立', '0']])], output: 'Boolean', style: 'logic_blocks' },
  { type: 'riden_charge_ready', message0: '%1 已进入恒压充电末期', args0: [device()], message1: '电流低于（A）%1', args1: [numberInput('CURRENT')], message2: '电压至少为（V）%1', args2: [numberInput('MINV')], output: 'Boolean', style: 'logic_blocks', inputsInline: false },
];
const listField = () => ({ type: 'field_variable', name: 'NAME', variable: '数据', variableTypes: ['list'], defaultType: 'list' });
const namedText = (name = 'NAME', value = '计时器') => text(name, value);
function procedureOptions() {
  const ws = this.getSourceBlock()?.workspace;
  const live = ws?.getAllBlocks(false).filter((b) => b.type === 'riden_define').map((b) => b.getFieldValue('NAME')) || [];
  const names = [...new Set([...live, ...(ws?.ridenProcedures || []).map((p) => p.name)])].filter(Boolean);
  return names.length ? names.map((name) => [name, name]) : [['请先定义自定义积木', '__none__']];
}
const valueBlock = (type, message0, args0, group = 'math', output = 'Number', extra = {}) => ({ type: `riden_${type}`, message0, args0, output, style: `${group}_blocks`, inputsInline: true, ...extra });
defs.push(
  statement('single', '将 %1 的 %2 设为 %3', [device(), dropdown('FIELD', [['电压 V', 'voltage'], ['电流 A', 'current']]), numberInput('VALUE')], 'control'),
  statement('adjust', '将 %1 的 %2 增加 %3', [device(), dropdown('FIELD', [['电压 V', 'voltage'], ['电流 A', 'current']]), numberInput('VALUE')], 'control', { tooltip: '负数表示减小；不会改动另一个设定值。' }),
  statement('recall', '切换 %1 到数据组 M %2', [device(), numberInput('SLOT')], 'control', { tooltip: 'M1–M9；会载入该组的电压、电流与保护值。' }),
  statement('savePreset', '保存 %1 到 M %2', [device(), numberInput('SLOT')], 'control', { message1: '电压 V %1 限流 A %2', args1: [numberInput('V'), numberInput('I')], message2: 'OVP V %1 OCP A %2', args2: [numberInput('OVP'), numberInput('OCP')] }),
  statement('backlight', '将 %1 背光设为 %2', [device(), numberInput('VALUE')], 'control'),
  statement('resetStats', '清零 %1 的累计容量、能量与时长', [device()], 'control'),
  statement('readBattery', '读取 %1 电池电压 V 存入 %2', [device(), varField()], 'data'),
  statement('change', '将变量 %1 增加 %2', [varField(), numberInput('VALUE')], 'data'),
  statement('timerReset', '重置计时器 %1', [namedText()], 'flow'),
  statement('for', '对 %1 从 %2 到 %3 每次增加 %4', [varField(), numberInput('FROM'), numberInput('TO'), numberInput('STEP')], 'flow', { message1: '%1', args1: [{ type: 'input_statement', name: 'BODY' }], tooltip: '含起点与终点，负步长可倒序，最多 100000 次。' }),
  statement('forever', '一直重复', [], 'flow', { message1: '%1', args1: [{ type: 'input_statement', name: 'BODY' }], tooltip: '仍受程序最长运行时间约束，停止时关闭输出。' }),
  statement('repeatUntil', '重复直到 %1', [conditionInput()], 'flow', { message1: '%1', args1: [{ type: 'input_statement', name: 'BODY' }] }),
  statement('break', '跳出当前循环', [], 'flow', { nextStatement: undefined }),
  statement('continue', '开始下一次循环', [], 'flow', { nextStatement: undefined }),
  statement('assert', '检查 %1 失败时停止并提示 %2', [conditionInput(), text('MESSAGE', '条件检查失败')], 'flow'),
  statement('listClear', '清空列表 %1', [listField()], 'data'),
  statement('listAppend', '添加 %1 到列表 %2', [numberInput('VALUE'), listField()], 'data'),
  statement('listSet', '将列表 %1 第 %2 项设为 %3', [listField(), numberInput('INDEX'), numberInput('VALUE')], 'data'),
  statement('listDelete', '删除列表 %1 第 %2 项', [listField(), numberInput('INDEX')], 'data'),
  statement('logText', '记录 %1', [{ type: 'input_value', name: 'VALUE', check: ['String', 'Number', 'Boolean'] }], 'data'),
  statement('call', '执行 %1', [dropdown('NAME', procedureOptions)], 'event'),
  { type: 'riden_define', message0: '定义 %1', args0: [text('NAME', '自定义动作')], message1: '%1', args1: [{ type: 'input_statement', name: 'BODY' }], style: 'event_blocks', hat: 'cap', tooltip: '可重复调用的一组动作，可读写公共变量；不会自动执行。' },
  valueBlock('unary', '%1 %2', [dropdown('OP', Object.entries(UNARY).map(([k, v]) => [v, k])), numberInput('VALUE')]),
  valueBlock('constant', '%1', [dropdown('NAME', [['圆周率 π', 'pi'], ['自然常数 e', 'e']])]),
  valueBlock('clamp', '将 %1 限制在 %2 到 %3', [numberInput('VALUE'), numberInput('MIN'), numberInput('MAX')]),
  valueBlock('map', '将 %1 从区间 %2 … %3 映射到 %4 … %5', [numberInput('VALUE'), numberInput('FROM_MIN'), numberInput('FROM_MAX'), numberInput('TO_MIN'), numberInput('TO_MAX')]),
  valueBlock('random', '在 %1 到 %2 中随机取 %3', [numberInput('MIN'), numberInput('MAX'), dropdown('INTEGER', [['整数', 'true'], ['小数', 'false']])]),
  valueBlock('not', '不成立 %1', [conditionInput('VALUE')], 'logic', 'Boolean'),
  valueBlock('between', '%1 位于 %2 到 %3 之间', [numberInput('VALUE'), numberInput('MIN'), numberInput('MAX')], 'logic', 'Boolean'),
  valueBlock('approx', '%1 约等于 %2 允许误差 %3', [numberInput('LEFT'), numberInput('RIGHT'), numberInput('TOLERANCE')], 'logic', 'Boolean'),
  valueBlock('choose', '如果 %1 则取 %2 否则取 %3', [conditionInput(), numberInput('THEN'), numberInput('ELSE')], 'logic'),
  valueBlock('limit', '%1 的 %2', [device(), dropdown('FIELD', Object.entries(LIMITS).map(([k, [v, unit]]) => [`${v} ${unit}`, k]))], 'data'),
  valueBlock('state', '%1 %2', [device(), dropdown('FIELD', [['正在输出', 'output'], ['处于恒压 CV', 'cv'], ['处于恒流 CC', 'cc']])], 'logic', 'Boolean'),
  valueBlock('timer', '计时器 %1 秒', [namedText()], 'data'),
  valueBlock('listItem', '列表 %1 的第 %2 项', [listField(), numberInput('INDEX')], 'data'),
  valueBlock('listStat', '列表 %1 的 %2', [listField(), dropdown('OP', Object.entries(LIST_STATS).map(([k, v]) => [v, k]))], 'data'),
  valueBlock('text', '%1', [text('TEXT', '文字')], 'data', 'String'),
  valueBlock('join', '拼接 %1 和 %2', [{ type: 'input_value', name: 'LEFT', check: ['String', 'Number', 'Boolean'] }, { type: 'input_value', name: 'RIGHT', check: ['String', 'Number', 'Boolean'] }], 'data', 'String'),
  valueBlock('format', '将 %1 保留 %2 位小数', [numberInput('VALUE'), numberInput('DIGITS')], 'data', 'String'),
);
Blockly.common.defineBlocks(Blockly.common.createBlockDefinitionsFromJsonArray(defs));
Blockly.Blocks.riden_parallel = {
  init() {
    this.branchCount = 2;
    this.appendDummyInput().appendField('同时运行').appendField(new Blockly.FieldDropdown([2, 3, 4, 5, 6, 7, 8].map((n) => [`${n} 路`, String(n)]), (value) => { this.updateBranches(Number(value)); return value; }), 'COUNT').appendField('分支');
    this.setPreviousStatement(true); this.setNextStatement(true); this.setStyle('flow_blocks'); this.updateBranches(2);
    this.setTooltip('分支同时运行，全部完成后继续；各分支请控制不同设备。');
  },
  updateBranches(count) {
    for (let i = 0; i < 8; i++) {
      const exists = this.getInput(`BRANCH${i}`);
      if (i < count && !exists) this.appendStatementInput(`BRANCH${i}`).appendField(`分支 ${i + 1}`);
      else if (i >= count && exists) this.removeInput(`BRANCH${i}`);
    }
    this.branchCount = count;
  },
  saveExtraState() { return { count: this.branchCount }; },
  loadExtraState(state) { this.updateBranches(state.count); },
};
const N = (value) => ({ shadow: { type: 'riden_number', fields: { NUM: value } } });
const B = (type, inputs = {}, fields = {}) => ({ kind: 'block', type: `riden_${type}`, inputs, fields });
const Q = () => ({ shadow: { type: 'riden_bool', fields: { VALUE: '1' } } });
const T = (value) => ({ shadow: { type: 'riden_text', fields: { TEXT: value } } });
const category = (name, group, contents) => ({ kind: 'category', name, categorystyle: `${group}_category`, contents });
export const toolbox = {
  kind: 'categoryToolbox', contents: [
    category('开始', 'event', [B('start')]),
    category('设备', 'control', [B('single', { VALUE: N(5) }), B('single', { VALUE: N(0.5) }, { FIELD: 'current' }), B('adjust', { VALUE: N(0.1) }), B('set', { V: N(5), I: N(0.5) }), B('output'), B('output', {}, { ON: 'false' }), B('protection', { OVP: N(6), OCP: N(1) }), B('ramp', { SECONDS: N(10), TO: N(5) }), B('recall', { SLOT: N(1) }), B('savePreset', { SLOT: N(1), V: N(5), I: N(0.5), OVP: N(6), OCP: N(1) }), B('resetStats'), B('backlight', { VALUE: N(3) })]),
    category('控制', 'flow', [B('wait', { SECONDS: N(1) }), B('until', { HOLD: N(10), TIMEOUT: N(3600) }), B('if'), B('repeat', { COUNT: N(3) }), B('while', { COUNT: N(100000) }), B('for', { FROM: N(1), TO: N(10), STEP: N(1) }), B('repeatUntil'), B('forever'), B('break'), B('continue'), B('parallel'), B('assert', { CONDITION: Q() }), B('stop')]),
    category('数据', 'data', [B('read'), B('limit'), B('state'), B('param'), B('readBattery'), B('log', { VALUE: N(0) }), B('timerReset'), B('timer')]),
    category('变量', 'data', [B('variable', { VALUE: N(0) }), B('change', { VALUE: N(1) }), B('get')]),
    category('列表', 'data', [B('listClear'), B('listAppend', { VALUE: N(0) }), B('listItem', { INDEX: N(1) }), B('listSet', { INDEX: N(1), VALUE: N(0) }), B('listDelete', { INDEX: N(1) }), B('listStat')]),
    category('运算', 'math', [B('number'), B('math', { LEFT: N(0), RIGHT: N(1) }), B('unary', { VALUE: N(0) }), B('constant'), B('random', { MIN: N(1), MAX: N(10) }), B('clamp', { VALUE: N(5), MIN: N(0), MAX: N(10) }), B('map', { VALUE: N(5), FROM_MIN: N(0), FROM_MAX: N(10), TO_MIN: N(0), TO_MAX: N(100) })]),
    category('逻辑', 'logic', [B('compare', { LEFT: N(0), RIGHT: N(0) }), B('logic'), B('not', { VALUE: Q() }), B('between', { VALUE: N(5), MIN: N(0), MAX: N(10) }), B('approx', { LEFT: N(4.2), RIGHT: N(4.19), TOLERANCE: N(0.02) }), B('choose', { CONDITION: Q(), THEN: N(1), ELSE: N(0) }), B('bool')]),
    category('文字', 'data', [B('text'), B('join', { LEFT: T('电压：'), RIGHT: N(5) }), B('format', { VALUE: N(4.2), DIGITS: N(2) }), B('logText', { VALUE: T('程序正在运行') })]),
    { kind: 'category', name: '自定义', categorystyle: 'event_category', custom: 'RIDEN_PROCEDURES' },
    category('充电', 'event', [B('battery'), B('charge_ready', { CURRENT: N(0.1), MINV: N(4.15) })]),
  ],
};
export function theme(dark) {
  const css = getComputedStyle(document.documentElement);
  const color = (name) => css.getPropertyValue(name).trim();
  return Blockly.Theme.defineTheme('riden', {
    base: Blockly.Themes.Zelos, startHats: true,
    fontStyle: { family: "'Segoe UI', 'Noto Sans CJK SC', sans-serif", size: 12, weight: '500' },
    blockStyles: Object.fromEntries(Object.entries(colours).map(([k, v]) => [`${k}_blocks`, { colourPrimary: v, colourSecondary: v, colourTertiary: dark ? '#b7c9b0' : '#365240' }])),
    categoryStyles: Object.fromEntries(Object.entries(colours).map(([k, v]) => [`${k}_category`, { colour: v }])),
    componentStyles: { workspaceBackgroundColour: color('--bg'), toolboxBackgroundColour: color('--panel'), toolboxForegroundColour: color('--text-2'), flyoutBackgroundColour: color('--panel-2'), flyoutForegroundColour: color('--text'), flyoutOpacity: 1, scrollbarColour: color('--border-strong'), scrollbarOpacity: 0.65, insertionMarkerColour: color('--primary'), insertionMarkerOpacity: 0.6, cursorColour: color('--primary') },
  });
}
export { Blockly };
