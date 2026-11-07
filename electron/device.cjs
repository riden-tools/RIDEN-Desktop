'use strict';
const fs = require('node:fs');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');
const { LineClient } = require('./line-client.cjs');

const ERRORS = {
  [-1]: '传输 I/O 错误',
  [-2]: '响应超时',
  [-3]: '协议错误',
  [-4]: 'CRC 校验错误',
  [-5]: '核心已关闭',
  [-6]: '数值越界或参数无效',
  [-7]: '请求队列已满',
  [-8]: '只读模式，写入被拒绝',
  [-9]: '型号或操作不受支持',
  [-10]: '内存不足',
  [-11]: '设备忙',
};
const errorText = (code) => ERRORS[code] || `错误 ${code}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RETRY_MS = 3000;
const STALE_MS = 1500;

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function explainSpawnFailure(path, log) {
  if (process.platform !== 'win32') {
    if (!fs.existsSync(path)) return `找不到串口 ${path}，请检查 USB 连接`;
    try {
      fs.accessSync(path, fs.constants.R_OK | fs.constants.W_OK);
    } catch {
      return `没有 ${path} 的读写权限，请将用户加入 dialout/uucp 组后重新登录`;
    }
    if (/Cannot open/.test(log)) return `${path} 已被其他程序占用`;
  } else if (/Cannot open/.test(log)) {
    return '无法打开串口，可能被其他程序占用或设备已拔出';
  }
  return log.trim().split('\n').pop() || '核心进程意外退出';
}

class Device extends EventEmitter {
  constructor(config, corePath) {
    super();
    this.config = config;
    this.corePath = corePath;
    this.stopped = false;
    this.proc = null;
    this.cmd = null;
    this.sub = null;
    this.retryTimer = null;
    this.staleTimer = null;
    this.timeOffset = null;
    this.lastSampleAt = 0;
    this.lastSampleMono = 0;
    this.rateWindow = [];
    this.raw = new Array(121).fill(null);
    this.stats = { since: Date.now(), wh: 0, ah: 0, onMs: 0 };
    this.info = {
      status: 'connecting',
      error: '',
      model: 0,
      modelName: '',
      firmware: '',
      serial: '',
      writable: false,
      vScale: 100,
      iScale: 1000,
      vMax: 0,
      iMax: 0,
      ovpMax: 0,
      ocpMax: 0,
      backlightWritable: false,
      backlight: null,
      presets: [],
      protection: null,
      known: false,
      custom: false,
      daemonPort: config.kind === 'remote' ? config.port : 0,
    };
    this.live = null;
  }

  state() {
    return { id: this.config.id, config: this.config, ...this.info, live: this.live, stats: this.stats };
  }

  #setInfo(patch) {
    Object.assign(this.info, patch);
    this.emit('state', this.state());
  }

  start() {
    this.stopped = false;
    this.#attempt();
  }

  async #attempt() {
    clearTimeout(this.retryTimer);
    if (this.stopped) return;
    this.#setInfo({ status: 'connecting', error: '' });
    try {
      const port = this.config.kind === 'remote' ? this.config.port : await this.#spawnCore();
      this.cmd = await LineClient.connect(port);
      this.sub = await LineClient.connect(port);
      // 型号在首个样本到达后读取能力表；重连时重新读取。
      this.timeOffset = null;
      this.lastSampleMono = 0;
      this.lastSampleAt = 0;
      this.connectedAt = Date.now();
      this.info.model = 0;
      this.info.protection = null;
      this.raw.fill(null);
      this.sub.on('message', (m) => m.type === 'snapshot' && this.#onSample(m));
      const lost = () => this.#lost('与核心服务的连接已断开');
      this.sub.on('close', lost);
      this.cmd.on('close', lost);
      this.sub.send({ cmd: 'subscribe' });
      this.staleTimer = setInterval(() => this.#checkStale(), 500);
    } catch (e) {
      this.#lost(e.message);
    }
  }

  async #spawnCore() {
    if (!this.corePath) throw new Error('找不到 riden-cored，请先构建 RIDEN-Core（npm run core:linux）');
    const port = await freePort();
    const c = this.config;
    const args = ['--device', c.path, '--port', String(port), '--baud', String(c.baud), '--address', String(c.address),
      '--mode', 'status', '--period-ms', String(c.periodMs)];
    if (!c.readonly) args.push('--allow-writes');
    const mp = c.modelProfile;
    if (mp) args.push('--model-profile', [mp.model, mp.vScale, mp.iScale, mp.vMax, mp.iMax, mp.ovpMax, mp.ocpMax].join(','));
    let log = '';
    const proc = spawn(this.corePath, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    this.proc = proc;
    this.info.daemonPort = port;
    proc.stderr.setEncoding('utf8');
    proc.stderr.on('data', (d) => {
      log = (log + d).slice(-4000);
    });
    const exited = new Promise((resolve) => {
      proc.once('exit', () => resolve());
      proc.once('error', (e) => {
        log += `\n${e.message}`;
        resolve();
      });
    });
    let started = false;
    proc.once('exit', () => {
      if (started && this.proc === proc) {
        this.proc = null;
        this.#lost(explainSpawnFailure(c.path, log));
      }
    });
    // daemon 打开串口后才监听端口；等待端口可连接或进程退出。
    for (let i = 0; i < 50; i++) {
      const ok = await Promise.race([
        new Promise((resolve) => {
          const s = net.connect({ host: '127.0.0.1', port }, () => {
            s.destroy();
            resolve(true);
          });
          s.on('error', () => resolve(false));
        }),
        exited.then(() => 'exit'),
      ]);
      if (ok === 'exit') throw new Error(explainSpawnFailure(c.path, log));
      if (ok === true) {
        started = true;
        return port;
      }
      await sleep(100);
    }
    throw new Error('核心进程启动超时');
  }

  #teardown() {
    clearInterval(this.staleTimer);
    this.staleTimer = null;
    for (const c of [this.sub, this.cmd]) c?.removeAllListeners('close').close();
    this.sub = this.cmd = null;
    const proc = this.proc;
    this.proc = null;
    if (proc && proc.exitCode === null) {
      proc.kill('SIGTERM');
      const t = setTimeout(() => proc.kill('SIGKILL'), 3000);
      proc.once('exit', () => clearTimeout(t));
    }
    return proc;
  }

  #lost(message) {
    if (this.stopped) return;
    this.#teardown();
    this.live = null;
    this.#setInfo({ status: 'error', error: message, retryAt: Date.now() + RETRY_MS });
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.#attempt(), RETRY_MS);
  }

  reconnect() {
    if (this.stopped) return;
    this.#teardown();
    this.#attempt();
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    const proc = this.#teardown();
    if (proc && proc.exitCode === null) await new Promise((r) => proc.once('exit', r));
  }

  // ---------- 采样 ----------
  #onSample(m) {
    m.registers.forEach((v, i) => {
      if (v !== null) this.raw[i] = v;
    });
    const raw = this.raw;
    if (raw[10] === null || raw[11] === null) return;
    if (raw[0] !== null && raw[0] !== this.info.model) {
      this.info.model = raw[0];
      this.info.firmware = raw[3] !== null ? (raw[3] / 100).toFixed(2) : '';
      this.info.serial = raw[1] !== null && raw[2] !== null ? String(raw[1] * 65536 + raw[2]).padStart(8, '0') : '';
      this.#loadInfo().catch((e) => this.emit('log', `读取设备信息失败: ${e.message}`));
    }
    const mono = m.completed_ns / 1e6;
    if (this.timeOffset === null || Math.abs(mono + this.timeOffset - Date.now()) > 5000) this.timeOffset = Date.now() - mono;
    const t = mono + this.timeOffset;
    const { vScale, iScale } = this.info;
    const v = raw[10] / vScale;
    const i = raw[11] / iScale;
    // HR12/13 为 0.01 W 的 32 位功率；个别型号缩放不同，与 V×I 偏差较大时改用乘积。
    const pCalc = v * i;
    const pReg = raw[12] !== null && raw[13] !== null ? (raw[12] * 65536 + raw[13]) / 100 : NaN;
    const p = Math.abs(pReg - pCalc) <= Math.max(0.05, pCalc * 0.1) ? pReg : pCalc;
    const output = raw[18] === 1;

    if (this.lastSampleMono) {
      const dt = Math.min(mono - this.lastSampleMono, 2000);
      if (dt > 0) {
        this.stats.wh += (p * dt) / 3.6e6;
        this.stats.ah += (i * dt) / 3.6e6;
        if (output) this.stats.onMs += dt;
      }
    }
    this.lastSampleMono = mono;
    this.lastSampleAt = Date.now();
    this.rateWindow.push(mono);
    if (this.rateWindow.length > 20) this.rateWindow.shift();
    const span = this.rateWindow[this.rateWindow.length - 1] - this.rateWindow[0];
    const rate = span > 0 ? ((this.rateWindow.length - 1) * 1000) / span : 0;

    this.live = {
      t,
      seq: m.sequence,
      v,
      i,
      p,
      setV: raw[8] / vScale,
      setI: raw[9] / iScale,
      vin: raw[14] !== null ? raw[14] / 100 : null,
      temp: raw[5] !== null ? (raw[4] ? -raw[5] : raw[5]) : null,
      lock: raw[15] === 1,
      protect: raw[16] === 1 ? 'OVP' : raw[16] === 2 ? 'OCP' : raw[16] === 3 ? 'OTP' : '',
      cc: raw[17] === 1,
      output,
      activeSlot: Number.isInteger(raw[19]) && raw[19] <= 9 ? raw[19] : null,
      rate,
    };
    if (this.info.status !== 'online') this.#setInfo({ status: 'online', error: '' });
    this.emit('sample', { id: this.config.id, live: this.live, stats: this.stats });
  }

  async #checkStale() {
    const since = Date.now() - (this.lastSampleAt || this.connectedAt || Date.now());
    if (since < STALE_MS || this.info.status === 'stale') return;
    if (this.info.status === 'online' || since > 4000) {
      this.#setInfo({ status: 'stale', error: '设备无响应，请检查电源、波特率和从机地址' });
      try {
        const s = await this.cmd.request({ cmd: 'snapshot' });
        if (s.last_error) this.#setInfo({ error: `设备无响应：${errorText(s.last_error)}` });
      } catch {
        /* 连接已断开时由 close 事件处理 */
      }
    }
  }

  async #loadInfo() {
    const caps = await this.cmd.request({ cmd: 'registers' });
    if (!caps.ok) throw new Error(errorText(caps.error));
    const reg = caps.registers;
    const known = caps.model_name !== 'Unknown';
    const scale = (r, d) => r.scale || d;
    const custom = caps.model_name === 'Custom';
    this.#setInfo({
      modelName: custom ? `自定义 ${caps.model}` : known ? caps.model_name : `未知型号 ${caps.model}`,
      known,
      custom,
      writable: !!caps.writes_enabled && reg[8].writable,
      vScale: scale(reg[8], 100),
      iScale: scale(reg[9], 1000),
      vMax: reg[8].raw_max / scale(reg[8], 100),
      iMax: reg[9].raw_max / scale(reg[9], 1000),
      ovpMax: reg[82].raw_max / scale(reg[82], 100),
      ocpMax: reg[83].raw_max / scale(reg[83], 1000),
      backlightWritable: !!caps.writes_enabled && reg[72].writable,
    });
    await this.#readPresets();
    // 固件没有独立的即时保护回读；连接时以当前组的存储值初始化。
    const slot = this.raw[19];
    const preset = this.info.presets[slot];
    if (preset) this.#setInfo({ protection: { ovp: preset.ovp, ocp: preset.ocp } });
    const b = await this.cmd.request({ cmd: 'read', start: 72, count: 1, max_age_ms: 0 });
    if (b.ok) this.#setInfo({ backlight: b.values[0] });
  }

  async #readPresets() {
    const r = await this.cmd.request({ cmd: 'read', start: 80, count: 40, max_age_ms: 0 });
    if (!r.ok) throw new Error(errorText(r.error));
    const { vScale, iScale } = this.info;
    const presets = [];
    for (let k = 0; k < 10; k++) {
      const [v, i, ovp, ocp] = r.values.slice(k * 4, k * 4 + 4);
      presets.push({ v: v / vScale, i: i / iScale, ovp: ovp / vScale, ocp: ocp / iScale });
    }
    this.#setInfo({ presets });
  }

  // ---------- 写入 ----------
  async #write(start, values) {
    if (!this.cmd) throw new Error('设备未连接');
    if (!this.info.writable) throw new Error('当前为只读监控模式');
    const r = await this.cmd.request({ cmd: 'write', start, values });
    if (!r.ok) throw new Error(errorText(r.error));
  }

  #toRaw(value, scale, max, label) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) throw new Error(`${label}数值无效`);
    const raw = Math.round(n * scale);
    if (raw > Math.round(max * scale)) throw new Error(`${label}超出范围（最大 ${max}）`);
    return raw;
  }

  setVoltage(v) {
    return this.#write(8, [this.#toRaw(v, this.info.vScale, this.info.vMax, '电压')]);
  }

  setCurrent(i) {
    return this.#write(9, [this.#toRaw(i, this.info.iScale, this.info.iMax, '电流')]);
  }

  setOutput(on) {
    return this.#write(18, [on ? 1 : 0]);
  }

  async verifyOutputOff() {
    if (!this.cmd) throw new Error('设备未连接，无法确认输出关闭');
    const r = await this.cmd.request({ cmd: 'read', start: 18, count: 1, max_age_ms: 0 });
    if (!r.ok || r.values[0] !== 0) throw new Error('无法确认设备输出已关闭');
  }

  async readBattery({ source, requireOutputOff = false } = {}) {
    if (!this.cmd) throw new Error('设备未连接');
    const r = await this.cmd.request({ cmd: 'read', start: 32, count: 2, max_age_ms: 0 });
    if (!r.ok) throw new Error(errorText(r.error));
    // HR33 can remain zero with a battery connected across the output terminals,
    // even while HR10 correctly measures its voltage. Never use an energized
    // output as a fallback battery measurement. Read HR18 in the same fresh span.
    const useTerminals = source === 'HR10' || (!source && r.values[1] === 0);
    let terminal;
    if (useTerminals || requireOutputOff) {
      terminal = await this.cmd.request({ cmd: 'read', start: 10, count: 9, max_age_ms: 0 });
      if (!terminal.ok) throw new Error(errorText(terminal.error));
      if (terminal.values[8] !== 0 && (requireOutputOff || source === 'HR10')) throw new Error('读取电池端电压前请先关闭输出');
    }
    const fallback = useTerminals && terminal.values[8] === 0;
    return { mode: r.values[0], voltage: (fallback ? terminal.values[0] : r.values[1]) / this.info.vScale, source: fallback ? 'HR10' : 'HR33' };
  }

  // 部分固件在串口通信期间强制锁定面板：写入被确认但回读不变。
  async setLock(on) {
    await this.#write(15, [on ? 1 : 0]);
    const r = await this.cmd.request({ cmd: 'read', start: 15, count: 1, max_age_ms: 0 });
    if (r.ok && r.values[0] !== (on ? 1 : 0)) throw new Error('设备固件未接受：通信期间面板保持锁定');
  }

  async setBacklight(level) {
    const n = Number(level);
    if (!Number.isInteger(n) || n < 0 || n > 5) throw new Error('背光等级应为 0–5');
    await this.#write(72, [n]);
    this.#setInfo({ backlight: n });
  }

  async setProtection(ovp, ocp) {
    const rawOvp = this.#toRaw(ovp, this.info.vScale, this.info.ovpMax, 'OVP ');
    const rawOcp = this.#toRaw(ocp, this.info.iScale, this.info.ocpMax, 'OCP ');
    // HR82/83 更新即时保护，也会改变 M0 存储；M1–M9 只在显式保存时修改。
    await this.#write(82, [rawOvp]);
    await this.#write(83, [rawOcp]);
    await this.#readPresets();
    const actual = this.info.presets[0];
    this.#setInfo({ protection: { ovp: actual.ovp, ocp: actual.ocp } });
    if (Math.round(actual.ovp * this.info.vScale) !== rawOvp ||
        Math.round(actual.ocp * this.info.iScale) !== rawOcp) {
      throw new Error('保护值回读不一致，请重试');
    }
  }

  async savePreset(slot, v, i, ovp, ocp) {
    if (!Number.isInteger(slot) || slot < 1 || slot > 9) throw new Error('预设编号应为 1–9');
    // 先校验四项参数，避免后续字段无效时已经部分覆盖数据组。
    const values = [
      this.#toRaw(v, this.info.vScale, this.info.vMax, '电压'),
      this.#toRaw(i, this.info.iScale, this.info.iMax, '电流'),
      this.#toRaw(ovp, this.info.vScale, this.info.ovpMax, 'OVP '),
      this.#toRaw(ocp, this.info.iScale, this.info.ocpMax, 'OCP '),
    ];
    const base = 80 + slot * 4;
    for (let field = 0; field < values.length; field++) {
      await this.#write(base + field, [values[field]]);
    }
    await this.#readPresets();
    const saved = this.info.presets[slot];
    const actual = [saved.v * this.info.vScale, saved.i * this.info.iScale,
      saved.ovp * this.info.vScale, saved.ocp * this.info.iScale];
    if (actual.some((value, field) => Math.round(value) !== values[field])) {
      throw new Error('数据组保存回读不一致，请重试');
    }
  }

  async recallPreset(slot) {
    if (!Number.isInteger(slot) || slot < 1 || slot > 9) throw new Error('数据组编号应为 1–9');
    await this.#write(19, [slot]);
    await sleep(600);
    const r = await this.cmd.request({ cmd: 'read', start: 8, count: 12, max_age_ms: 0 });
    if (!r.ok) throw new Error(errorText(r.error));
    if (r.values[11] !== slot) throw new Error('设备未切换到指定数据组');
    await this.#readPresets();
    const preset = this.info.presets[slot];
    this.#setInfo({ protection: { ovp: preset.ovp, ocp: preset.ocp } });
  }

  resetStats() {
    this.stats = { since: Date.now(), wh: 0, ah: 0, onMs: 0 };
    this.emit('state', this.state());
  }

  rename(name) {
    this.config.name = name;
    this.emit('state', this.state());
  }
}

module.exports = { Device, errorText };
