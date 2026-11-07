<template>
  <section class="panel settings">
    <div class="panel-title"><Settings />设备设置</div>


    <div class="row">
      <div>
        <div class="row-label"><Lock />面板按键锁</div>
        <div class="faint row-sub">锁定后设备前面板按键不可用</div>
      </div>
      <button
        class="switch"
        :class="{ on: device.live?.lock }"
        :disabled="!canWrite"
        @click="run(() => api.setLock(device.id, !device.live?.lock))"
      />
    </div>

    <div v-if="device.backlight !== null" class="row">
      <div>
        <div class="row-label"><SunDim />屏幕背光</div>
      </div>
      <div class="segmented">
        <button
          v-for="n in 6"
          :key="n"
          :class="{ active: device.backlight === n - 1 }"
          :disabled="!device.backlightWritable"
          @click="run(() => api.setBacklight(device.id, n - 1))"
        >
          {{ n - 1 }}
        </button>
      </div>
    </div>

    <dl class="info">
      <div><dt>型号</dt><dd>{{ device.modelName || '—' }}</dd></div>
      <div><dt>固件</dt><dd class="mono">{{ device.firmware || '—' }}</dd></div>
      <div><dt>序列号</dt><dd class="mono">{{ device.serial || '—' }}</dd></div>
      <div><dt>连接</dt><dd class="mono">{{ link }}</dd></div>
      <div><dt>核心端口</dt><dd class="mono">{{ device.daemonPort || '—' }}</dd></div>
      <div><dt>采样</dt><dd class="mono">{{ device.live ? device.live.rate.toFixed(1) + ' Hz' : '—' }}</dd></div>
    </dl>
  </section>
</template>

<script setup>
import { computed } from 'vue';
import { Settings, Lock, SunDim } from '@lucide/vue';
import { api, run } from '../store.js';
import { deviceSubtitle } from '../format.js';

const props = defineProps({ device: { type: Object, required: true }, canWrite: Boolean });
const link = computed(() => {
  const c = props.device.config;
  return c.kind === 'remote' ? deviceSubtitle(props.device) : `${deviceSubtitle(props.device)} @ ${c.baud}`;
});
</script>

<style scoped>
.settings {
  padding: 16px 18px 6px;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
  border-top: 1px solid var(--border);
}
.row-label {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 500;
}
.row-label svg {
  width: 15px;
  height: 15px;
  color: var(--text-3);
}
.row-sub {
  font-size: 11px;
  margin: 2px 0 0 22px;
}
.info {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 16px;
  margin: 0;
  padding: 12px 0;
  border-top: 1px solid var(--border);
  font-size: 12px;
}
.info div {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}
.info dt {
  color: var(--text-3);
}
.info dd {
  margin: 0;
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
