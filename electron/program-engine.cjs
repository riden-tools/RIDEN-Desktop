'use strict';
const { EventEmitter } = require('node:events');
const { randomUUID } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const MAX_SECONDS = 86400;
class LoopSignal extends Error { constructor(kind) { super(kind); this.kind = kind; } }
const finite = (x, label) => {
  if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`${label}必须是有限数值`);
  return x;
};
const range = (x, min, max, label) => {
  finite(x, label);
  if (x < min || x > max) throw new Error(`${label}应为 ${min}–${max}`);
  return x;
};
const { validateProgram } = require('./program-validation.cjs');

// All samples remain owned by Device/Core. The interpreter polls memory, never the RTU bus.
class ProgramRun extends EventEmitter {
  constructor(program, bindings, parameters, devices) {
    super();
    this.program = validateProgram(program);
    this.bindings = structuredClone(bindings || {});
    this.parameters = Object.create(null);
    this.devices = new Map();
    for (const slot of this.program.devices) {
      const d = devices.get(this.bindings[slot.key]);
      if (!d) throw new Error(`请为「${slot.label}」选择设备`);
      if ([...this.devices.values()].includes(d)) throw new Error('每个设备角色必须绑定不同设备');
      if (d.info.daemonPort && [...this.devices.values()].some((other) => other.info.daemonPort === d.info.daemonPort)) throw new Error('多个设备角色连接到同一个 Core 服务，请选择不同的物理设备');
      this.devices.set(slot.key, d);
    }
    for (const p of this.program.parameters) this.parameters[p.key] = range(parameters?.[p.key], p.min, p.max, p.label);
    this.variables = Object.create(null);
    this.lists = new Map();
    this.timers = new Map();
    this.procedures = new Map((this.program.procedures || []).map((p) => [p.name, p]));
    this.targets = new Map();
    this.controller = new AbortController();
    this.queues = new Map();
    this.expectedOn = new Map();
    this.state = { id: randomUUID(), programId: program.id, name: program.name, status: 'running', startedAt: Date.now(),
      endedAt: null, bindings: this.bindings, active: [], variables: {}, lists: {}, logs: [], pending: null, progress: {}, error: '', unconfirmed: [] };
    this.started = performance.now();
    this.check();
  }
  snapshot() { return structuredClone(this.state); }
  update(force = false) {
    const now = performance.now();
    if (!force && this.lastUpdate && now - this.lastUpdate < 50) return;
    this.lastUpdate = now;
    this.state.variables = { ...this.variables };
    this.state.lists = Object.fromEntries([...this.lists].map(([name, values]) => [name, { length: values.length, tail: values.slice(-8) }]));
    this.emit('update', this.snapshot());
  }
  log(message, level = 'info') {
    this.state.logs.push({ t: Date.now(), message, level });
    if (this.state.logs.length > 300) this.state.logs.shift();
    this.update(true);
  }
  check() {
    if (this.controller.signal.aborted) throw this.controller.signal.reason;
    if (performance.now() - this.started > this.program.maxSeconds * 1000) throw new Error('超过程序最长运行时间');
    for (const [slot, d] of this.devices) {
      if (d.info.status !== 'online' || !d.info.writable || !d.live || !d.lastSampleAt || Date.now() - d.lastSampleAt > 1500) throw new Error(`「${d.config.name}」已离线、只读或数据超过 1.5 s 未更新`);
      if (d.live.protect) throw new Error(`「${d.config.name}」触发 ${d.live.protect}`);
      const expected = this.expectedOn.get(slot);
      if (expected && Date.now() - expected > 1500 && !d.live.output) throw new Error(`「${d.config.name}」输出意外关闭`);
    }
  }
  value(e) {
    this.check();
    let result;
    switch (e.kind) {
      case 'number': result = e.value; break;
      case 'param': result = this.parameters[e.name]; break;
      case 'variable': result = this.variables[e.name]; break;
      case 'constant': result = e.name === 'pi' ? Math.PI : Math.E; break;
      case 'timer': result = (performance.now() - (this.timers.get(e.name) ?? this.started)) / 1000; break;
      case 'limit': {
        const d = this.devices.get(e.device);
        result = ['ovp', 'ocp'].includes(e.field) ? d.info.protection?.[e.field] : d.info[e.field]; break;
      }
      case 'state': {
        const d = this.devices.get(e.device);
        result = +(e.field === 'output' ? d.live.output : e.field === 'cc' ? d.live.output && d.live.cc : d.live.output && !d.live.cc); break;
      }
      case 'telemetry': {
        const d = this.devices.get(e.device);
        result = e.field === 'elapsed' ? (performance.now() - this.started) / 1000 :
          ['ah', 'wh'].includes(e.field) ? d.stats[e.field] : d.live[e.field];
        if (typeof result === 'boolean') result = Number(result);
        break;
      }
      case 'binary': {
        const a = this.value(e.left);
        // Boolean short-circuiting permits guarded expressions.
        if (e.op === 'and' && !a) return 0;
        if (e.op === 'or' && a) return 1;
        const b = this.value(e.right);
        switch (e.op) {
          case '+': result = a + b; break; case '-': result = a - b; break;
          case '*': result = a * b; break; case '/': result = a / b; break;
          case '%': result = a % b; break; case '**': result = a ** b; break;
          case 'min': result = Math.min(a, b); break; case 'max': result = Math.max(a, b); break;
          case '<': result = +(a < b); break; case '<=': result = +(a <= b); break;
          case '>': result = +(a > b); break; case '>=': result = +(a >= b); break;
          case '==': result = +(a === b); break; case '!=': result = +(a !== b); break;
          case 'and': result = +!!b; break; case 'or': result = +!!b; break;
          case 'xor': result = +(!!a !== !!b); break;
        }
        break;
      }
      case 'unary': {
        const x = this.value(e.value);
        const fn = { neg: (n) => -n, abs: Math.abs, sqrt: Math.sqrt, square: (n) => n * n, floor: Math.floor,
          ceil: Math.ceil, round: Math.round, ln: Math.log, log10: Math.log10, exp: Math.exp,
          sin: (n) => Math.sin(n * Math.PI / 180), cos: (n) => Math.cos(n * Math.PI / 180), tan: (n) => Math.tan(n * Math.PI / 180) };
        result = fn[e.op](x); break;
      }
      case 'not': result = +!this.value(e.value); break;
      case 'clamp': case 'between': {
        const x = this.value(e.value), lo = this.value(e.min), hi = this.value(e.max);
        if (lo > hi) throw new Error('区间下限不能大于上限');
        result = e.kind === 'clamp' ? Math.min(hi, Math.max(lo, x)) : +(x >= lo && x <= hi); break;
      }
      case 'map': {
        const x = this.value(e.value), a = this.value(e.fromMin), b = this.value(e.fromMax), c = this.value(e.toMin), d = this.value(e.toMax);
        if (a === b) throw new Error('映射的原始区间不能为零');
        result = c + (x - a) / (b - a) * (d - c); break;
      }
      case 'random': {
        let lo = this.value(e.min), hi = this.value(e.max);
        if (e.integer) { lo = Math.ceil(lo); hi = Math.floor(hi); }
        if (lo > hi) throw new Error('随机数区间无效');
        if (e.integer && (!Number.isSafeInteger(lo) || !Number.isSafeInteger(hi))) throw new Error('随机整数超出安全范围');
        result = e.integer ? lo + Math.floor(Math.random() * (hi - lo + 1)) : lo + Math.random() * (hi - lo); break;
      }
      case 'approx': {
        const a = this.value(e.left), b = this.value(e.right), tolerance = this.value(e.tolerance);
        if (tolerance < 0) throw new Error('允许误差不能为负数');
        result = +(Math.abs(a - b) <= tolerance); break;
      }
      case 'choose': result = this.value(this.value(e.condition) ? e.then : e.else); break;
      case 'listItem': {
        const list = this.lists.get(e.name) || [];
        const index = this.index(e.index, list.length); result = list[index]; break;
      }
      case 'listStat': {
        const list = this.lists.get(e.name) || [];
        if (e.op === 'length') result = list.length;
        else if (e.op === 'sum') result = list.reduce((sum, n) => sum + n, 0);
        else {
          if (!list.length) throw new Error(`列表「${e.name}」为空，无法计算 ${e.op}`);
          if (e.op === 'mean') result = list.reduce((sum, n) => sum + n, 0) / list.length;
          if (e.op === 'min') result = Math.min(...list);
          if (e.op === 'max') result = Math.max(...list);
          if (e.op === 'last') result = list.at(-1);
        }
        break;
      }
    }
    return finite(result, `表达式（${e.name || e.field || e.op || e.kind}）`);
  }
  text(e) {
    this.check();
    let result;
    if (e.kind === 'text') result = e.value;
    else if (e.kind === 'join') result = this.text(e.left) + this.text(e.right);
    else if (e.kind === 'format') {
      const digits = range(this.value(e.digits), 0, 8, '小数位数');
      if (!Number.isInteger(digits)) throw new Error('小数位数必须是整数');
      result = this.value(e.value).toFixed(digits);
    } else result = String(this.value(e));
    if (result.length > 1000) throw new Error('拼接文字超过 1000 个字符');
    return result;
  }
  index(e, length) {
    const index = range(this.value(e), 1, length, '列表索引');
    if (!Number.isInteger(index)) throw new Error('列表索引必须是整数（从 1 开始）');
    return index - 1;
  }
  async sleep(ms) {
    this.check();
    const signal = this.controller.signal;
    await new Promise((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(signal.reason); };
      const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
      signal.addEventListener('abort', abort, { once: true });
    });
    this.check();
  }
  // Serialize compound actions per device; unrelated devices execute concurrently.
  action(slot, fn) {
    const next = (this.queues.get(slot) || Promise.resolve()).catch(() => {}).then(async () => {
      this.check();
      const d = this.devices.get(slot);
      const result = await fn(d);
      this.check();
      return result;
    });
    this.queues.set(slot, next);
    return next;
  }
  async blocks(list, context = { callDepth: 0 }) {
    for (const b of list) {
      this.check();
      this.state.active.push(b.id);
      this.update();
      try { await this.block(b, context); }
      finally { this.state.active = this.state.active.filter((x) => x !== b.id); this.update(); }
      await this.sleep(0); // Yield even for variable-only loops; do not starve cancellation/UI.
    }
  }
  async loopBody(body, context) {
    let keep = true;
    try { await this.blocks(body, context); }
    catch (e) { if (!(e instanceof LoopSignal)) throw e; keep = e.kind !== 'break'; }
    await this.sleep(0); // Empty and continue-only loops must also yield to the watchdog.
    return keep;
  }
  target(slot, field) {
    const value = this.targets.get(slot)?.[field];
    return value ?? this.devices.get(slot).live[field === 'voltage' ? 'setV' : 'setI'];
  }
  remember(slot, field, value) {
    const info = this.devices.get(slot).info, scale = field === 'voltage' ? info.vScale : info.iScale;
    const actual = Number.isFinite(scale) && scale > 0 ? Math.round(value * scale) / scale : value;
    this.targets.set(slot, { ...this.targets.get(slot), [field]: actual });
  }
  async block(b, context) {
    switch (b.type) {
      case 'set': {
        const v = this.value(b.voltage), i = this.value(b.current);
        const d = this.devices.get(b.device);
        range(v, 0, d.info.vMax, '设定电压'); range(i, 0, d.info.iMax, '限流');
        await this.action(b.device, async (dev) => { await dev.setCurrent(i); this.check(); await dev.setVoltage(v); });
        this.remember(b.device, 'voltage', v); this.remember(b.device, 'current', i);
        this.log(`${d.config.name}：设定 ${v.toFixed(3)} V / ${i.toFixed(3)} A`); break;
      }
      case 'single': case 'adjust': {
        const d = this.devices.get(b.device);
        const value = this.value(b.value) + (b.type === 'adjust' ? this.target(b.device, b.field) : 0);
        range(value, 0, b.field === 'voltage' ? d.info.vMax : d.info.iMax, '设定值');
        await this.action(b.device, (dev) => b.field === 'voltage' ? dev.setVoltage(value) : dev.setCurrent(value));
        this.remember(b.device, b.field, value); break;
      }
      case 'recall': {
        const slot = range(this.value(b.slot), 1, 9, '数据组');
        if (!Number.isInteger(slot)) throw new Error('数据组编号必须是整数');
        await this.action(b.device, (d) => d.recallPreset(slot));
        const preset = this.devices.get(b.device).info.presets[slot];
        this.remember(b.device, 'voltage', preset.v); this.remember(b.device, 'current', preset.i); break;
      }
      case 'savePreset': {
        const slot = range(this.value(b.slot), 1, 9, '数据组');
        if (!Number.isInteger(slot)) throw new Error('数据组编号必须是整数');
        const args = [slot, this.value(b.voltage), this.value(b.current), this.value(b.ovp), this.value(b.ocp)];
        await this.action(b.device, (d) => d.savePreset(...args)); break;
      }
      case 'backlight': { const level = this.value(b.value); await this.action(b.device, (d) => d.setBacklight(level)); break; }
      case 'resetStats': await this.action(b.device, (d) => d.resetStats()); break;
      case 'readBattery': {
        const reading = await this.action(b.device, (d) => d.readBattery());
        this.variables[b.name] = finite(reading.voltage, '电池电压'); this.update(); break;
      }
      case 'output':
        await this.action(b.device, async (d) => {
          if (!b.on) this.expectedOn.delete(b.device);
          await d.setOutput(b.on);
          if (b.on) this.expectedOn.set(b.device, Date.now());
        });
        this.log(`${this.devices.get(b.device).config.name}：输出${b.on ? '开启' : '关闭'}`); break;
      case 'protection': {
        const ovp = this.value(b.ovp), ocp = this.value(b.ocp);
        await this.action(b.device, (d) => d.setProtection(ovp, ocp));
        this.log(`${this.devices.get(b.device).config.name}：保护 ${ovp.toFixed(3)} V / ${ocp.toFixed(3)} A（同时更新 M0）`); break;
      }
      case 'ramp': {
        const d = this.devices.get(b.device);
        const voltage = b.field === 'voltage';
        const to = range(this.value(b.to), 0, voltage ? d.info.vMax : d.info.iMax, '渐变目标');
        const seconds = range(this.value(b.seconds), 0.2, MAX_SECONDS, '渐变秒数');
        const from = this.target(b.device, b.field);
        const start = performance.now();
        while (true) {
          const f = Math.min(1, (performance.now() - start) / (seconds * 1000));
          await this.action(b.device, (dev) => voltage ? dev.setVoltage(from + (to - from) * f) : dev.setCurrent(from + (to - from) * f));
          this.remember(b.device, b.field, from + (to - from) * f);
          if (f === 1) break;
          await this.sleep(200);
        }
        break;
      }
      case 'wait': {
        const deadline = performance.now() + range(this.value(b.seconds), 0, MAX_SECONDS, '等待秒数') * 1000;
        while (performance.now() < deadline) await this.sleep(Math.min(100, deadline - performance.now()));
        break;
      }
      case 'until': {
        const hold = range(this.value(b.hold), 0, MAX_SECONDS, '连续成立秒数');
        const timeout = range(this.value(b.timeout), 0.1, MAX_SECONDS, '条件超时秒数');
        const start = performance.now();
        let since = null, signature = '';
        while (true) {
          this.check();
          const now = performance.now();
          if (now - start >= timeout * 1000) throw new Error('等待条件超时');
          const next = [...this.devices.values()].map((d) => `${d.live.seq}:${d.lastSampleAt}`).join('|');
          const fresh = !this.devices.size || next !== signature;
          signature = next;
          if (!this.value(b.condition)) since = null;
          else if (since === null) since = now;
          this.state.progress[b.id] = { held: since === null ? 0 : (now - since) / 1000, hold, elapsed: (now - start) / 1000, timeout };
          this.update();
          if (since !== null && now - since > hold * 1000 && fresh) { this.log(`条件连续成立超过 ${hold} s`); break; }
          await this.sleep(100);
        }
        break;
      }
      case 'if': await this.blocks(this.value(b.condition) ? b.then : b.else, context); break;
      case 'repeat': {
        const count = range(this.value(b.count), 0, 100000, '重复次数上限');
        if (!Number.isInteger(count)) throw new Error('重复次数必须是整数');
        for (let i = 0; i < count && (!b.condition || this.value(b.condition)); i++) if (!await this.loopBody(b.body, context)) break;
        break;
      }
      case 'for': {
        const from = this.value(b.from), to = this.value(b.to), step = this.value(b.step);
        if (step === 0) throw new Error('计数循环步长不能为零');
        const count = Math.floor((to - from) / step + 1e-10) + 1;
        if (!Number.isFinite(count) || count > 100000) throw new Error('计数循环不能超过 100000 次');
        for (let i = 0; i < Math.max(0, count); i++) {
          this.variables[b.name] = finite(from + i * step, '循环变量'); this.update();
          if (!await this.loopBody(b.body, context)) break;
        }
        break;
      }
      case 'forever': case 'repeatUntil': {
        while (b.type === 'forever' || !this.value(b.condition)) if (!await this.loopBody(b.body, context)) break;
        break;
      }
      case 'break': case 'continue': throw new LoopSignal(b.type);
      case 'assert': if (!this.value(b.condition)) throw new Error(b.message || '检查条件不成立'); break;
      case 'call':
        if (context.callDepth >= 32) throw new Error('自定义积木调用层数过深');
        await this.blocks(this.procedures.get(b.name).body, { ...context, callDepth: context.callDepth + 1 }); break;
      case 'parallel': {
        const results = await Promise.allSettled(b.branches.map(async (a) => {
          try { await this.blocks(a, { ...context }); }
          catch (e) { this.abort(e); throw e; }
        }));
        const failed = results.find((r) => r.status === 'rejected');
        if (failed) throw failed.reason;
        break;
      }
      case 'variable': this.variables[b.name] = this.value(b.value); this.update(); break;
      case 'change': this.variables[b.name] = finite((this.variables[b.name] ?? 0) + this.value(b.value), '变量增量'); this.update(); break;
      case 'timerReset': this.timers.set(b.name, performance.now()); break;
      case 'listClear': this.lists.set(b.name, []); this.update(); break;
      case 'listAppend': {
        const list = this.lists.get(b.name) || [];
        if (list.length >= 10000) throw new Error('每个列表最多 10000 项');
        list.push(this.value(b.value)); this.lists.set(b.name, list); this.update(); break;
      }
      case 'listSet': case 'listDelete': {
        const list = this.lists.get(b.name) || [], index = this.index(b.index, list.length);
        if (b.type === 'listSet') list[index] = this.value(b.value); else list.splice(index, 1);
        this.update(); break;
      }
      case 'log': this.log(`${b.message}${b.value ? `：${this.value(b.value)}` : ''}`); break;
      case 'logText': this.log(this.text(b.value)); break;
      case 'battery': await this.battery(b); break;
      case 'stop': this.abort(Object.assign(new Error(b.message || '程序完成'), { completed: true })); this.check();
    }
  }
  async battery(b) {
    const next = (this.batteryQueue || Promise.resolve()).then(() => { this.check(); return this.detectBattery(b); });
    this.batteryQueue = next;
    return next;
  }
  async detectBattery(b) {
    const d = this.devices.get(b.device);
    await this.action(b.device, (dev) => dev.verifyOutputOff());
    const offDeadline = performance.now() + 1500;
    while (d.live.output && performance.now() < offDeadline) await this.sleep(100);
    if (d.live.output) throw new Error('识别电池前请先关闭输出');
    const voltages = [];
    let source;
    for (let i = 0; i < 3; i++) {
      const reading = await this.action(b.device, (dev) => dev.readBattery({ source, requireOutputOff: true }));
      source ||= reading.source || 'HR33';
      voltages.push(reading.voltage);
      await this.sleep(200);
    }
    if (Math.max(...voltages) - Math.min(...voltages) > 0.1) throw new Error('电池电压不稳定，请检查连接');
    const voltage = voltages.reduce((a, x) => a + x, 0) / voltages.length;
    const candidates = [];
    for (let n = 1; n <= Math.floor(d.info.vMax / 4.2); n++) {
      if (voltage / n >= 3 && voltage / n <= 4.25 && n * 4.25 <= d.info.ovpMax) candidates.push(n);
    }
    if (!candidates.length) throw new Error(`电池电压 ${voltage.toFixed(2)} V 无有效串数；仅支持每串 3.0–4.25 V 的普通 4.2 V 锂电池`);
    const chargeCurrent = this.parameters.chargeCurrent;
    if (chargeCurrent !== undefined && (chargeCurrent > d.info.iMax || Math.round(chargeCurrent * 1.1 * d.info.iScale) > Math.round(d.info.ocpMax * d.info.iScale))) throw new Error('充电限流及 1.1 倍 OCP 超出设备量程，请减小限流');
    const request = { id: randomUUID(), block: b.id, device: b.device, name: d.config.name, voltage, source, candidates, suggested: candidates[0], current: chargeCurrent ?? null };
    this.state.pending = request;
    this.state.status = 'confirming';
    this.log(`电池 ${voltage.toFixed(2)} V（${source === 'HR10' ? 'HR10 输出关闭时端电压' : 'HR33 电池电压'}），候选串数 ${candidates.join(' / ')}；等待确认`);
    let answer;
    try {
      while (!this.batteryAnswer) await this.sleep(100);
      answer = this.batteryAnswer;
    } finally {
      this.batteryAnswer = null;
      this.state.pending = null;
      this.state.status = 'running';
      this.update();
    }
    const fresh = await this.action(b.device, (dev) => dev.readBattery({ source, requireOutputOff: true }));
    if (d.live.output || Math.abs(fresh.voltage - voltage) > 0.1) throw new Error('确认期间电池电压或输出状态改变，请重新启动');
    this.variables[b.name] = answer.cells;
    this.log(`已确认 ${answer.cells} 串，目标 ${(answer.cells * 4.2).toFixed(2)} V`);
  }
  confirm(requestId, cells) {
    const p = this.state.pending;
    if (!p || p.id !== requestId || !p.candidates.includes(cells)) throw new Error('电池确认已失效或串数无效');
    this.check();
    this.batteryAnswer = { cells };
  }
  abort(error) { if (!this.controller.signal.aborted) this.controller.abort(error); }
  async execute() {
    const watchdog = setInterval(() => { try { this.check(); } catch (e) { this.abort(e); } }, 100);
    let failure;
    this.log('程序启动；结束或停止时关闭全部绑定设备输出');
    try { await this.blocks(this.program.blocks); }
    catch (e) { failure = e; this.abort(e); }
    finally {
      clearInterval(watchdog);
      this.state.status = 'stopping'; this.state.pending = null; this.update(true);
      await Promise.allSettled([...this.queues.values()]);
      const entries = [...this.devices.values()];
      const stopped = await Promise.allSettled(entries.map(async (d) => {
        await d.setOutput(false);
        // Fresh register read verifies the shutdown; write acknowledgement alone is insufficient.
        await d.verifyOutputOff();
      }));
      this.state.unconfirmed = stopped.flatMap((r, i) => r.status === 'rejected' ? [entries[i].config.id] : []);
      this.state.status = this.state.unconfirmed.length ? 'failed' : !failure || failure.completed ? 'completed' : failure.stopped ? 'stopped' : 'failed';
      this.state.error = this.state.unconfirmed.length ? `${failure && !failure.completed ? failure.message + '；' : ''}无法确认 ${this.state.unconfirmed.length} 台设备已关闭输出，请在设备上检查` : failure && !failure.completed && !failure.stopped ? failure.message : '';
      this.state.endedAt = Date.now(); this.state.active = [];
      this.log(this.state.error || failure?.message || '程序完成', this.state.status === 'failed' ? 'error' : 'info');
    }
    return this.snapshot();
  }
}
class ProgramManager extends EventEmitter {
  constructor(devices) { super(); this.devices = devices; this.runs = new Map(); this.locks = new Map(); }
  list() { return [...this.runs.values()].map((r) => r.snapshot()).reverse(); }
  owner(id) {
    if (this.locks.has(id)) return this.locks.get(id);
    const port = this.devices.get(id)?.info.daemonPort;
    if (port) for (const [locked, run] of this.locks) if (this.devices.get(locked)?.info.daemonPort === port) return run;
    return null;
  }
  assertFree(id) { if (this.owner(id)) throw new Error('设备正由程序控制，请先停止程序'); }
  start(program, bindings, parameters) {
    if ([...this.runs.values()].some((r) => r.program.id === program.id && !r.state.endedAt)) throw new Error('该程序已在运行');
    const r = new ProgramRun(program, bindings, parameters, this.devices);
    for (const d of r.devices.values()) this.assertFree(d.config.id);
    for (const d of r.devices.values()) this.locks.set(d.config.id, r.state.id);
    this.runs.set(r.state.id, r);
    r.on('update', (s) => this.emit('update', s));
    r.done = r.execute().finally(() => {
      for (const d of r.devices.values()) this.locks.delete(d.config.id);
      // A lock can only be released after all final off commands have completed.
      this.emit('update', r.snapshot());
      const old = [...this.runs.values()].filter((x) => x.state.endedAt);
      for (const x of old.slice(0, Math.max(0, old.length - 20))) this.runs.delete(x.state.id);
    });
    return r.snapshot();
  }
  async stop(id) {
    const r = this.runs.get(id);
    if (!r) throw new Error('运行不存在');
    if (!r.state.endedAt) r.abort(Object.assign(new Error('用户停止程序'), { stopped: true }));
    return r.done;
  }
  async stopAll() { return Promise.all([...this.runs.values()].filter((r) => !r.state.endedAt).map((r) => this.stop(r.state.id))); }
  confirm(id, requestId, cells) {
    const r = this.runs.get(id);
    if (!r || r.state.endedAt) throw new Error('程序已结束');
    r.confirm(requestId, cells);
  }
}
module.exports = { validateProgram, ProgramRun, ProgramManager };
