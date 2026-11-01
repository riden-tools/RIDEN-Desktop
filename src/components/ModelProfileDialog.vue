<template>
  <Modal title="设置型号参数" width="560px" @close="$emit('close')">
    <p class="muted note">
      设备型号代码 <b class="mono">{{ device.model }}</b> 不在内置列表中。若它与 RD60xx 系列寄存器相同，只是精度和量程不同，可在此填写参数以启用控制。
    </p>

    <div class="field">
      <span>参考型号</span>
      <div class="refs">
        <button v-for="r in REFS" :key="r.name" class="btn sm" :class="{ tonal: refName === r.name }" @click="pick(r)">{{ r.name }}</button>
      </div>
    </div>

    <div class="form">
      <label class="field">
        <span>电压精度</span>
        <select v-model.number="p.vScale" class="select">
          <option v-for="s in SCALES" :key="s" :value="s">{{ step(s) }} V</option>
        </select>
      </label>
      <label class="field">
        <span>电流精度</span>
        <select v-model.number="p.iScale" class="select">
          <option v-for="s in SCALES" :key="s" :value="s">{{ step(s) }} A</option>
        </select>
      </label>
      <label class="field">
        <span>最大设定电压 (V)</span>
        <input v-model.number="p.vMax" class="input mono" type="number" min="0" step="any" />
      </label>
      <label class="field">
        <span>最大设定电流 (A)</span>
        <input v-model.number="p.iMax" class="input mono" type="number" min="0" step="any" />
      </label>
      <label class="field">
        <span>OVP 上限 (V)</span>
        <input v-model.number="p.ovpMax" class="input mono" type="number" min="0" step="any" />
      </label>
      <label class="field">
        <span>OCP 上限 (A)</span>
        <input v-model.number="p.ocpMax" class="input mono" type="number" min="0" step="any" />
      </label>
    </div>

    <div class="preview">
      <div class="pv-title">按此精度显示的当前读数</div>
      <div class="pv-row mono">
        <span><em>输出</em><b class="volt">{{ show(raw.v, p.vScale) }}</b> V</span>
        <span><b class="curr">{{ show(raw.i, p.iScale) }}</b> A</span>
        <span><em>设定</em><b class="volt">{{ show(raw.setV, p.vScale) }}</b> V</span>
        <span><b class="curr">{{ show(raw.setI, p.iScale) }}</b> A</span>
      </div>
      <label class="check">
        <input v-model="confirmed" type="checkbox" />
        <span>已与设备屏幕核对，数值一致</span>
      </label>
    </div>

    <div v-if="error" class="err">{{ error }}</div>

    <template #footer>
      <button v-if="device.config.modelProfile" class="btn ghost clear" @click="save(null)">清除自定义</button>
      <button class="btn" @click="$emit('close')">取消</button>
      <button class="btn primary" :disabled="!confirmed || !!error || busy" @click="save(p)">应用并重连</button>
    </template>
  </Modal>
</template>

<script setup>
import { computed, reactive, ref as vref } from 'vue';
import Modal from './Modal.vue';
import { api, run, clearHistory } from '../store.js';

const props = defineProps({ device: { type: Object, required: true } });
const emit = defineEmits(['close']);

const SCALES = [10, 100, 1000, 10000];
// 与 RIDEN-Core 内置型号表一致。
const REFS = [
  { name: 'RD6006', vScale: 100, iScale: 1000, vMax: 61, iMax: 6.1, ovpMax: 62, ocpMax: 6.2 },
  { name: 'RD6006P', vScale: 1000, iScale: 10000, vMax: 61, iMax: 6.1, ovpMax: 62, ocpMax: 6.2 },
  { name: 'RD6012', vScale: 100, iScale: 100, vMax: 61, iMax: 12.1, ovpMax: 62, ocpMax: 12.2 },
  { name: 'RD6018', vScale: 100, iScale: 100, vMax: 61, iMax: 18.1, ovpMax: 62, ocpMax: 18.2 },
  { name: 'RD6024', vScale: 100, iScale: 100, vMax: 61, iMax: 24.1, ovpMax: 62, ocpMax: 24.2 },
  { name: 'RD6030', vScale: 100, iScale: 100, vMax: 61, iMax: 30.1, ovpMax: 62, ocpMax: 30.2 },
  { name: 'RK8009', vScale: 100, iScale: 1000, vMax: 81, iMax: 9.1, ovpMax: 82, ocpMax: 9.2 },
];

const saved = props.device.config.modelProfile;
const p = reactive({ ...(saved || REFS[0]) });
const refName = vref(saved ? '' : REFS[0].name);
const confirmed = vref(false);
const busy = vref(false);

const step = (s) => (1 / s).toFixed(Math.log10(s));
// 原始寄存器值 = 当前显示值 × 当前缩放；用于按新精度重新换算预览。
const raw = computed(() => {
  const l = props.device.live;
  const { vScale, iScale } = props.device;
  const r = (x, s) => (l && Number.isFinite(x) ? Math.round(x * s) : null);
  return { v: r(l?.v, vScale), i: r(l?.i, iScale), setV: r(l?.setV, vScale), setI: r(l?.setI, iScale) };
});
const show = (r, s) => (r === null ? '--' : (r / s).toFixed(Math.log10(s)));

const error = computed(() => {
  for (const [k, s, label] of [['vMax', p.vScale, '最大设定电压'], ['iMax', p.iScale, '最大设定电流'], ['ovpMax', p.vScale, 'OVP 上限'], ['ocpMax', p.iScale, 'OCP 上限']]) {
    const v = Number(p[k]);
    if (!Number.isFinite(v) || v <= 0) return `${label}需大于 0`;
    if (Math.round(v * s) > 65535) return `${label}在该精度下最大只能是 ${(65535 / s).toFixed(Math.log10(s))}`;
  }
  return '';
});

function pick(r) {
  refName.value = r.name;
  Object.assign(p, { ...r });
  delete p.name;
  confirmed.value = false;
}

async function save(profile) {
  busy.value = true;
  const body = profile && { model: props.device.model, vScale: p.vScale, iScale: p.iScale, vMax: p.vMax, iMax: p.iMax, ovpMax: p.ovpMax, ocpMax: p.ocpMax };
  const ok = await run(() => api.setModelProfile(props.device.id, body), profile ? '已应用型号参数，正在重连' : '已清除自定义参数');
  busy.value = false;
  if (ok) {
    clearHistory(props.device.id);
    emit('close');
  }
}
</script>

<style scoped>
.note {
  margin: 0 0 16px;
  font-size: 13px;
  line-height: 1.7;
}
.refs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 16px;
}
.form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.preview {
  margin-top: 18px;
  padding: 14px 16px;
  border-radius: 16px;
  background: var(--panel-hover);
}
.pv-title {
  font-size: 12px;
  color: var(--text-2);
  margin-bottom: 6px;
}
.pv-row {
  display: flex;
  gap: 18px;
  font-size: 15px;
  margin-bottom: 10px;
}
.pv-row em {
  font-style: normal;
  font-family: Inter, system-ui, sans-serif;
  font-size: 12px;
  color: var(--text-3);
  margin-right: 6px;
}
.pv-row b {
  font-weight: 500;
}
.check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  cursor: pointer;
}
.check input {
  width: 16px;
  height: 16px;
  accent-color: var(--primary);
}
.err {
  margin-top: 12px;
  font-size: 13px;
  color: var(--danger);
}
.clear {
  margin-right: auto;
}
</style>
