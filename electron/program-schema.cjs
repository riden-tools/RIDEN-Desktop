'use strict';
// Shared, data-only program format. No JavaScript execution, scripts or register access.
const { FIELDS, OPS, TYPES } = require('../shared/program-types.json');
let serial = 0;
const uid = () => `b-${Date.now().toString(36)}-${(++serial).toString(36)}`;
const num = (value) => ({ kind: 'number', value });
const param = (name) => ({ kind: 'param', name });
const variable = (name) => ({ kind: 'variable', name });
const telemetry = (device, field) => ({ kind: 'telemetry', device, field });
const binary = (op, left, right) => ({ kind: 'binary', op, left, right });
function block(type, device = 'supply') {
  const b = { id: uid(), type };
  switch (type) {
    case 'set': return { ...b, device, voltage: num(5), current: num(1) };
    case 'single': return { ...b, device, field: 'voltage', value: num(5) };
    case 'adjust': return { ...b, device, field: 'voltage', value: num(0.1) };
    case 'recall': return { ...b, device, slot: num(1) };
    case 'savePreset': return { ...b, device, slot: num(1), voltage: num(5), current: num(1), ovp: num(6), ocp: num(1.2) };
    case 'backlight': return { ...b, device, value: num(3) };
    case 'resetStats': return { ...b, device };
    case 'readBattery': return { ...b, device, name: '电池电压' };
    case 'output': return { ...b, device, on: true };
    case 'protection': return { ...b, device, ovp: num(6), ocp: num(1.2) };
    case 'ramp': return { ...b, device, field: 'voltage', to: num(5), seconds: num(10) };
    case 'wait': return { ...b, seconds: num(1) };
    case 'until': return { ...b, condition: binary('<', telemetry(device, 'i'), num(0.1)), hold: num(10), timeout: num(3600) };
    case 'if': return { ...b, condition: binary('>', telemetry(device, 'v'), num(4)), then: [], else: [] };
    case 'repeat': return { ...b, count: num(3), condition: null, body: [] };
    case 'for': return { ...b, name: '序号', from: num(1), to: num(10), step: num(1), body: [] };
    case 'forever': return { ...b, body: [] };
    case 'repeatUntil': return { ...b, condition: binary('>', telemetry(device, 'v'), num(4)), body: [] };
    case 'break': case 'continue': return b;
    case 'assert': return { ...b, condition: num(1), message: '条件检查失败' };
    case 'call': return { ...b, name: '自定义动作' };
    case 'parallel': return { ...b, branches: [[], []] };
    case 'variable': return { ...b, name: '数值', value: num(0) };
    case 'change': return { ...b, name: '数值', value: num(1) };
    case 'timerReset': return { ...b, name: '计时器' };
    case 'listClear': return { ...b, name: '数据' };
    case 'listAppend': return { ...b, name: '数据', value: telemetry(device, 'v') };
    case 'listSet': return { ...b, name: '数据', index: num(1), value: num(0) };
    case 'listDelete': return { ...b, name: '数据', index: num(1) };
    case 'logText': return { ...b, value: { kind: 'text', value: '程序正在运行' } };
    case 'log': return { ...b, message: '当前读数', value: telemetry(device, 'v') };
    case 'battery': return { ...b, device, name: '电池串数' };
    case 'stop': return { ...b, message: '程序完成' };
    default: throw new Error('未知积木');
  }
}
function emptyProgram() {
  return { version: 1, id: uid(), name: '新建程序', description: '',
    devices: [{ key: 'supply', label: '电源 A' }], parameters: [], maxSeconds: 21600, blocks: [] };
}
function chargingProgram() {
  const p = emptyProgram();
  Object.assign(p, { id: 'example-lithium-charge', name: '锂电池充电', description: '4.2 V / 串 · 自动估算串数 · 低于 0.1 A 持续超过 10 s 后完成',
    parameters: [{ key: 'chargeCurrent', label: '充电限流', unit: 'A', min: 0.001, max: 30, default: null }],
  });
  const target = () => binary('*', variable('电池串数'), num(4.2));
  p.blocks = [
    { ...block('output'), on: false }, block('battery'),
    { ...block('variable'), name: '目标电压', value: target() },
    { ...block('set'), voltage: variable('目标电压'), current: param('chargeCurrent') },
    { ...block('protection'), ovp: binary('*', variable('电池串数'), num(4.25)),
      ocp: binary('*', param('chargeCurrent'), num(1.1)) },
    block('output'), { ...block('wait'), seconds: num(2) },
    { ...block('until'), condition: binary('and', binary('<', telemetry('supply', 'i'), num(0.1)),
      binary('and', binary('==', telemetry('supply', 'cc'), num(0)),
        binary('>=', telemetry('supply', 'v'), binary('-', variable('目标电压'), binary('*', variable('电池串数'), num(0.05)))))),
      hold: num(10), timeout: num(21600) },
    { ...block('output'), on: false }, { ...block('stop'), message: '充电完成' },
  ];
  return p;
}
function sweepProgram() {
  const p = emptyProgram();
  Object.assign(p, { name: '电压阶梯扫描', description: '按步长改变电压，记录 V / A 列表并统计电流均值', maxSeconds: 3600,
    parameters: [{ key: 'limit', label: '限流', unit: 'A', min: 0.001, max: 30, default: null },
      { key: 'fromV', label: '起始电压', unit: 'V', min: 0, max: 60, default: 1 },
      { key: 'toV', label: '结束电压', unit: 'V', min: 0, max: 60, default: 5 },
      { key: 'step', label: '扫描步长', unit: 'V', min: 0.01, max: 60, default: 0.5 }],
    procedures: [{ id: uid(), name: '记录采样', body: [
      { ...block('listAppend'), name: '电压记录', value: telemetry('supply', 'v') },
      { ...block('listAppend'), name: '电流记录', value: telemetry('supply', 'i') },
    ] }],
  });
  p.blocks = [{ ...block('output'), on: false }, { ...block('assert'), condition: binary('<=', param('fromV'), param('toV')), message: '起始电压不能大于结束电压' },
    { ...block('assert'), condition: binary('<=', param('toV'), { kind: 'limit', device: 'supply', field: 'vMax' }), message: '扫描电压超出设备量程' },
    { ...block('listClear'), name: '电压记录' }, { ...block('listClear'), name: '电流记录' },
    { ...block('set'), voltage: param('fromV'), current: param('limit') }, block('output'),
    { ...block('for'), name: '扫描电压', from: param('fromV'), to: param('toV'), step: param('step'), body: [
      { ...block('single'), value: variable('扫描电压') }, { ...block('wait'), seconds: num(1) }, { ...block('call'), name: '记录采样' },
    ] }, { ...block('output'), on: false }, { ...block('log'), message: '扫描电流均值 A', value: { kind: 'listStat', name: '电流记录', op: 'mean' } }];
  return p;
}
function trackingProgram() {
  const p = emptyProgram();
  Object.assign(p, { name: '双设备电压跟随', description: '电源 B 跟随 A 的实测电压，按倍率换算并限制到 B 的量程；运行约 10 s 后关闭两台输出', maxSeconds: 60,
    devices: [{ key: 'supply', label: '主电源 A' }, { key: 'follower', label: '跟随电源 B' }],
    parameters: [{ key: 'limit', label: '两台设备限流', unit: 'A', min: 0.001, max: 30, default: null },
      { key: 'target', label: '主电源电压', unit: 'V', min: 0, max: 60, default: 3.3 },
      { key: 'gain', label: '跟随倍率', unit: '', min: 0, max: 10, default: 1 }],
  });
  const parallel = block('parallel');
  parallel.branches = [[{ ...block('set'), voltage: param('target'), current: param('limit') }, block('output'), { ...block('wait'), seconds: num(10) }],
    [{ ...block('set', 'follower'), voltage: num(0), current: param('limit') }, block('output', 'follower'), { ...block('repeat'), count: num(50), body: [
      { ...block('single', 'follower'), value: { kind: 'clamp', value: binary('*', telemetry('supply', 'v'), param('gain')), min: num(0), max: { kind: 'limit', device: 'follower', field: 'vMax' } } },
      { ...block('wait'), seconds: num(0.2) },
    ] }]];
  p.blocks = [{ ...block('output'), on: false }, { ...block('output', 'follower'), on: false }, parallel];
  return p;
}
module.exports = { FIELDS, OPS, TYPES, uid, num, block, emptyProgram, chargingProgram, sweepProgram, trackingProgram };
