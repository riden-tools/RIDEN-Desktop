<template>
  <section class="panel settings">
    <div class="panel-title"><ShieldCheck />保护与设置</div>

    <div class="prot">
      <label class="field">
        <span>过压保护 OVP</span>
        <div class="unit-input">
          <input v-model="ovp" class="input mono" :disabled="!canWrite" @input="dirty = true" @keydown.enter="applyProt" />
          <em>V</em>
        </div>
      </label>
      <label class="field">
        <span>过流保护 OCP</span>
        <div class="unit-input">
          <input v-model="ocp" class="input mono" :disabled="!canWrite" @input="dirty = true" @keydown.enter="applyProt" />
          <em>A</em>
        </div>
      </label>
      <button class="btn" :class="{ primary: dirty }" :disabled="!canWrite || !dirty" @click="applyProt">应用</button>
    </div>

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
import { computed, ref, watch } from 'vue';
import { ShieldCheck, Lock, SunDim } from '@lucide/vue';
import { api, run, toast } from '../store.js';
import { digits, fmt, deviceSubtitle } from '../format.js';

const props = defineProps({ device: { type: Object, required: true }, canWrite: Boolean });
const vd = computed(() => digits(props.device.vScale));
const id = computed(() => digits(props.device.iScale));
const m0 = computed(() => props.device.presets?.[0]);
const ovp = ref('');
const ocp = ref('');
const dirty = ref(false);

const link = computed(() => {
  const c = props.device.config;
  return c.kind === 'remote' ? deviceSubtitle(props.device) : `${deviceSubtitle(props.device)} @ ${c.baud}`;
});

watch(
  m0,
  (p) => {
    if (!p || dirty.value) return;
    ovp.value = fmt(p.ovp, vd.value);
    ocp.value = fmt(p.ocp, id.value);
  },
  { immediate: true },
);

async function applyProt() {
  const v = Number(ovp.value);
  const i = Number(ocp.value);
  if (!Number.isFinite(v) || !Number.isFinite(i) || v <= 0 || i <= 0) {
    toast('请输入有效的保护值', 'error');
    return;
  }
  const ok = await run(() => api.setProtection(props.device.id, v, i), '保护值已更新');
  if (ok) dirty.value = false;
}
</script>

<style scoped>
.settings {
  padding: 16px 18px 6px;
}
.prot {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  align-items: end;
  gap: 10px;
  margin: 14px 0 6px;
}
.unit-input {
  position: relative;
}
.unit-input .input {
  width: 100%;
  padding-right: 28px;
}
.unit-input em {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  font-style: normal;
  font-size: 12px;
  color: var(--text-3);
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
  border-top: 1px solid var(--border);
}
.prot + .row {
  margin-top: 10px;
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
