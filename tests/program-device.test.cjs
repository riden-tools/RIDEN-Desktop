'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const path = require('node:path');
const { Device } = require('../electron/device.cjs');
const { ProgramManager } = require('../electron/program-engine.cjs');
const { chargingProgram, emptyProgram, block, num } = require('../electron/program-schema.cjs');
async function waitFor(fn, ms = 15000) { const deadline = Date.now() + ms; while (!fn()) { if (Date.now() > deadline) throw new Error('serial integration timed out'); await new Promise((r) => setTimeout(r, 20)); } }
async function device(t, id, battery) {
  const args = ['scripts/mock-device.py', ...(battery ? ['--battery', String(battery), '--taper-seconds', '0.3'] : [])];
  const mock = spawn('python3', args, { cwd: path.resolve(__dirname, '..') }); t.after(() => mock.kill());
  const [chunk] = await once(mock.stdout, 'data');
  const d = new Device({ id, name: id, kind: 'serial', path: chunk.toString().trim(), baud: 115200, address: 1, periodMs: 50, readonly: false }, process.env.RIDEN_CORED || path.resolve(__dirname, '../core/build/riden-cored'));
  t.after(() => d.stop()); d.start(); await waitFor(() => d.info.presets.length === 10 && d.info.writable && d.info.status === 'online');
  return d;
}
test('charge graph executes through real Core and PTY, confirms HR33, writes live protection and verifies shutdown', async (t) => {
  const d = await device(t, 'battery', 7.4);
  const manager = new ProgramManager(new Map([[d.config.id, d]]));
  const p = chargingProgram(); p.blocks.find((b) => b.type === 'wait').seconds = num(0.1); p.blocks.find((b) => b.type === 'until').hold = num(0.3);
  const s = manager.start(p, { supply: d.config.id }, { chargeCurrent: 0.5 });
  const run = manager.runs.get(s.id); t.after(() => manager.stopAll());
  await waitFor(() => run.state.pending || run.state.endedAt);
  assert.equal(run.state.status, 'confirming', run.state.error);
  assert.deepEqual(run.state.pending.candidates, [2]);
  manager.confirm(s.id, run.state.pending.id, 2);
  await run.done;
  assert.equal(run.state.status, 'completed', run.state.error);
  assert.equal(d.info.protection.ovp, 8.5); assert.equal(d.info.protection.ocp, 0.55);
  const r = await d.cmd.request({ cmd: 'read', start: 8, count: 11, max_age_ms: 0 });
  assert.equal(r.values[0], 840); assert.equal(r.values[1], 500); assert.equal(r.values[10], 0);
});

test('two Core instances execute one parallel program; stop disables both outputs', async (t) => {
  const a = await device(t, 'a'), b = await device(t, 'b');
  const manager = new ProgramManager(new Map([['a', a], ['b', b]])); t.after(() => manager.stopAll());
  const p = emptyProgram(); p.devices.push({ key: 'other', label: '设备 B' });
  const parallel = block('parallel');
  parallel.branches = [[{ ...block('set'), voltage: num(3.3), current: num(0.5) }, block('output'), { ...block('wait'), seconds: num(30) }], [{ ...block('set', 'other'), voltage: { kind: 'binary', op: '*', left: { kind: 'telemetry', device: 'supply', field: 'vin' }, right: num(0.25) }, current: num(1) }, block('output', 'other'), { ...block('wait'), seconds: num(30) }]];
  p.blocks = [parallel]; const s = manager.start(p, { supply: 'a', other: 'b' }, {}); const run = manager.runs.get(s.id);
  await waitFor(() => (a.live.output && b.live.output) || run.state.endedAt);
  assert.equal(run.state.endedAt, null, run.state.error);
  assert.equal(a.live.setV, 3.3); assert.equal(b.live.setV, 6);
  await manager.stop(s.id); assert.equal(run.state.status, 'stopped', run.state.error);
  await Promise.all([a.verifyOutputOff(), b.verifyOutputOff()]); assert.equal(manager.locks.size, 0);
});

test('independent setpoints, increments and saved-group blocks use the expected registers through Core', async (t) => {
  const d = await device(t, 'generic'); const manager = new ProgramManager(new Map([['generic', d]])); t.after(() => manager.stopAll());
  const writes = []; const request = d.cmd.request.bind(d.cmd); d.cmd.request = (r) => { if (r.cmd === 'write') writes.push([r.start, ...r.values]); return request(r); };
  const p = emptyProgram(); p.blocks = [
    { ...block('single'), field: 'voltage', value: num(3) },
    { ...block('adjust'), value: num(0.1) }, { ...block('adjust'), value: num(0.1) },
    { ...block('single'), field: 'current', value: num(0.5) },
    { ...block('savePreset'), slot: num(4), voltage: num(7.4), current: num(1), ovp: num(9), ocp: num(1.1) },
    { ...block('recall'), slot: num(4) }, { ...block('backlight'), value: num(2) }, block('resetStats'),
  ];
  const s = manager.start(p, { supply: 'generic' }, {}); const r = manager.runs.get(s.id); await r.done;
  assert.equal(r.state.status, 'completed', r.state.error);
  assert.deepEqual(writes.slice(0, 4), [[8, 300], [8, 310], [8, 320], [9, 500]], 'adjustments must accumulate even before fresh telemetry');
  assert.deepEqual(writes.slice(4, 8), [[96, 740], [97, 1000], [98, 900], [99, 1100]]);
  assert.ok(writes.some((w) => w[0] === 19 && w[1] === 4)); assert.ok(writes.some((w) => w[0] === 72 && w[1] === 2));
  assert.deepEqual(d.info.presets[4], { v: 7.4, i: 1, ovp: 9, ocp: 1.1 }); await d.verifyOutputOff();
});
