import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  AxisPointerComponent,
  LegendComponent,
  DatasetComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { store } from './store.js';

echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  AxisPointerComponent,
  LegendComponent,
  DatasetComponent,
  CanvasRenderer,
]);

export { echarts };

export const CHANNELS = [
  { key: 'v', name: '电压', unit: 'V', color: 'volt', minSpan: 0.05 },
  { key: 'i', name: '电流', unit: 'A', color: 'curr', minSpan: 0.005 },
  { key: 'p', name: '功率', unit: 'W', color: 'power', minSpan: 0.05 },
];

export const WINDOWS = [
  { label: '30秒', ms: 30_000 },
  { label: '1分', ms: 60_000 },
  { label: '5分', ms: 300_000 },
  { label: '15分', ms: 900_000 },
  { label: '1时', ms: 3_600_000 },
  { label: '全部', ms: 0 },
];

export const seriesColor = (k) => store.colors.series[k % store.colors.series.length];

// ECharts 不认 color-mix()，这里直接使用 theme.js 生成的十六进制色。
export function themeColors() {
  const c = store.colors;
  return {
    volt: c.volt,
    curr: c.curr,
    power: c.power,
    text: c.text,
    text2: c['text-2'],
    text3: c['text-3'],
    grid: c['outline-variant'] + '66',
    border: c['outline-variant'],
    panel: c['panel-hover'],
  };
}

// 返回第一个 t >= x 的下标。
export function lowerBound(arr, x) {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// 自动量程：留 12% 余量，并设最小跨度避免噪声被放大成满屏波动；不低于 0。
export function padRange(lo, hi, minSpan) {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { min: 0, max: minSpan * 10 };
  let span = hi - lo;
  if (span < minSpan) {
    const mid = (hi + lo) / 2;
    lo = mid - minSpan / 2;
    hi = mid + minSpan / 2;
    span = minSpan;
  }
  lo -= span * 0.12;
  hi += span * 0.12;
  if (lo < 0) {
    hi -= lo;
    lo = 0;
  }
  return { min: lo, max: hi };
}

export function timeLabel(t, span) {
  const d = new Date(t);
  const pad = (n) => String(n).padStart(2, '0');
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return span > 2 * 3_600_000 ? hm : `${hm}:${pad(d.getSeconds())}`;
}

export function axisDecimals(span) {
  if (span >= 10) return 1;
  if (span >= 1) return 2;
  if (span >= 0.1) return 3;
  return 4;
}

const AXIS_W = 64;

// 每个可见通道一个 grid，纵向堆叠，共享时间轴与十字准线。
export function liveOption({ channels, height, paused, colors, decimals, zoom, lookup }) {
  const top = 24;
  const bottom = paused ? 64 : 30;
  const gap = 34;
  const n = channels.length || 1;
  const h = Math.max(40, (height - top - bottom - gap * (n - 1)) / n);
  const xIndex = channels.map((_, k) => k);
  const grid = channels.map((_, k) => ({ left: AXIS_W, right: 18, top: top + k * (h + gap), height: h }));
  const xAxis = channels.map((_, k) => ({
    type: 'time',
    gridIndex: k,
    axisLine: { lineStyle: { color: colors.border } },
    axisTick: { show: false },
    splitLine: { show: true, lineStyle: { color: colors.grid } },
    axisLabel: {
      show: k === n - 1,
      color: colors.text3,
      hideOverlap: true,
      formatter: (t) => timeLabel(t, 0),
    },
    axisPointer: { label: { show: false } },
  }));
  const yAxis = channels.map((c, k) => ({
    type: 'value',
    gridIndex: k,
    scale: true,
    splitNumber: 3,
    name: c.unit,
    nameLocation: 'end',
    nameGap: 6,
    nameTextStyle: { color: colors[c.color], fontWeight: 600, align: 'right', padding: [0, 8, 0, 0] },
    axisLabel: {
      color: colors.text3,
      fontFamily: 'JetBrains Mono',
      fontSize: 11,
      showMinLabel: false,
      showMaxLabel: false,
      formatter: (v) => v.toFixed(decimals[c.key] ?? 2),
    },
    splitLine: { lineStyle: { color: colors.grid } },
    min: (r) => padRange(r.min, r.max, c.minSpan).min,
    max: (r) => padRange(r.min, r.max, c.minSpan).max,
  }));
  const series = channels.map((c, k) => ({
    name: c.name,
    type: 'line',
    xAxisIndex: k,
    yAxisIndex: k,
    encode: { x: 't', y: c.key },
    showSymbol: false,
    sampling: 'lttb',
    animation: false,
    lineStyle: { width: 1.6, color: colors[c.color] },
    itemStyle: { color: colors[c.color] },
    areaStyle: {
      origin: 'start',
      color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
        { offset: 0, color: colors[c.color] + '40' },
        { offset: 1, color: colors[c.color] + '00' },
      ]),
    },
  }));
  const option = {
    animation: false,
    grid,
    xAxis,
    yAxis,
    series,
    axisPointer: { link: [{ xAxisIndex: 'all' }], lineStyle: { color: colors.text3, type: 'dashed' } },
    tooltip: {
      trigger: 'axis',
      backgroundColor: colors.panel,
      borderColor: colors.border,
      textStyle: { color: colors.text, fontSize: 12 },
      axisPointer: { type: 'line' },
      formatter: (params) => {
        const row = params.length ? lookup(params[0].axisValue) : null;
        if (!row) return '';
        const t = new Date(row.t);
        const pad = (x, w = 2) => String(x).padStart(w, '0');
        let html = `<div style="font-family:JetBrains Mono;opacity:.7;margin-bottom:4px">${pad(t.getHours())}:${pad(
          t.getMinutes(),
        )}:${pad(t.getSeconds())}.${pad(t.getMilliseconds(), 3)}</div>`;
        for (const c of channels) {
          const v = row[c.key];
          html += `<div style="display:flex;gap:16px;justify-content:space-between"><span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${
            colors[c.color]
          };margin-right:6px"></span>${c.name}</span><b style="font-family:JetBrains Mono">${v.toFixed(
            (decimals[c.key] ?? 2) + 1,
          )} ${c.unit}</b></div>`;
        }
        return html;
      },
    },
  };
  if (paused) {
    option.dataZoom = [
      { type: 'inside', xAxisIndex: xIndex, filterMode: 'weakFilter', ...zoom },
      {
        type: 'slider',
        xAxisIndex: xIndex,
        filterMode: 'weakFilter',
        bottom: 12,
        height: 22,
        borderColor: colors.border,
        fillerColor: colors.grid,
        textStyle: { color: colors.text3 },
        labelFormatter: (t) => timeLabel(t, 0),
        ...zoom,
      },
    ];
  }
  return option;
}
