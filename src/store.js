import { reactive, markRaw } from 'vue';
import { applyTheme, SEEDS } from './theme.js';

const api = window.riden;
const MAX_POINTS = 400_000; // 约 10 Hz 下 11 小时
const TRIM = 40_000;

// 设备状态是响应式的；曲线历史数据量大，保持非响应式，由图表自行轮询 version。
export const store = reactive({
  devices: [],
  selected: 'overview',
  theme: localStorage.getItem('theme') || 'dark',
  seed: localStorage.getItem('seed') || SEEDS[0].hex,
  colors: {},
  toasts: [],
  appInfo: null,
  programRuns: [],
});

const histories = new Map();

function newHistory() {
  return markRaw({ t: [], v: [], i: [], p: [], out: [], cc: [], version: 0 });
}

export function history(id) {
  let h = histories.get(id);
  if (!h) histories.set(id, (h = newHistory()));
  return h;
}

export function clearHistory(id) {
  histories.set(id, newHistory());
}

export function deviceById(id) {
  return store.devices.find((d) => d.id === id);
}

function upsert(state) {
  const d = deviceById(state.id);
  if (d) Object.assign(d, state);
  else store.devices.push(state);
}

function onSample({ id, live, stats }) {
  const d = deviceById(id);
  if (!d) return;
  d.live = live;
  d.stats = stats;
  const h = history(id);
  const last = h.t[h.t.length - 1];
  if (last !== undefined && live.t <= last) return;
  h.t.push(live.t);
  h.v.push(live.v);
  h.i.push(live.i);
  h.p.push(live.p);
  h.out.push(live.output ? 1 : 0);
  h.cc.push(live.cc ? 1 : 0);
  if (h.t.length > MAX_POINTS) for (const k of ['t', 'v', 'i', 'p', 'out', 'cc']) h[k].splice(0, TRIM);
  h.version++;
}

let toastId = 0;
export function toast(message, type = 'info', ms = 3200) {
  const id = ++toastId;
  store.toasts.push({ id, message, type });
  setTimeout(() => {
    const k = store.toasts.findIndex((t) => t.id === id);
    if (k >= 0) store.toasts.splice(k, 1);
  }, ms);
}

// 调用主进程接口，失败时弹出提示并返回 undefined。
export async function run(fn, success) {
  try {
    const value = await fn();
    if (success) toast(success, 'success');
    return value ?? true;
  } catch (e) {
    toast(e.message, 'error', 5000);
    return undefined;
  }
}

export function setTheme(theme, seed = store.seed) {
  store.theme = theme;
  store.seed = seed;
  localStorage.setItem('theme', theme);
  localStorage.setItem('seed', seed);
  document.documentElement.dataset.theme = theme;
  store.colors = applyTheme(seed, theme === 'dark');
  api.setTheme(theme, store.colors.bg);
}

export async function init() {
  setTheme(store.theme);
  api.onState(upsert);
  api.onSample(onSample);
  api.onProgram(upsertRun);
  // Subscribe first; a run update can arrive while the initial list is loading.
  for (const r of await api.programRuns()) if (!store.programRuns.some((x) => x.id === r.id)) upsertRun(r);
  store.appInfo = await api.appInfo();
  for (const s of await api.listDevices()) upsert(s);
  if (store.devices.length === 1) store.selected = store.devices[0].id;
}

export function upsertRun(state) {
  const r = store.programRuns.find((x) => x.id === state.id);
  if (r) Object.assign(r, state);
  else store.programRuns.unshift(state);
  store.programRuns = store.programRuns.slice(0, 40);
}

export function deviceProgram(id) {
  return store.programRuns.find((r) => !r.endedAt && Object.values(r.bindings).includes(id));
}

export async function removeDevice(id) {
  const removed = await run(() => api.removeDevice(id), '设备已移除');
  if (!removed) return;
  const k = store.devices.findIndex((d) => d.id === id);
  if (k >= 0) store.devices.splice(k, 1);
  histories.delete(id);
  if (store.selected === id) store.selected = 'overview';
}

export async function addDevice(config) {
  const state = await run(() => api.addDevice(config));
  if (!state) return false;
  upsert(state);
  store.selected = state.id;
  return true;
}

export { api };
