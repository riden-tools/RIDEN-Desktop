<template>
  <section class="panel ctl">
    <button class="out-tile" :class="{ on: output }" :disabled="!canWrite || busy" @click="toggle">
      <span class="out-icon"><Power /></span>
      <span class="out-text">
        <span class="out-state">{{ output ? '输出已开启' : '输出已关闭' }}</span>
        <span class="out-sub">
          <template v-if="live">{{ live.cc ? '恒流 CC' : '恒压 CV' }} · 输入 {{ fmt(live.vin, 2) }} V</template>
          <template v-else>等待设备数据</template>
        </span>
      </span>
      <span class="switch" :class="{ on: output }" />
    </button>

    <SetpointInput
      label="设定电压"
      unit="V"
      color="volt"
      :value="live?.setV"
      :max="device.vMax || 0"
      :decimals="vd"
      :disabled="!canWrite"
      :apply="(v) => api.setVoltage(device.id, v)"
    />
    <SetpointInput
      label="设定电流"
      unit="A"
      color="curr"
      :value="live?.setI"
      :max="device.iMax || 0"
      :decimals="id"
      :disabled="!canWrite"
      :apply="(i) => api.setCurrent(device.id, i)"
    />
  </section>
</template>

<script setup>
import { computed, ref } from 'vue';
import { Power } from '@lucide/vue';
import SetpointInput from './SetpointInput.vue';
import { api, run } from '../store.js';
import { digits, fmt } from '../format.js';

const props = defineProps({ device: { type: Object, required: true }, canWrite: Boolean });
const busy = ref(false);
const live = computed(() => props.device.live);
const output = computed(() => !!live.value?.output);
const vd = computed(() => digits(props.device.vScale));
const id = computed(() => digits(props.device.iScale));

async function toggle() {
  busy.value = true;
  await run(() => api.setOutput(props.device.id, !output.value));
  busy.value = false;
}
</script>

<style scoped>
.ctl {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 12px 18px 18px;
}
.out-tile {
  margin: 0 -6px;
  width: calc(100% + 12px);
}
.out-tile {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 14px 16px;
  border: 0;
  border-radius: 16px;
  background: var(--panel-2);
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}
.out-tile:hover:not(:disabled) {
  background: color-mix(in srgb, var(--text) 6%, var(--panel-2));
}
.out-tile.on {
  background: var(--ok-container);
  color: var(--on-ok-container);
}
.out-tile.on:hover:not(:disabled) {
  background: color-mix(in srgb, var(--on-ok-container) 8%, var(--ok-container));
}
.out-tile:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.out-icon {
  width: 44px;
  height: 44px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--panel-hover);
  color: var(--text-2);
  transition: background 0.2s, color 0.2s;
}
.out-icon svg {
  width: 22px;
  height: 22px;
}
.on .out-icon {
  background: var(--ok);
  color: var(--on-ok);
}
.out-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.out-state {
  font-size: 16px;
  font-weight: 600;
}
.out-sub {
  font-size: 12px;
  opacity: 0.7;
}
.out-tile .switch {
  pointer-events: none;
}
.out-tile .switch.on {
  background: var(--ok);
  border-color: var(--ok);
}
.out-tile .switch.on::after {
  background: var(--on-ok);
}
</style>
