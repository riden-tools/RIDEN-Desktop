'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { app, BrowserWindow, ipcMain, dialog, shell, Menu, nativeTheme } = require('electron');
const { Device } = require('./device.cjs');
const { listPorts } = require('./ports.cjs');
const { resolveCore } = require('./core-path.cjs');

const BAUDS = [9600, 19200, 38400, 57600, 115200];
const PERIODS = [0, 100, 200, 500, 1000];
const devices = new Map();
let win = null;
let corePath = null;
let quitting = false;

const configFile = () => path.join(app.getPath('userData'), 'devices.json');

function loadConfig() {
  try {
    const data = JSON.parse(fs.readFileSync(configFile(), 'utf8'));
    return Array.isArray(data.devices) ? data.devices : [];
  } catch {
    return [];
  }
}

function saveConfig() {
  const list = [...devices.values()].map((d) => d.config);
  fs.mkdirSync(path.dirname(configFile()), { recursive: true });
  fs.writeFileSync(configFile(), JSON.stringify({ devices: list }, null, 2));
}

const SCALES = [10, 100, 1000, 10000];

// 自定义型号参数：与 riden-cored --model-profile 的校验一致。
function validateProfile(p) {
  if (!p) return null;
  const model = Number(p.model);
  const vScale = Number(p.vScale);
  const iScale = Number(p.iScale);
  if (!Number.isInteger(model) || model < 1 || model > 65535) throw new Error('型号代码无效');
  if (!SCALES.includes(vScale) || !SCALES.includes(iScale)) throw new Error('精度无效');
  const out = { model, vScale, iScale };
  for (const [k, scale, label] of [['vMax', vScale, '最大电压'], ['iMax', iScale, '最大电流'], ['ovpMax', vScale, 'OVP 上限'], ['ocpMax', iScale, 'OCP 上限']]) {
    const v = Number(p[k]);
    if (!Number.isFinite(v) || v <= 0 || Math.round(v * scale) > 65535) throw new Error(`${label}超出该精度可表示的范围`);
    out[k] = Number(v.toFixed(Math.log10(scale)));
  }
  return out;
}

// 渲染进程传入的配置在这里校验，只保留已知字段。
function validateConfig(input) {
  if (!input || typeof input !== 'object') throw new Error('配置无效');
  const kind = input.kind === 'remote' ? 'remote' : 'serial';
  const name = String(input.name || '').trim().slice(0, 40);
  const c = { id: typeof input.id === 'string' && /^[\w-]{1,40}$/.test(input.id) ? input.id : crypto.randomUUID(), kind, name };
  if (kind === 'remote') {
    const port = Number(input.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('端口应为 1–65535');
    c.port = port;
    c.name ||= `服务 :${port}`;
    return c;
  }
  const p = String(input.path || '').trim();
  const ok = process.platform === 'win32' ? /^(\\\\\.\\)?COM\d{1,3}$/i.test(p) : /^\/[\w./:+-]{1,200}$/.test(p);
  if (!ok) throw new Error('串口路径无效');
  c.path = process.platform === 'win32' && !p.startsWith('\\\\.\\') ? `\\\\.\\${p.toUpperCase()}` : p;
  c.baud = BAUDS.includes(Number(input.baud)) ? Number(input.baud) : 115200;
  const addr = Number(input.address ?? 1);
  if (!Number.isInteger(addr) || addr < 1 || addr > 247) throw new Error('从机地址应为 1–247');
  c.address = addr;
  c.periodMs = PERIODS.includes(Number(input.periodMs)) ? Number(input.periodMs) : 0;
  c.readonly = !!input.readonly;
  c.modelProfile = validateProfile(input.modelProfile);
  c.name ||= path.basename(c.path);
  return c;
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function addDevice(config) {
  const d = new Device(config, corePath);
  d.on('state', (s) => send('device:state', s));
  d.on('sample', (s) => send('device:sample', s));
  d.on('log', (msg) => console.warn(`[${config.name}] ${msg}`));
  devices.set(config.id, d);
  d.start();
  return d;
}

function getDevice(id) {
  const d = devices.get(id);
  if (!d) throw new Error('设备不存在');
  return d;
}

function handle(channel, fn) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return { ok: true, value: await fn(...args) };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
}

handle('app:info', () => ({ corePath, platform: process.platform, version: app.getVersion() }));
handle('ports:list', () => listPorts());
handle('devices:list', () => [...devices.values()].map((d) => d.state()));
handle('device:add', (input) => {
  const config = validateConfig(input);
  if (config.kind === 'serial' && [...devices.values()].some((d) => d.config.path === config.path))
    throw new Error('该串口已添加');
  const d = addDevice(config);
  saveConfig();
  return d.state();
});
handle('device:remove', async (id) => {
  const d = getDevice(id);
  devices.delete(id);
  saveConfig();
  await d.stop();
});
handle('device:rename', (id, name) => {
  const n = String(name || '').trim().slice(0, 40);
  if (!n) throw new Error('名称不能为空');
  getDevice(id).rename(n);
  saveConfig();
});
handle('device:reconnect', (id) => getDevice(id).reconnect());
handle('device:setModelProfile', (id, profile) => {
  const d = getDevice(id);
  if (d.config.kind !== 'serial') throw new Error('外部核心服务需自行以 --model-profile 启动');
  d.config.modelProfile = validateProfile(profile);
  saveConfig();
  d.reconnect();
});
handle('device:setVoltage', (id, v) => getDevice(id).setVoltage(v));
handle('device:setCurrent', (id, i) => getDevice(id).setCurrent(i));
handle('device:setOutput', (id, on) => getDevice(id).setOutput(!!on));
handle('device:setLock', (id, on) => getDevice(id).setLock(!!on));
handle('device:setBacklight', (id, level) => getDevice(id).setBacklight(level));
handle('device:setProtection', (id, ovp, ocp) => getDevice(id).setProtection(ovp, ocp));
handle('device:savePreset', (id, slot, v, i) => getDevice(id).savePreset(slot, v, i));
handle('device:recallPreset', (id, slot) => getDevice(id).recallPreset(slot));
handle('device:resetStats', (id) => getDevice(id).resetStats());
handle('all:outputOff', async () => {
  const results = await Promise.allSettled(
    [...devices.values()].filter((d) => d.info.writable && d.live?.output).map((d) => d.setOutput(false)),
  );
  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed) throw new Error(`${failed} 台设备关闭失败`);
  return results.length;
});
handle('csv:save', async (name, text) => {
  if (typeof text !== 'string' || text.length > 200 * 1024 * 1024) throw new Error('数据无效');
  const safe = String(name || 'riden').replace(/[^\w一-龥.-]+/g, '_').slice(0, 60);
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: '导出 CSV',
    defaultPath: path.join(app.getPath('documents'), `${safe}.csv`),
    filters: [{ name: 'CSV', extensions: ['csv'] }],
  });
  if (canceled || !filePath) return null;
  await fs.promises.writeFile(filePath, '﻿' + text, 'utf8');
  return filePath;
});
handle('theme:set', (theme, background) => {
  nativeTheme.themeSource = theme === 'light' ? 'light' : 'dark';
  if (win && /^#[0-9a-f]{6}$/i.test(background)) win.setBackgroundColor(background);
});

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'RIDEN Desktop',
    backgroundColor: '#11140f',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) e.preventDefault();
  });
  if (process.env.VITE_DEV_SERVER_URL) win.loadURL(process.env.VITE_DEV_SERVER_URL);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  win.on('closed', () => {
    win = null;
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  corePath = resolveCore(app);
  for (const raw of loadConfig()) {
    try {
      addDevice(validateConfig(raw));
    } catch (e) {
      console.warn('忽略无效设备配置', e.message);
    }
  }
  createWindow();
});

app.on('window-all-closed', () => app.quit());

app.on('before-quit', (e) => {
  if (quitting) return;
  quitting = true;
  e.preventDefault();
  Promise.allSettled([...devices.values()].map((d) => d.stop())).finally(() => app.quit());
});

// 信号退出不会触发 before-quit；不处理会留下占用串口的 riden-cored。
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => app.quit());
process.on('exit', () => {
  for (const d of devices.values()) d.proc?.kill('SIGKILL');
});
