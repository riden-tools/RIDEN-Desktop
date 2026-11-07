'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { once } = require('node:events');
const { Device } = require('../electron/device.cjs');

async function waitFor(predicate) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('device state timed out');
}

test('live protection uses HR82/83 and group storage changes only on save', async (t) => {
  const mock = spawn('python3', ['scripts/mock-device.py'], { cwd: path.resolve(__dirname, '..') });
  t.after(() => mock.kill());
  const [chunk] = await once(mock.stdout, 'data');
  const device = new Device({
    id: 'test', kind: 'serial', path: chunk.toString().trim(), baud: 115200,
    address: 1, periodMs: 30, readonly: false,
  }, process.env.RIDEN_CORED || path.resolve(__dirname, '../core/build/riden-cored'));
  t.after(() => device.stop());
  device.start();
  await waitFor(() => device.info.presets.length === 10 && device.live?.activeSlot === 0);
  const writes = [];
  const request = device.cmd.request.bind(device.cmd);
  device.cmd.request = (r) => {
    if (r.cmd === 'write') writes.push([r.start, ...r.values]);
    return request(r);
  };

  for (const slot of [0, 10, -1, 1.5, '2', NaN]) {
    await assert.rejects(device.recallPreset(slot), /1–9/);
  }
  assert.deepEqual(writes, []);
  await device.recallPreset(2);
  await waitFor(() => device.live.activeSlot === 2 && device.live.setV === 7);
  assert.deepEqual(writes, [[19, 2]]);
  assert.equal(device.live.setI, 2);

  await device.setProtection(15, 3);
  assert.deepEqual(writes.slice(1), [[82, 1500], [83, 3000]]);
  assert.deepEqual(device.info.protection, { ovp: 15, ocp: 3 });
  assert.equal(device.info.presets[2].ovp, 62);
  assert.equal(device.info.presets[2].ocp, 6.2);
  assert.equal(device.info.presets[0].ovp, 15);
  assert.equal(device.info.presets[0].ocp, 3);
  assert.equal(device.live.activeSlot, 2);

  const beforeSave = writes.length;
  for (const invalid of [undefined, NaN, 6.3]) {
    await assert.rejects(device.savePreset(3, 7, 2, 15, invalid));
  }
  assert.equal(writes.length, beforeSave, 'invalid protection must not partially overwrite the group');
  await assert.rejects(device.savePreset(0, 7, 2, 15, 3), /1–9/);
  await device.savePreset(3, device.live.setV, device.live.setI,
    device.info.protection.ovp, device.info.protection.ocp);
  assert.deepEqual(writes.slice(beforeSave), [[92, 700], [93, 2000], [94, 1500], [95, 3000]]);
  assert.deepEqual(device.info.presets[3], { v: 7, i: 2, ovp: 15, ocp: 3 });
  assert.equal(device.live.activeSlot, 2, 'saving must not switch the active group');
  await device.recallPreset(3);
  await waitFor(() => device.live.activeSlot === 3);
  assert.equal(device.live.setV, 7);
  assert.equal(device.info.presets[3].ovp, 15);
  assert.equal(device.info.presets[3].ocp, 3);
  assert.deepEqual(device.info.protection, { ovp: 15, ocp: 3 });

  // Applying low live OVP cuts output without changing M3's stored protection or HR19.
  await device.setOutput(true);
  await waitFor(() => device.live.output);
  const beforeApply = writes.length;
  await device.setProtection(2, 1);
  await waitFor(() => !device.live.output && device.live.protect === 'OVP');
  assert.deepEqual(writes.slice(beforeApply), [[82, 200], [83, 1000]]);
  assert.equal(device.live.activeSlot, 3);
  assert.deepEqual(device.info.presets[3], { v: 7, i: 2, ovp: 15, ocp: 3 });
  assert.deepEqual(device.info.protection, { ovp: 2, ocp: 1 });
  await device.recallPreset(3);
  assert.deepEqual(device.info.protection, { ovp: 15, ocp: 3 });
  assert.equal(device.info.presets[0].ovp, 2, 'recall must not overwrite M0 storage');
  await device.setOutput(true);
  await waitFor(() => device.live.output);
  await device.setProtection(15, 0.1);
  await waitFor(() => !device.live.output && device.live.protect === 'OCP');
  assert.equal(device.info.presets[3].ocp, 3);

  await device.recallPreset(9);
  await waitFor(() => device.live.activeSlot === 9 && device.live.setV === 14);
  assert.deepEqual(writes.at(-1), [19, 9]);
  device.info.writable = false;
  await assert.rejects(device.recallPreset(1), /只读/);
  assert.deepEqual(writes.at(-1), [19, 9]);
});
