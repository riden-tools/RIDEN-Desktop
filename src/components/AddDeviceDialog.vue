<template>
  <Modal title="添加设备" width="580px" @close="$emit('close')">
    <div class="segmented tabs">
      <button :class="{ active: kind === 'serial' }" @click="kind = 'serial'"><Usb />USB 串口</button>
      <button :class="{ active: kind === 'remote' }" @click="kind = 'remote'"><Server />已运行的核心服务</button>
    </div>

    <template v-if="kind === 'serial'">
      <div class="ports-head">
        <span class="muted">选择串口</span>
        <button class="btn ghost sm" :disabled="loading" @click="refresh"><RefreshCw :class="{ spin: loading }" />刷新</button>
      </div>
      <div class="ports">
        <button
          v-for="p in ports"
          :key="p.path"
          class="port"
          :class="{ active: path === p.path, used: used(p.path) }"
          :disabled="used(p.path)"
          @click="pick(p)"
        >
          <Cable />
          <div class="p-text">
            <div class="p-name mono">{{ p.label }}</div>
            <div class="p-detail faint">{{ p.chip || p.detail || '串口设备' }}</div>
          </div>
          <span v-if="used(p.path)" class="badge">已添加</span>
          <span v-else-if="!p.access" class="badge err" title="当前用户没有读写权限">无权限</span>
          <Check v-else-if="path === p.path" class="tick" />
        </button>
        <div v-if="!ports.length && !loading" class="no-ports faint">未检测到 USB 串口，请检查连接或手动输入路径</div>
      </div>

      <div class="form">
        <label class="field span2">
          <span>串口路径</span>
          <input v-model="path" class="input mono" :placeholder="isWin ? 'COM3' : '/dev/ttyUSB0'" />
        </label>
        <label class="field span2">
          <span>设备名称</span>
          <input v-model="name" class="input" maxlength="40" placeholder="例如：工作台 1 号电源" />
        </label>
        <label class="field">
          <span>波特率</span>
          <select v-model.number="baud" class="select">
            <option v-for="b in [9600, 19200, 38400, 57600, 115200]" :key="b" :value="b">{{ b }}</option>
          </select>
        </label>
        <label class="field">
          <span>从机地址</span>
          <input v-model.number="address" class="input mono" type="number" min="1" max="247" />
        </label>
        <label class="field">
          <span>采样间隔</span>
          <select v-model.number="periodMs" class="select">
            <option :value="0">最快</option>
            <option :value="100">100 ms</option>
            <option :value="200">200 ms</option>
            <option :value="500">500 ms</option>
            <option :value="1000">1 秒</option>
          </select>
        </label>
        <label class="check">
          <input v-model="readonly" type="checkbox" />
          <span>只读监控<em class="faint">（禁止写入，防止误操作）</em></span>
        </label>
      </div>
    </template>

    <template v-else>
      <p class="muted note">
        连接到已在本机运行的 riden-cored（例如系统服务）。服务需以 <code>--allow-writes</code> 启动才能控制设备。
      </p>
      <div class="form">
        <label class="field">
          <span>端口</span>
          <input v-model.number="port" class="input mono" type="number" min="1" max="65535" />
        </label>
        <label class="field">
          <span>设备名称</span>
          <input v-model="name" class="input" maxlength="40" placeholder="可选" />
        </label>
      </div>
    </template>

    <template #footer>
      <button class="btn" @click="$emit('close')">取消</button>
      <button class="btn primary" :disabled="!valid || submitting" @click="submit"><Plus />连接</button>
    </template>
  </Modal>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { Usb, Server, RefreshCw, Cable, Check, Plus } from '@lucide/vue';
import Modal from './Modal.vue';
import { store, api, addDevice, run } from '../store.js';

const emit = defineEmits(['close']);
const isWin = store.appInfo?.platform === 'win32';
const kind = ref('serial');
const ports = ref([]);
const loading = ref(false);
const path = ref('');
const name = ref('');
const baud = ref(115200);
const address = ref(1);
const periodMs = ref(0);
const readonly = ref(false);
const port = ref(19606);
const submitting = ref(false);

const norm = (p) => (isWin ? p.replace(/^\\\\\.\\/, '').toUpperCase() : p);
const used = (p) => store.devices.some((d) => d.config.kind === 'serial' && norm(d.config.path) === norm(p));
const valid = computed(() =>
  kind.value === 'serial' ? path.value.trim() && !used(path.value.trim()) : port.value >= 1 && port.value <= 65535,
);

function pick(p) {
  path.value = p.path;
}

async function refresh() {
  loading.value = true;
  ports.value = (await run(() => api.listPorts())) || [];
  loading.value = false;
  if (!path.value || used(path.value)) path.value = ports.value.find((p) => !used(p.path) && p.access)?.path || '';
}

async function submit() {
  submitting.value = true;
  const config =
    kind.value === 'serial'
      ? { kind: 'serial', path: path.value.trim(), name: name.value, baud: baud.value, address: address.value, periodMs: periodMs.value, readonly: readonly.value }
      : { kind: 'remote', port: port.value, name: name.value };
  const ok = await addDevice(config);
  submitting.value = false;
  if (ok) emit('close');
}

onMounted(refresh);
</script>

<style scoped>
.tabs {
  width: 100%;
  margin-bottom: 16px;
}
.tabs button {
  flex: 1;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.tabs svg {
  width: 15px;
  height: 15px;
}
.ports-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  margin-bottom: 8px;
}
.spin {
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.ports {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 18px;
}
.port {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--border-strong);
  background: var(--panel-2);
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.port > svg {
  width: 18px;
  height: 18px;
  color: var(--text-3);
  flex: none;
}
.port:hover:not(:disabled) {
  border-color: var(--text-3);
}
.port.active {
  border-color: var(--primary);
  background: var(--secondary-container);
}
.port.active > svg:first-child {
  color: var(--primary-2);
}
.port:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.p-text {
  flex: 1;
  min-width: 0;
}
.p-name {
  font-weight: 600;
  font-size: 13px;
}
.p-detail {
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tick {
  width: 16px;
  height: 16px;
  color: var(--primary-2);
}
.no-ports {
  grid-column: 1 / -1;
  padding: 18px;
  text-align: center;
  font-size: 13px;
  border: 1px dashed var(--border-strong);
  border-radius: 10px;
}
.form {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
}
.form .span2 {
  grid-column: span 3;
}
.check {
  grid-column: span 3;
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
.check em {
  font-style: normal;
  margin-left: 4px;
}
.note {
  margin: 0 0 16px;
  font-size: 13px;
  line-height: 1.7;
}
code {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  padding: 1px 6px;
  border-radius: 5px;
  background: var(--panel-2);
}
</style>
