'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ProgramManager, validateProgram } = require('../electron/program-engine.cjs');
const { block, num, emptyProgram, chargingProgram } = require('../electron/program-schema.cjs');
const { ProgramLibrary } = require('../electron/program-library.cjs');
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 4000) { const deadline = Date.now() + ms; while (!fn()) { if (Date.now() > deadline) throw new Error('test timed out'); await delay(10); } }
function fake(id) {
  const d = { config: { id, name: id }, info: { status: 'online', writable: true, vMax: 61, iMax: 6.1, ovpMax: 62, ocpMax: 6.2, iScale: 1000 },
    live: { seq: 0, v: 0, i: 0, p: 0, setV: 0, setI: 0, output: false, cc: false, protect: '' }, stats: { ah: 0, wh: 0 }, writes: [], lastSampleAt: Date.now(), battery: 3.7,
    async setVoltage(v) { this.writes.push(['v', v]); this.live.setV = v; },
    async setCurrent(i) { this.writes.push(['i', i]); this.live.setI = i; },
    async setProtection(v, i) { this.writes.push(['protect', v, i]); if (v > this.info.ovpMax || i > this.info.ocpMax) throw new Error('range'); },
    async setOutput(on) { this.writes.push(['output', on]); this.live.output = on; },
    async verifyOutputOff() { if (this.live.output) throw new Error('still on'); },
    async readBattery() { return { voltage: this.battery, mode: 1 }; },
  };
  d.timer = setInterval(() => { d.live.seq++; d.lastSampleAt = Date.now(); }, 20);
  return d;
}
function setup(t, count = 2) { const devices = new Map(); for (let i = 0; i < count; i++) { const d = fake(`d${i}`); t.after(() => clearInterval(d.timer)); devices.set(d.config.id, d); } return { devices, manager: new ProgramManager(devices), a: devices.get('d0'), b: devices.get('d1') }; }
function twoDevices() { const p = emptyProgram(); p.devices.push({ key: 'load', label: '电源 B' }); return p; }
function start(manager, p, params = {}, bindings = { supply: 'd0', load: 'd1' }) { const s = manager.start(p, bindings, params); return manager.runs.get(s.id); }

test('schema validates all nested nodes, unique resources and parameters before device writes', (t) => {
  const { manager, a } = setup(t);
  const p = chargingProgram();
  assert.doesNotThrow(() => validateProgram(p));
  assert.throws(() => start(manager, p), /有限数值/);
  const b = block('parallel'); b.branches = [[block('output')], [block('output')]];
  const invalid = { ...emptyProgram(), blocks: [b] };
  assert.throws(() => start(manager, invalid), /并行分支不能/);
  b.branches[1][0].device = 'missing';
  assert.throws(() => validateProgram(invalid), /未定义/);
  assert.deepEqual(a.writes, []);
});

test('one program reads device A to control device B with arithmetic, variables and branches', async (t) => {
  const { manager, a, b } = setup(t);
  a.live.v = 3.75;
  const p = twoDevices();
  const expr = { kind: 'binary', op: '*', left: { kind: 'telemetry', device: 'supply', field: 'v' }, right: num(2) };
  p.blocks = [{ ...block('variable'), name: 'target', value: expr }, { ...block('if'), condition: { kind: 'binary', op: '>', left: expr, right: num(7) }, then: [{ ...block('set', 'load'), voltage: { kind: 'variable', name: 'target' }, current: num(0.5) }], else: [] }];
  const r = start(manager, p); await r.done;
  assert.equal(r.state.status, 'completed'); assert.equal(b.live.setV, 7.5); assert.equal(b.live.setI, 0.5);
  assert.deepEqual(a.writes, [['output', false]]); assert.equal(manager.locks.size, 0);
});

test('parallel branches overlap on different devices and both shut down on completion', async (t) => {
  const { manager, a, b } = setup(t);
  const p = twoDevices();
  const timestamps = [];
  a.setVoltage = async (v) => { timestamps.push(['a', Date.now()]); await delay(150); a.live.setV = v; };
  b.setVoltage = async (v) => { timestamps.push(['b', Date.now()]); await delay(150); b.live.setV = v; };
  const parallel = block('parallel'); parallel.branches = [[block('set')], [block('set', 'load')]]; p.blocks = [parallel];
  const r = start(manager, p); await r.done;
  assert.equal(r.state.status, 'completed'); assert.ok(Math.abs(timestamps[0][1] - timestamps[1][1]) < 100);
  assert.equal(a.live.output, false); assert.equal(b.live.output, false);
});

test('continuous condition resets after interruption and cannot complete on stale samples', async (t) => {
  const { manager, a } = setup(t, 1);
  a.live.i = 0.05;
  const p = emptyProgram(); const until = { ...block('until'), hold: num(0.25), timeout: num(3) }; p.blocks = [until];
  const r = start(manager, p);
  await delay(180); a.live.i = 0.2; await delay(150); a.live.i = 0.05;
  await delay(180); assert.equal(r.state.endedAt, null, 'old timer must not survive an interrupt');
  await r.done; assert.equal(r.state.status, 'completed');
  const p2 = emptyProgram(); p2.blocks = [{ ...block('wait'), seconds: num(3) }];
  const stale = start(manager, p2); clearInterval(a.timer); a.lastSampleAt = Date.now() - 2000;
  await stale.done; assert.equal(stale.state.status, 'failed'); assert.match(stale.state.error, /1.5 s/);
});

test('stop cancels all branches, waits for in-flight writes then sends off without late enable', async (t) => {
  const { manager, a, b } = setup(t);
  const p = twoDevices();
  a.setOutput = async (on) => { if (on) await delay(200); a.writes.push(['output', on]); a.live.output = on; };
  const parallel = block('parallel'); parallel.branches = [[block('output'), { ...block('wait'), seconds: num(20) }], [block('output', 'load'), { ...block('wait'), seconds: num(20) }]];
  p.blocks = [parallel]; const r = start(manager, p);
  await delay(50); assert.throws(() => manager.assertFree('d0'), /程序控制/);
  await manager.stop(r.state.id);
  assert.equal(r.state.status, 'stopped'); assert.equal(a.live.output, false); assert.equal(b.live.output, false);
  assert.deepEqual(a.writes.at(-1), ['output', false]); await delay(250); assert.equal(a.live.output, false);
});

test('protection, write failures and maximum duration stop sibling branches; failed shutdown is reported', async (t) => {
  const { manager, a, b } = setup(t);
  const p = twoDevices(); const parallel = block('parallel'); parallel.branches = [[block('set')], [{ ...block('wait'), seconds: num(10) }]]; p.blocks = [parallel];
  a.setVoltage = async () => { throw new Error('RTU failure'); };
  const r = start(manager, p); await r.done; assert.equal(r.state.status, 'failed'); assert.match(r.state.error, /RTU failure/); assert.equal(b.live.output, false);
  const p2 = emptyProgram(); p2.maxSeconds = 1; p2.blocks = [{ ...block('wait'), seconds: num(20) }];
  const timeout = start(manager, p2); await timeout.done; assert.match(timeout.state.error, /最长运行/);
  const p3 = emptyProgram(); p3.blocks = [block('wait')];
  const failed = start(manager, p3); a.info.status = 'error'; a.setOutput = async () => { throw new Error('disconnected'); };
  await failed.done; assert.equal(failed.state.status, 'failed'); assert.deepEqual(failed.state.unconfirmed, ['d0']); assert.match(failed.state.error, /无法确认/);
});

test('battery example requires per-run current and confirmation, then charges to 4.2 V/cell and terminates', async (t) => {
  const { manager, a } = setup(t, 1);
  const p = chargingProgram();
  // Accelerate only the timers; keep production thresholds and graph intact.
  p.blocks.find((b) => b.type === 'wait').seconds = num(0.05);
  p.blocks.find((b) => b.type === 'until').hold = num(0.2);
  const r = start(manager, p, { chargeCurrent: 0.5 });
  await waitFor(() => r.state.pending);
  assert.equal(a.live.output, false); assert.deepEqual(r.state.pending.candidates, [1]);
  assert.throws(() => manager.confirm(r.state.id, r.state.pending.id, 2), /串数无效/);
  manager.confirm(r.state.id, r.state.pending.id, 1);
  await waitFor(() => a.live.output);
  assert.equal(a.live.setV, 4.2); assert.equal(a.live.setI, 0.5);
  a.live.v = 4.19; a.live.i = 0.08; a.live.cc = false;
  await r.done;
  assert.equal(r.state.status, 'completed'); assert.equal(a.live.output, false); assert.match(r.state.logs.at(-1).message, /充电完成/);
  assert.ok(a.writes.some((w) => w[0] === 'protect' && w[1] === 4.25 && w[2] === 0.55));
});

test('ambiguous pack counts require explicit choice; absent battery never enables output', async (t) => {
  const { manager, a } = setup(t, 1);
  const p = chargingProgram(); a.battery = 12.4;
  const r = start(manager, p, { chargeCurrent: 0.5 }); await waitFor(() => r.state.pending);
  assert.deepEqual(r.state.pending.candidates, [3, 4]); assert.equal(a.live.output, false);
  await manager.stop(r.state.id); assert.equal(r.state.status, 'stopped');
  a.battery = 0; const p2 = chargingProgram(); const absent = start(manager, p2, { chargeCurrent: 0.5 }); await absent.done;
  assert.equal(absent.state.status, 'failed'); assert.ok(!a.writes.some((w) => w[0] === 'output' && w[1]));
});

test('program library persists exact graphs and refuses invalid changes without losing saved programs', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'riden-program-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'programs.json'); const lib = new ProgramLibrary(file); assert.equal(lib.list()[0].id, 'example-lithium-charge');
  const p = emptyProgram(); p.blocks = [block('wait')]; lib.save(p);
  const loaded = new ProgramLibrary(file); assert.deepEqual(loaded.list().find((x) => x.id === p.id), p);
  p.blocks[0].seconds.value = Infinity; assert.throws(() => loaded.save(p)); assert.equal(new ProgramLibrary(file).list().length, 2);
});

test('aliases of one Core cannot bypass ownership or masquerade as two devices', async (t) => {
  const { manager, a, b } = setup(t);
  a.info.daemonPort = b.info.daemonPort = 12345;
  const p = twoDevices(); p.blocks = [block('wait')];
  assert.throws(() => start(manager, p), /同一个 Core/);
  const one = emptyProgram(); one.blocks = [{ ...block('wait'), seconds: num(10) }];
  const r = start(manager, one); assert.throws(() => manager.assertFree('d1'), /程序控制/);
  assert.equal(manager.owner('d1'), r.state.id); await manager.stop(r.state.id);
});

const exprVar = (name) => ({ kind: 'variable', name });
const op = (operator, left, right) => ({ kind: 'binary', op: operator, left, right });
test('extended math, logic, mapping, limits, conditional values and text formatting execute', async (t) => {
  const { manager, a } = setup(t, 1); a.info.protection = { ovp: 12, ocp: 2 };
  const values = {
    sqrt: { kind: 'unary', op: 'sqrt', value: num(9) }, sin: { kind: 'unary', op: 'sin', value: num(90) },
    mod: op('%', num(17), num(5)), power: op('**', num(2), num(5)),
    clamped: { kind: 'clamp', value: num(20), min: num(0), max: num(5) },
    mapped: { kind: 'map', value: num(2.5), fromMin: num(0), fromMax: num(10), toMin: num(0), toMax: num(100) },
    between: { kind: 'between', value: num(3), min: num(1), max: num(3) },
    near: { kind: 'approx', left: num(4.2), right: num(4.19), tolerance: num(0.02) },
    not: { kind: 'not', value: num(0) }, xor: op('xor', num(1), num(0)),
    selected: { kind: 'choose', condition: num(0), then: op('/', num(1), num(0)), else: num(7) },
    pi: { kind: 'constant', name: 'pi' }, limit: { kind: 'limit', device: 'supply', field: 'ovp' },
    random: { kind: 'random', min: num(3), max: num(3), integer: true },
  };
  const p = emptyProgram(); p.blocks = Object.entries(values).map(([name, value]) => ({ ...block('variable'), name, value }));
  p.blocks.push({ ...block('logText'), value: { kind: 'join', left: { kind: 'text', value: '目标=' }, right: { kind: 'format', value: num(4.2), digits: num(2) } } });
  const r = start(manager, p); await r.done;
  assert.equal(r.state.status, 'completed', r.state.error);
  assert.deepEqual({ ...r.variables }, { sqrt: 3, sin: 1, mod: 2, power: 32, clamped: 5, mapped: 25, between: 1, near: 1, not: 1, xor: 1, selected: 7, pi: Math.PI, limit: 12, random: 3 });
  assert.ok(r.state.logs.some((l) => l.message === '目标=4.20'));
});

test('for loops, continue/break, repeat-until and numeric lists use precise bounds and 1-based indices', async (t) => {
  const { manager } = setup(t, 1); const p = emptyProgram();
  p.blocks = [block('listClear'), { ...block('for'), name: '序号', from: num(5), to: num(1), step: num(-1), body: [
    { ...block('if'), condition: op('==', exprVar('序号'), num(4)), then: [block('continue')], else: [] },
    { ...block('listAppend'), value: exprVar('序号') },
    { ...block('if'), condition: op('==', exprVar('序号'), num(2)), then: [block('break')], else: [] },
  ] }, { ...block('listSet'), index: num(2), value: num(8) }, { ...block('listDelete'), index: num(3) },
  { ...block('variable'), name: '首项', value: { kind: 'listItem', name: '数据', index: num(1) } },
  { ...block('variable'), name: '均值', value: { kind: 'listStat', name: '数据', op: 'mean' } },
  { ...block('repeatUntil'), condition: op('>=', exprVar('计数'), num(3)), body: [ { ...block('change'), name: '计数', value: num(1) } ] }];
  // Scratch-style increment initializes an unassigned counter to zero.
  p.blocks.splice(-1, 0, { ...block('variable'), name: '计数', value: num(0) });
  const r = start(manager, p); await r.done;
  assert.equal(r.state.status, 'completed', r.state.error); assert.deepEqual(r.lists.get('数据'), [5, 8]);
  assert.equal(r.variables['首项'], 5); assert.equal(r.variables['均值'], 6.5); assert.equal(r.variables['计数'], 3);
  assert.deepEqual(r.state.lists['数据'], { length: 2, tail: [5, 8] });
});

test('custom blocks resolve nested calls and parallel validation follows their transitive side effects', async (t) => {
  const { manager, a } = setup(t, 1); const p = emptyProgram();
  p.procedures = [{ id: 'define-leaf', name: '设置目标', body: [{ ...block('single'), value: num(3.3) }] },
    { id: 'define-parent', name: '测试阶段', body: [{ ...block('call'), name: '设置目标' }, { ...block('change'), name: '执行次数' }] }];
  p.blocks = [ { ...block('repeat'), body: [{ ...block('call'), name: '测试阶段' }] } ];
  const r = start(manager, p); await r.done; assert.equal(r.state.status, 'completed', r.state.error); assert.equal(a.live.setV, 3.3); assert.equal(r.variables['执行次数'], 3);
  const parallel = block('parallel'); parallel.branches = [[{ ...block('call'), name: '测试阶段' }], [{ ...block('call'), name: '设置目标' }]];
  p.blocks = [parallel]; assert.throws(() => validateProgram(p), /并行分支不能/);
  p.procedures[0].body = [{ ...block('call'), name: '测试阶段' }]; assert.throws(() => validateProgram(p), /递归/);
  p.procedures[0].body = [block('break')]; assert.throws(() => validateProgram(p), /循环内部/);
});

test('named timers are independent and empty infinite loops remain cancellable', async (t) => {
  const { manager } = setup(t, 1); const p = emptyProgram();
  p.blocks = [{ ...block('timerReset'), name: 'A' }, { ...block('wait'), seconds: num(0.03) }, { ...block('timerReset'), name: 'B' },
    { ...block('variable'), name: '差值', value: op('-', { kind: 'timer', name: 'A' }, { kind: 'timer', name: 'B' }) }];
  const r = start(manager, p); await r.done; assert.equal(r.state.status, 'completed'); assert.ok(r.variables['差值'] >= 0.025);
  const loop = emptyProgram(); loop.blocks = [block('forever')]; const running = start(manager, loop); await delay(30); await manager.stop(running.state.id); assert.equal(running.state.status, 'stopped');
});

test('invalid numeric, list, text and loop operations fail with shutdown; invalid structure rejects before writes', async (t) => {
  const { manager, a } = setup(t, 1);
  for (const value of [{ kind: 'unary', op: 'sqrt', value: num(-1) }, { kind: 'listItem', name: '空', index: num(0) }, { kind: 'map', value: num(2), fromMin: num(1), fromMax: num(1), toMin: num(0), toMax: num(1) }]) {
    const p = emptyProgram(); p.blocks = [{ ...block('variable'), value }]; const r = start(manager, p); await r.done; assert.equal(r.state.status, 'failed'); assert.deepEqual(a.writes.at(-1), ['output', false]);
  }
  const p = emptyProgram(); p.blocks = [block('break')]; assert.throws(() => start(manager, p), /循环内部/);
  p.blocks = [{ ...block('single'), value: { kind: 'text', value: '5' } }]; assert.throws(() => start(manager, p), /数值槽位/);
  p.blocks = [{ ...block('for'), step: num(0) }]; const zero = start(manager, p); await zero.done; assert.equal(zero.state.status, 'failed'); assert.match(zero.state.error, /不能为零/);
});

test('pure computation programs need no hardware, and zero-count repeats perform no actions', async () => {
  const manager = new ProgramManager(new Map()), p = emptyProgram(); p.devices = [];
  p.blocks = [{ ...block('until'), condition: num(1), hold: num(0), timeout: num(1) }, { ...block('repeat'), count: num(0), body: [{ ...block('variable'), name: '不执行' }] },
    { ...block('for'), name: 'n', from: num(1), to: num(4), step: num(1), body: [{ ...block('listAppend'), value: exprVar('n') }] },
    { ...block('logText'), value: { kind: 'join', left: { kind: 'text', value: '平均=' }, right: { kind: 'listStat', name: '数据', op: 'mean' } } }];
  const s = manager.start(p, {}, {}), r = manager.runs.get(s.id); await r.done;
  assert.equal(r.state.status, 'completed', r.state.error); assert.equal(r.variables['不执行'], undefined); assert.deepEqual(r.lists.get('数据'), [1, 2, 3, 4]);
  assert.ok(r.state.logs.some(l => l.message === '平均=2.5'));
  p.blocks.push(block('output')); assert.throws(() => manager.start(p, {}, {}), /未定义的设备/);
});
