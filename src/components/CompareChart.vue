<template>
  <section class="panel cmp">
    <header class="toolbar">
      <div class="panel-title"><ChartLine />多设备对比</div>
      <div class="segmented">
        <button v-for="c in CHANNELS" :key="c.key" :class="{ active: field === c.key }" @click="field = c.key">{{ c.name }}</button>
      </div>
      <div class="spacer" />
      <div class="segmented">
        <button v-for="w in WINDOWS.slice(0, 5)" :key="w.ms" :class="{ active: windowMs === w.ms }" @click="windowMs = w.ms">
          {{ w.label }}
        </button>
      </div>
    </header>
    <div ref="el" class="chart" />
  </section>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch, nextTick } from 'vue';
import { ChartLine } from '@lucide/vue';
import { echarts, CHANNELS, WINDOWS, seriesColor, themeColors, lowerBound, padRange, timeLabel } from '../charts.js';
import { store, history } from '../store.js';

const el = ref(null);
const field = ref('p');
const windowMs = ref(300_000);
let chart = null;
let timer = null;
let observer = null;

function build() {
  if (!chart) return;
  const colors = themeColors();
  const ch = CHANNELS.find((c) => c.key === field.value);
  chart.setOption(
    {
      animation: false,
      grid: { left: 64, right: 20, top: 40, bottom: 30 },
      legend: { top: 4, right: 12, textStyle: { color: colors.text2 }, icon: 'roundRect', itemWidth: 12, itemHeight: 4 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: colors.panel,
        borderColor: colors.border,
        textStyle: { color: colors.text, fontSize: 12 },
        valueFormatter: (v) => (Array.isArray(v) ? v[1] : v)?.toFixed?.(3) + ' ' + ch.unit,
      },
      xAxis: {
        type: 'time',
        axisLine: { lineStyle: { color: colors.border } },
        splitLine: { show: true, lineStyle: { color: colors.grid } },
        axisLabel: { color: colors.text3, hideOverlap: true, formatter: (t) => timeLabel(t, windowMs.value) },
      },
      yAxis: {
        type: 'value',
        name: ch.unit,
        nameTextStyle: { color: colors.text2, align: 'right', padding: [0, 8, 0, 0] },
        axisLabel: {
          color: colors.text3,
          fontFamily: 'JetBrains Mono',
          fontSize: 11,
          showMinLabel: false,
          showMaxLabel: false,
          formatter: (v) => String(Number(v.toFixed(3))),
        },
        splitLine: { lineStyle: { color: colors.grid } },
        min: (r) => padRange(r.min, r.max, ch.minSpan).min,
        max: (r) => padRange(r.min, r.max, ch.minSpan).max,
      },
      series: [],
    },
    { notMerge: true },
  );
  refresh();
}

function refresh() {
  if (!chart) return;
  const end = Date.now();
  const start = end - windowMs.value;
  const series = store.devices.map((d, k) => {
    const h = history(d.id);
    const from = Math.max(0, lowerBound(h.t, start) - 1);
    const arr = h[field.value];
    const stride = Math.max(1, Math.floor((h.t.length - from) / 4000));
    const data = [];
    for (let j = from; j < h.t.length; j += stride) data.push([h.t[j], arr[j]]);
    return {
      name: d.config.name,
      type: 'line',
      showSymbol: false,
      sampling: 'lttb',
      lineStyle: { width: 1.6 },
      color: seriesColor(k),
      data,
    };
  });
  chart.setOption({ series, xAxis: { min: start, max: end } }, { replaceMerge: ['series'] });
}

onMounted(() => {
  chart = echarts.init(el.value);
  observer = new ResizeObserver(() => chart.resize());
  observer.observe(el.value);
  build();
  timer = setInterval(refresh, 500);
});
onBeforeUnmount(() => {
  clearInterval(timer);
  observer?.disconnect();
  chart?.dispose();
  chart = null;
});
watch([field, windowMs], build);
watch(
  () => store.colors,
  () => nextTick(build),
);
</script>

<style scoped>
.cmp {
  display: flex;
  flex-direction: column;
  min-height: 340px;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px 0 18px;
}
.spacer {
  flex: 1;
}
.chart {
  flex: 1;
  min-height: 300px;
}
</style>
