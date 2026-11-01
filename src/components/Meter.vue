<template>
  <div class="panel meter" :class="[color, { dim }]">
    <div class="m-head">
      <span class="m-label"><component :is="icon" />{{ label }}</span>
      <span v-if="badge" class="badge" :class="badge.toLowerCase()">{{ badge }}</span>
    </div>
    <div class="m-value mono">
      <span>{{ text }}</span><span class="m-unit">{{ unit }}</span>
    </div>
    <div class="m-foot"><slot /></div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { fmt } from '../format.js';

const props = defineProps({
  label: String,
  unit: String,
  value: Number,
  decimals: Number,
  color: String,
  icon: [Object, Function],
  badge: String,
  dim: Boolean,
});
const text = computed(() => fmt(props.value, props.decimals));
</script>

<style scoped>
.meter {
  position: relative;
  overflow: hidden;
  padding: 16px 20px 14px;
  --c: var(--text);
}
.meter.volt {
  --c: var(--volt);
}
.meter.curr {
  --c: var(--curr);
}
.meter.power {
  --c: var(--power);
}
.meter::before {
  content: '';
  position: absolute;
  inset: 0 0 auto 0;
  height: 3px;
  background: linear-gradient(90deg, var(--c), transparent 85%);
}
.meter::after {
  content: '';
  position: absolute;
  right: -40px;
  top: -60px;
  width: 180px;
  height: 180px;
  border-radius: 50%;
  background: radial-gradient(circle, color-mix(in srgb, var(--c) 14%, transparent), transparent 70%);
  pointer-events: none;
}
.m-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 22px;
}
.m-label {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-2);
}
.m-label svg {
  width: 15px;
  height: 15px;
  color: var(--c);
}
.m-value {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 6px 0 4px;
  font-size: 44px;
  font-weight: 500;
  line-height: 1.1;
  letter-spacing: -0.02em;
  color: var(--c);
  transition: opacity 0.2s;
}
.m-unit {
  font-size: 18px;
  font-weight: 500;
  opacity: 0.75;
}
.dim .m-value {
  opacity: 0.45;
}
.m-foot {
  font-size: 12px;
  color: var(--text-3);
  min-height: 18px;
}
</style>
