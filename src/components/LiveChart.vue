<template>
  <section class="panel chart-panel">
    <header class="toolbar">
      <div class="chips">
        <button
          v-for="c in CHANNELS"
          :key="c.key"
          class="chip"
          :class="[c.color, { off: !visible[c.key] }]"
          @click="toggle(c.key)"
        >
          <span class="swatch" />{{ c.name }}
        </button>
      </div>
      <div class="spacer" />
      <div class="segmented">
        <button v-for="w in WINDOWS" :key="w.ms" :class="{ active: windowMs === w.ms }" @click="windowMs = w.ms">
          {{ w.label }}
        </button>
      </div>
      <button class="btn sm icon" :class="paused ? 'primary' : 'ghost'" :title="paused ? '继续实时刷新' : '暂停并缩放查看'" @click="paused = !paused">
        <Play v-if="paused" /><Pause v-else />
      </button>
      <button class="btn sm icon ghost" title="导出 CSV" @click="exportCsv"><Download /></button>
      <button class="btn sm icon ghost" title="清空曲线" @click="clear"><Eraser /></button>
    </header>

    <div class="chart-wrap">
      <div ref="el" class="chart" />
      <div v-if="empty" class="empty faint">等待数据…</div>
      <div v-if="paused" class="paused-hint">已暂停 · 滚轮缩放，拖动平移，点击「继续」回到实时</div>
    </div>

    <footer class="stats">
      <div v-for="c in shownChannels" :key="c.key" class="stat">
        <span class="stat-name" :class="c.color">{{ c.name }}</span>
        <span class="mono"><em>最小</em>{{ fmtStat(win[c.key].min, c.key) }}</span>
        <span class="mono"><em>最大</em>{{ fmtStat(win[c.key].max, c.key) }}</span>
        <span class="mono"><em>平均</em>{{ fmtStat(win[c.key].avg, c.key) }}</span>
        <span class="unit faint">{{ c.unit }}</span>
      </div>
      <div class="stat-points faint mono">{{ win.n.toLocaleString() }} 点</div>
    </footer>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch, nextTick } from 'vue';
import { Play, Pause, Download, Eraser } from '@lucide/vue';
import { echarts, CHANNELS, WINDOWS, liveOption, themeColors, lowerBound } from '../charts.js';
import { store, history, clearHistory, run, api, toast } from '../store.js';
import { digits, clock } from '../format.js';

const props = defineProps({ device: { type: Object, required: true } });

const el = ref(null);
const windowMs = ref(60_000);
const paused = ref(false);
const empty = ref(true);
const visible = reactive({ v: true, i: true, p: true });
const blank = () => ({ min: NaN, max: NaN, avg: NaN });
const win = reactive({ v: blank(), i: blank(), p: blank(), n: 0 });

let chart = null;
let timer = null;
let observer = null;
let lastVersion = -1;
let lastDraw = 0;

const shownChannels = computed(() => CHANNELS.filter((c) => visible[c.key]));
const decimals = computed(() => ({ v: digits(props.device.vScale), i: digits(props.device.iScale), p: 2 }));

function fmtStat(v, key) {
  return Number.isFinite(v) ? v.toFixed(decimals.value[key]) : '--';
}

function toggle(key) {
  if (visible[key] && shownChannels.value.length === 1) return;
  visible[key] = !visible[key];
}

function lookup(t) {
  const h = history(props.device.id);
  if (!h.t.length) return null;
  let k = lowerBound(h.t, t);
  if (k >= h.t.length || (k > 0 && t - h.t[k - 1] < h.t[k] - t)) k--;
  return { t: h.t[k], v: h.v[k], i: h.i[k], p: h.p[k] };
}

function windowRange(h) {
  const now = Date.now();
  if (!windowMs.value) return { from: 0, start: h.t[0] ?? now - 60_000, end: now };
  const start = now - windowMs.value;
  return { from: Math.max(0, lowerBound(h.t, start) - 1), start, end: now };
}

function computeStats(h, from, to) {
  for (const c of CHANNELS) {
    const arr = h[c.key];
    let lo = Infinity;
    let hi = -Infinity;
    let sum = 0;
    for (let k = from; k < to; k++) {
      const v = arr[k];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
      sum += v;
    }
    const n = to - from;
    win[c.key] = n > 0 ? { min: lo, max: hi, avg: sum / n } : blank();
  }
  win.n = to - from;
}

function source(h, from, to) {
  if (from === 0 && to === h.t.length) return { t: h.t, v: h.v, i: h.i, p: h.p };
  return { t: h.t.slice(from, to), v: h.v.slice(from, to), i: h.i.slice(from, to), p: h.p.slice(from, to) };
}

function rebuild() {
  if (!chart) return;
  const h = history(props.device.id);
  let zoom = {};
  if (paused.value && h.t.length) {
    const end = h.t[h.t.length - 1];
    const start = windowMs.value ? end - windowMs.value : h.t[0];
    zoom = { startValue: start, endValue: end };
  }
  const option = liveOption({
    channels: shownChannels.value,
    height: el.value.clientHeight,
    paused: paused.value,
    colors: themeColors(),
    decimals: decimals.value,
    zoom,
    lookup,
  });
  if (paused.value) {
    option.dataset = { source: source(h, 0, h.t.length) };
    computeStats(h, Math.max(0, lowerBound(h.t, zoom.startValue ?? 0)), h.t.length);
  }
  chart.setOption(option, { notMerge: true });
  lastVersion = -1;
  if (!paused.value) refresh(true);
}

function refresh(force = false) {
  if (!chart || paused.value) return;
  const h = history(props.device.id);
  empty.value = h.t.length === 0;
  const now = performance.now();
  // 长时间窗口降低重绘频率；纯滚动无新数据时也要推进时间轴。
  const interval = windowMs.value === 0 || windowMs.value >= 900_000 ? 1000 : 100;
  if (!force && now - lastDraw < interval) return;
  if (!force && h.version === lastVersion && windowMs.value === 0) return;
  lastDraw = now;
  lastVersion = h.version;
  const { from, start, end } = windowRange(h);
  const to = h.t.length;
  computeStats(h, lowerBound(h.t, start), to);
  const xAxis = shownChannels.value.map(() => ({ min: start, max: end }));
  chart.setOption({ dataset: { source: source(h, from, to) }, xAxis });
}

function onZoom() {
  if (!paused.value) return;
  const h = history(props.device.id);
  const opt = chart.getOption().dataZoom?.[0];
  if (!opt || !h.t.length) return;
  const from = lowerBound(h.t, opt.startValue);
  const to = lowerBound(h.t, opt.endValue + 1);
  computeStats(h, from, to);
}

function onWheel() {
  if (!paused.value) paused.value = true;
}

function clear() {
  clearHistory(props.device.id);
  if (paused.value) paused.value = false;
  else rebuild();
}

function exportCsv() {
  const h = history(props.device.id);
  if (!h.t.length) return run(() => Promise.reject(new Error('没有可导出的数据')));
  const d = decimals.value;
  const lines = ['时间,时间戳(ms),电压(V),电流(A),功率(W),输出,模式'];
  for (let k = 0; k < h.t.length; k++) {
    const t = new Date(h.t[k]);
    const date = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    lines.push(
      `${date} ${clock(h.t[k], true)},${Math.round(h.t[k])},${h.v[k].toFixed(d.v)},${h.i[k].toFixed(d.i)},${h.p[k].toFixed(3)},${
        h.out[k] ? 'ON' : 'OFF'
      },${h.cc[k] ? 'CC' : 'CV'}`,
    );
  }
  const name = `${props.device.config.name}_${clock(Date.now()).replace(/:/g, '')}`;
  run(async () => {
    const path = await api.saveCsv(name, lines.join('\n') + '\n');
    if (path) toast(`已导出 ${path}`, 'success', 5000);
  });
}

onMounted(() => {
  chart = echarts.init(el.value, null, { renderer: 'canvas' });
  chart.on('datazoom', onZoom);
  el.value.addEventListener('wheel', onWheel, { passive: true });
  let raf = 0;
  observer = new ResizeObserver(() => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      chart.resize();
      rebuild();
    });
  });
  observer.observe(el.value);
  rebuild();
  timer = setInterval(() => refresh(), 100);
});

onBeforeUnmount(() => {
  clearInterval(timer);
  observer?.disconnect();
  chart?.dispose();
  chart = null;
});

watch([paused, windowMs, shownChannels, decimals], () => rebuild());
watch(
  () => store.colors,
  () => nextTick(rebuild),
);
</script>
<style scoped>
.chart-panel {
  display: flex;
  flex-direction: column;
  min-height: 340px;
  min-width: 0;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 12px 4px 16px;
}
.toolbar .segmented button {
  padding: 0 9px;
}
.chips {
  display: flex;
  gap: 6px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: var(--secondary-container);
  color: var(--on-secondary-container);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: opacity 0.15s;
}
.chip .swatch {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  background: currentColor;
}
.chip.volt .swatch {
  background: var(--volt);
}
.chip.curr .swatch {
  background: var(--curr);
}
.chip.power .swatch {
  background: var(--power);
}
.chip.off {
  background: transparent;
  border-color: var(--outline);
  color: var(--text-2);
}
.chip.off .swatch {
  opacity: 0.35;
}
.spacer {
  flex: 1;
}
.chart-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
}
.chart {
  position: absolute;
  inset: 0;
}
.empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  pointer-events: none;
}
.paused-hint {
  position: absolute;
  top: 6px;
  left: 50%;
  transform: translateX(-50%);
  padding: 3px 12px;
  border-radius: 12px;
  font-size: 12px;
  color: var(--on-secondary-container);
  background: var(--secondary-container);
  pointer-events: none;
}
.stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 28px;
  padding: 10px 18px 12px;
  border-top: 1px solid var(--outline-variant);
  font-size: 12px;
}
.stat {
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.stat-name {
  font-weight: 600;
}
.stat em {
  font-style: normal;
  color: var(--text-3);
  margin-right: 5px;
  font-family: Inter, system-ui, sans-serif;
}
.stat-points {
  margin-left: auto;
}
</style>
