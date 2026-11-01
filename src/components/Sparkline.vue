<template>
  <canvas ref="el" class="spark" />
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { history, store } from '../store.js';
import { lowerBound, themeColors } from '../charts.js';

const props = defineProps({ id: String, field: { type: String, default: 'p' }, color: { type: String, default: 'power' }, spanMs: { type: Number, default: 120_000 } });
const el = ref(null);
let timer = null;
let colors = themeColors();

function draw() {
  const c = el.value;
  if (!c) return;
  const h = history(props.id);
  const dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth;
  const ht = c.clientHeight;
  if (c.width !== Math.round(w * dpr)) c.width = Math.round(w * dpr);
  if (c.height !== Math.round(ht * dpr)) c.height = Math.round(ht * dpr);
  const ctx = c.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, ht);
  const end = Date.now();
  const start = end - props.spanMs;
  const from = Math.max(0, lowerBound(h.t, start) - 1);
  const arr = h[props.field];
  if (h.t.length - from < 2) return;
  let lo = Infinity;
  let hi = -Infinity;
  for (let k = from; k < arr.length; k++) {
    lo = Math.min(lo, arr[k]);
    hi = Math.max(hi, arr[k]);
  }
  const span = Math.max(hi - lo, Math.abs(hi) * 0.02, 0.01);
  const x = (t) => ((t - start) / props.spanMs) * w;
  const y = (v) => ht - 3 - ((v - lo) / span) * (ht - 6);
  const color = colors[props.color];
  ctx.beginPath();
  // 每像素最多取一个点，避免长窗口里重复绘制。
  const stride = Math.max(1, Math.floor((arr.length - from) / (w * 1.5)));
  for (let k = from; k < arr.length; k += stride) {
    const px = x(h.t[k]);
    k === from ? ctx.moveTo(px, y(arr[k])) : ctx.lineTo(px, y(arr[k]));
  }
  ctx.lineTo(x(h.t[arr.length - 1]), y(arr[arr.length - 1]));
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.lineTo(x(h.t[arr.length - 1]), ht);
  ctx.lineTo(x(h.t[from]), ht);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, 0, 0, ht);
  g.addColorStop(0, color + '38');
  g.addColorStop(1, color + '00');
  ctx.fillStyle = g;
  ctx.fill();
}

onMounted(() => {
  draw();
  timer = setInterval(() => draw(), 500);
});
onBeforeUnmount(() => clearInterval(timer));
watch(
  () => store.colors,
  () => setTimeout(() => {
    colors = themeColors();
    draw();
  }),
);
</script>

<style scoped>
.spark {
  display: block;
  width: 100%;
  height: 46px;
}
</style>
