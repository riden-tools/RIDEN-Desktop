<template>
  <div class="view">
    <header class="head">
      <div class="title">
        <span class="dot" :class="STATUS[device.status]?.cls" />
        <input
          v-if="editing"
          ref="nameInput"
          v-model="name"
          class="input name-input"
          maxlength="40"
          @keydown.enter="saveName"
          @keydown.esc="editing = false"
          @blur="saveName"
        />
        <h1 v-else @dblclick="startEdit">{{ device.config.name }}</h1>
        <button v-if="!editing" class="btn ghost sm icon" title="重命名" @click="startEdit"><Pencil /></button>
        <span class="badge">{{ device.modelName || '识别中' }}</span>
        <span class="badge" :class="statusBadge">{{ STATUS[device.status]?.text }}</span>
        <span v-if="device.live?.lock" class="badge" title="前面板按键已锁定"><Lock />已锁定</span>
        <span v-if="!device.writable && device.status === 'online' && device.modelName" class="badge"><Eye />只读</span>
      </div>
      <div class="head-right">
        <div v-if="device.live" class="chips">
          <span class="chip"><Thermometer />{{ device.live.temp ?? '--' }} °C</span>
          <span class="chip"><Plug />输入 {{ fmt(device.live.vin, 2) }} V</span>
        </div>
        <button class="btn ghost sm icon" title="重新连接" :disabled="!!program" @click="run(() => api.reconnect(device.id))"><RefreshCw /></button>
        <button class="btn ghost sm icon" title="移除设备" :disabled="!!program" @click="removing = true"><Trash2 /></button>
      </div>
    </header>

    <div v-if="device.status === 'error'" class="banner err">
      <CircleAlert />
      <span>{{ device.error }}</span>
      <span class="faint">{{ retryIn }}</span>
      <button class="btn sm" @click="run(() => api.reconnect(device.id))">立即重试</button>
    </div>
    <div v-else-if="device.status === 'stale' || (device.status === 'connecting' && device.error)" class="banner warn">
      <TriangleAlert />
      <span>{{ device.error || '正在连接…' }}</span>
    </div>
    <div v-if="device.live?.protect" class="banner err">
      <ShieldAlert />
      <span>
        <b>{{ ({ OVP: '过压保护 OVP', OCP: '过流保护 OCP', OTP: '过温保护 OTP' })[device.live.protect] }}</b> 已触发，设备已切断输出。排除故障后重新打开输出。
      </span>
    </div>
    <div v-if="profileMismatch" class="banner warn">
      <TriangleAlert />
      <span>已保存的型号参数对应型号代码 {{ device.config.modelProfile.model }}，当前设备为 {{ device.model }}，参数未生效。</span>
      <button class="btn sm" @click="profiling = true">重新设置</button>
    </div>
    <div v-if="readonlyReason" class="banner info">
      <Info />
      <span>{{ readonlyReason }}</span>
      <button v-if="canProfile" class="btn sm" @click="profiling = true">设置型号参数</button>
    </div>
    <div v-else-if="device.custom && device.status === 'online'" class="banner info">
      <SlidersHorizontal />
      <span>正在使用自定义型号参数（电压精度 {{ 1 / device.vScale }} V，电流精度 {{ 1 / device.iScale }} A）。</span>
      <button v-if="canProfile" class="btn sm" @click="profiling = true">修改</button>
    </div>

    <div class="body">
      <div class="left">
        <div class="meters">
          <Meter label="电压" unit="V" color="volt" :icon="Zap" :value="live?.v" :decimals="vd" :dim="!on" :badge="on && !live?.cc ? 'CV' : ''">
            设定 <b class="mono">{{ fmt(live?.setV, vd) }}</b> V
          </Meter>
          <Meter label="电流" unit="A" color="curr" :icon="Activity" :value="live?.i" :decimals="id" :dim="!on" :badge="on && live?.cc ? 'CC' : ''">
            限流 <b class="mono">{{ fmt(live?.setI, id) }}</b> A
          </Meter>
          <Meter label="功率" unit="W" color="power" :icon="Gauge" :value="live?.p" :decimals="pd" :dim="!on">
            <template v-if="live && live.i > 0.001">负载 <b class="mono">{{ load }}</b> Ω</template>
            <template v-else>无负载</template>
          </Meter>
          <div class="panel acc">
            <div class="acc-head">
              <span class="m-label"><BatteryCharging />累计</span>
              <button class="btn ghost sm icon" title="清零累计" @click="run(() => api.resetStats(device.id))"><RotateCcw /></button>
            </div>
            <div class="acc-row"><em>容量</em><span class="mono">{{ fmt(stats?.ah, 4) }}</span><i>Ah</i></div>
            <div class="acc-row"><em>能量</em><span class="mono">{{ fmt(stats?.wh, 4) }}</span><i>Wh</i></div>
            <div class="acc-row"><em>输出时长</em><span class="mono">{{ duration(stats?.onMs || 0) }}</span><i /></div>
          </div>
        </div>
        <LiveChart :device="device" />
      </div>
      <div class="right">
        <div v-if="program" class="banner info"><Workflow /><span>「{{ program.name }}」正在控制此设备</span><button class="btn sm" @click="store.selected = 'programs'">查看程序</button></div>
        <ControlPanel :device="device" :can-write="canWrite" />
        <PresetPanel :device="device" :can-write="canWrite" />
        <DeviceSettings :device="device" :can-write="canWrite" />
      </div>
    </div>

    <ModelProfileDialog v-if="profiling" :device="device" @close="profiling = false" />
    <Modal v-if="removing" title="移除设备" @close="removing = false">
      <p class="muted">
        移除「{{ device.config.name }}」后将停止通信并清除曲线数据，设备当前的输出状态不会改变。
      </p>
      <template #footer>
        <button class="btn" @click="removing = false">取消</button>
        <button class="btn danger" @click="removeDevice(device.id)">移除</button>
      </template>
    </Modal>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  Pencil, Lock, Eye, Thermometer, Plug, RefreshCw, Trash2, CircleAlert, TriangleAlert, ShieldAlert, Info,
  Zap, Activity, Gauge, BatteryCharging, RotateCcw, SlidersHorizontal, Workflow,
} from '@lucide/vue';
import ModelProfileDialog from './ModelProfileDialog.vue';
import Meter from './Meter.vue';
import LiveChart from './LiveChart.vue';
import ControlPanel from './ControlPanel.vue';
import PresetPanel from './PresetPanel.vue';
import DeviceSettings from './DeviceSettings.vue';
import Modal from './Modal.vue';
import { api, run, removeDevice, store, deviceProgram } from '../store.js';
import { STATUS, fmt, digits, powerDigits, duration } from '../format.js';

const props = defineProps({ device: { type: Object, required: true } });

const live = computed(() => props.device.live);
const stats = computed(() => props.device.stats);
// 无响应时保留最后读数但变暗，避免误认为是实时值。
const on = computed(() => !!live.value?.output && props.device.status === 'online');
const vd = computed(() => digits(props.device.vScale));
const id = computed(() => digits(props.device.iScale));
const pd = computed(() => powerDigits(live.value?.p ?? 0));
const load = computed(() => {
  const r = live.value.v / live.value.i;
  return r >= 100 ? r.toFixed(0) : r >= 10 ? r.toFixed(1) : r.toFixed(2);
});
const program = computed(() => deviceProgram(props.device.id));
const canWrite = computed(() => props.device.writable && props.device.status === 'online' && !program.value);
const statusBadge = computed(() => ({ ok: 'on', warn: '', err: 'err' })[STATUS[props.device.status]?.cls] ?? '');

const readonlyReason = computed(() => {
  const d = props.device;
  if (d.status !== 'online' || !d.modelName || d.writable) return '';
  if (d.config.readonly) return '只读监控模式：已禁用所有写入操作。如需控制，请移除后重新添加设备并取消「只读」。';
  if (!d.known && d.config.kind === 'serial') return `未识别的型号代码 ${d.model}，已禁用写入。若寄存器与 RD60xx 相同，可设置精度和量程后启用控制。`;
  if (!d.known) return `未识别的型号代码 ${d.model}，已禁用写入。外部核心服务需以 --model-profile 启动。`;
  return '该核心服务未启用写入（需以 --allow-writes 启动）。';
});

const now = ref(Date.now());
let ticker = null;
onMounted(() => (ticker = setInterval(() => (now.value = Date.now()), 500)));
onBeforeUnmount(() => clearInterval(ticker));
const retryIn = computed(() => {
  const s = Math.ceil(((props.device.retryAt || 0) - now.value) / 1000);
  return s > 0 ? `${s} 秒后自动重试` : '正在重试…';
});

const editing = ref(false);
const name = ref('');
const nameInput = ref(null);
function startEdit() {
  name.value = props.device.config.name;
  editing.value = true;
  nextTick(() => nameInput.value?.select());
}
function saveName() {
  if (!editing.value) return;
  editing.value = false;
  if (name.value.trim() && name.value.trim() !== props.device.config.name)
    run(() => api.renameDevice(props.device.id, name.value));
}

const removing = ref(false);
const profiling = ref(false);
const canProfile = computed(() => props.device.config.kind === 'serial' && !!props.device.model && (!props.device.known || props.device.custom));
const profileMismatch = computed(() => {
  const mp = props.device.config.modelProfile;
  return !!mp && props.device.status === 'online' && !!props.device.model && mp.model !== props.device.model && !props.device.known;
});
</script>
<style scoped>
.view {
  padding: 20px 24px 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  height: 100%;
  min-height: 640px;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.title {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.title .dot {
  width: 10px;
  height: 10px;
}
h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.name-input {
  font-size: 18px;
  font-weight: 600;
  width: 260px;
}
.head-right {
  display: flex;
  align-items: center;
  gap: 6px;
}
.chips {
  display: flex;
  gap: 8px;
  margin-right: 8px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  border-radius: 8px;
  background: var(--panel);
  font-size: 12px;
  color: var(--text-2);
  font-family: 'JetBrains Mono', monospace;
}
.chip svg {
  width: 14px;
  height: 14px;
  color: var(--text-3);
}
.banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-radius: 12px;
  font-size: 13px;
}
.banner svg {
  width: 18px;
  height: 18px;
  flex: none;
}
.banner .btn {
  margin-left: auto;
}
.banner.err {
  color: var(--on-danger-container);
  background: var(--danger-container);
}
.banner.warn {
  color: var(--on-warn-container);
  background: var(--warn-container);
}
.banner.info {
  color: var(--on-secondary-container);
  background: var(--secondary-container);
}
.banner .faint {
  color: inherit;
  opacity: 0.75;
}
.body {
  flex: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 14px;
  min-height: 0;
}
.left {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
  min-height: 0;
}
.left > :last-child {
  flex: 1;
}
.right {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
  overflow-y: auto;
  margin-right: -8px;
  padding-right: 8px;
}
.right > * {
  flex: none;
}
.meters {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr)) minmax(170px, 0.8fr);
  gap: 14px;
}
.acc {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.acc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: -2px -6px 2px 0;
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
  color: var(--primary-2);
}
.acc-row {
  display: grid;
  grid-template-columns: auto 1fr 24px;
  align-items: baseline;
  gap: 8px;
  font-size: 15px;
}
.acc-row em {
  font-style: normal;
  font-size: 12px;
  color: var(--text-3);
}
.acc-row span {
  text-align: right;
  font-weight: 500;
}
.acc-row i {
  font-style: normal;
  font-size: 11px;
  color: var(--text-3);
}
p {
  margin: 0;
  line-height: 1.7;
}
@media (max-width: 1360px) {
  .meters {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .acc {
    grid-column: 1 / -1;
    flex-direction: row;
    align-items: center;
    gap: 24px;
  }
  .acc-head {
    margin: 0;
  }
  .acc-row {
    grid-template-columns: auto auto auto;
  }
}
</style>
