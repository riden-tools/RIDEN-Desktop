<template>
  <div class="program-view">
    <header class="page-head">
      <div><div class="eyebrow"><Workflow />AUTOMATION</div><h1>编程输出</h1><p class="muted">用积木连接读数、条件与动作，让多台电源协同工作。</p></div>
      <div class="head-actions"><button class="btn" @click="importProgram"><Upload />导入</button><select class="select example-select" aria-label="载入示例程序" @change="create($event.target.value); $event.target.value = ''"><option value="">示例程序…</option><option value="charge">锂电池充电</option><option value="sweep">电压阶梯扫描</option><option value="tracking">双设备电压跟随</option></select><button class="btn tonal" @click="create()"><Plus />新建程序</button></div>
    </header>
    <div v-if="loadError" class="error-banner">{{ loadError }}</div>
    <div class="workspace" :class="{ 'with-inspector': inspectorOpen }" v-if="draft">
      <section class="editor panel">
        <header class="editor-head">
          <div class="program-title"><select class="select program-picker" :value="draft.id" aria-label="选择程序" @change="select(library.find(p => p.id === $event.target.value))"><option v-if="!library.some(p => p.id === draft.id)" :value="draft.id">{{ draft.name }}</option><option v-for="p in library" :key="p.id" :value="p.id">{{ p.name }}</option></select><span class="badge">{{ dirty ? '未保存' : '已保存' }}</span></div>
          <div class="editor-actions">
            <button class="btn ghost sm icon" title="撤销" :disabled="running" @click="undo"><Undo2 /></button><button class="btn ghost sm icon" title="重做" :disabled="running" @click="redo"><Redo2 /></button>
            <button class="btn sm" @click="inspectorOpen = !inspectorOpen; tab = 'settings'"><Settings2 />设置</button>
            <button class="btn sm" :disabled="running" @click="save"><Save />保存</button>
            <button v-if="running" class="btn danger sm" @click="stop"><Square />停止</button>
            <button v-else class="btn primary sm" :disabled="!draft.blocks.length" @click="prepareStart"><Play />运行</button>
          </div>
        </header>
        <div class="editor-caption"><span>{{ blockCount }} 个积木 · {{ draft.devices.length }} 个设备角色</span><label v-if="running" class="follow"><input v-model="follow" type="checkbox" />跟随执行</label><span v-else>结束时关闭所有输出</span></div>
        <BlocklyCanvas ref="visualCanvas" :key="draft.id" :program="draft" :disabled="!!running" :active="currentRun?.active || []" :progress="currentRun?.progress || {}" :follow="follow" @change="canvasChanged" />
      </section>
      <aside v-if="inspectorOpen" class="inspector panel">
        <div class="inspector-tabs segmented"><button :class="{ active: tab === 'run' }" @click="tab = 'run'">运行监视</button><button :class="{ active: tab === 'settings' }" @click="tab = 'settings'">程序设置</button></div>
        <template v-if="tab === 'run'">
          <div class="run-status" :class="currentRun?.status"><span class="dot" :class="currentRun?.status === 'failed' ? 'err' : running ? 'ok' : ''" /><strong>{{ statuses[currentRun?.status] || '等待运行' }}</strong><span v-if="currentRun" class="mono faint">{{ elapsed }}</span></div>
          <button v-if="running" class="btn danger stop-btn" :disabled="currentRun.status === 'stopping'" @click="stop"><Square />停止并关闭输出</button>
          <p v-if="currentRun?.error" class="run-error">{{ currentRun.error }}</p>
          <div class="side-label">绑定设备</div>
          <template v-if="currentRun">
            <div v-for="role in draft.devices" :key="role.key" class="monitor-device">
              <div><span>{{ role.label }}</span><span class="badge" :class="boundDevice(role)?.status === 'online' ? 'on' : 'err'">{{ boundDevice(role)?.config.name || '设备已移除' }}</span></div>
              <div class="telemetry mono"><span class="volt">{{ fmt(boundDevice(role)?.live?.v, 2) }} <small>V</small></span><span class="curr">{{ fmt(boundDevice(role)?.live?.i, 3) }} <small>A</small></span><span class="power">{{ fmt(boundDevice(role)?.live?.p, 2) }} <small>W</small></span></div>
            </div>
          </template>
          <p v-else class="inspector-note">运行前选择实际设备。同一程序可绑定多台电源，条件可交叉引用读数。</p>
          <div v-if="currentRun && Object.keys(currentRun.variables).length" class="variables"><div class="side-label">变量</div><div v-for="(v, key) in currentRun.variables" :key="key"><span class="mono">${{ key }}</span><b class="mono">{{ Number(v.toFixed(4)) }}</b></div></div>
          <div v-if="currentRun?.lists && Object.keys(currentRun.lists).length" class="variables"><div class="side-label">列表</div><div v-for="(list, key) in currentRun.lists" :key="key" class="list-state"><span>{{ key }} · {{ list.length }} 项</span><small class="mono">{{ list.tail.map(v => Number(v.toFixed(4))).join(', ') }}</small></div></div>
          <div class="side-label">运行日志 <span>{{ currentRun?.logs.length || 0 }}</span></div>
          <div ref="logBox" class="run-logs"><div v-for="(entry, i) in currentRun?.logs || []" :key="i" :class="entry.level"><time class="mono">{{ new Date(entry.t).toLocaleTimeString('zh-CN', { hour12: false }) }}</time><span>{{ entry.message }}</span></div><p v-if="!currentRun" class="inspector-note">尚未运行。程序在主进程执行，切换页面不会中断。</p></div>
          <template v-if="otherRuns.length"><div class="side-label">其他运行中的程序</div><button v-for="r in otherRuns" :key="r.id" class="other-run" @click="openRun(r)"><span class="dot ok" />{{ r.name }}</button></template>
        </template>
        <template v-else>
          <fieldset :disabled="running" class="program-settings"><label class="field"><span>程序名称</span><input v-model="draft.name" class="input" maxlength="80" /></label>
            <label class="field"><span>说明</span><textarea v-model="draft.description" class="input" rows="3" maxlength="500" /></label>
            <label class="field"><span>最长运行时间（秒）</span><input v-model.number="draft.maxSeconds" class="input mono" type="number" min="1" max="86400" /></label>
            <div class="side-label">设备角色 <button class="btn ghost sm icon" title="添加设备角色" :disabled="draft.devices.length >= 16" @click="addRole"><Plus /></button></div>
            <div v-for="(d, i) in draft.devices" :key="d.key" class="role-field"><input v-model="d.label" class="input" aria-label="角色名称" /><button class="btn ghost sm icon" title="移除角色" @click="draft.devices.splice(i, 1)"><X /></button><span class="mono faint">{{ d.key }}</span></div>
            <div class="side-label">启动参数 <button class="btn ghost sm icon" title="添加参数" :disabled="draft.parameters.length >= 32" @click="addParameter"><Plus /></button></div>
            <div v-for="(p, i) in draft.parameters" :key="i" class="parameter-card">
              <div class="role-field"><input v-model="p.label" class="input" placeholder="显示名称" aria-label="参数名称" /><button class="btn ghost sm icon" title="移除参数" @click="draft.parameters.splice(i, 1)"><X /></button></div>
              <label class="field"><span>变量键名</span><input v-model="p.key" class="input mono" placeholder="英文键名" /></label>
              <div class="param-grid"><label class="field"><span>下限</span><input v-model.number="p.min" class="input mono" type="number" /></label><label class="field"><span>上限</span><input v-model.number="p.max" class="input mono" type="number" /></label></div>
              <label class="field"><span>单位</span><input v-model="p.unit" class="input" maxlength="12" /></label>
              <label class="checkbox"><input type="checkbox" :checked="p.default === null" @change="p.default = $event.target.checked ? null : p.min" />每次启动时填写</label>
              <label v-if="p.default !== null" class="field"><span>默认值</span><input v-model.number="p.default" class="input mono" type="number" /></label>
            </div>
            <button class="btn" @click="exportProgram"><Download />导出程序</button><button class="btn" @click="copyProgram"><Copy />另存副本</button><button class="btn ghost" @click="deleting = true"><Trash2 />删除程序</button>
          </fieldset>
        </template>
      </aside>
    </div>
    <div v-else-if="!loadError" class="blank panel"><Workflow /><h2>创建你的第一个程序</h2><button class="btn primary" @click="create('charge')">载入锂电池充电示例</button></div>
    <Modal v-if="starting" title="启动程序" width="540px" @close="starting = false">
      <p class="muted launch-description">{{ draft.name }} · 最长 {{ (draft.maxSeconds / 3600).toFixed(1) }} 小时</p>
      <div class="launch-fields">
        <label v-for="d in draft.devices" :key="d.key" class="field"><span>{{ d.label }}</span><select v-model="bindings[d.key]" class="select"><option value="" disabled>选择在线、可写的设备</option><option v-for="device in store.devices" :key="device.id" :value="device.id" :disabled="device.status !== 'online' || !device.writable || !!deviceProgram(device.id)">{{ device.config.name }} · {{ device.modelName }}{{ deviceProgram(device.id) ? ' · 正在运行程序' : '' }}</option></select></label>
        <label v-for="p in draft.parameters" :key="p.key" class="field"><span>{{ p.label }} {{ p.unit }}（{{ p.min }}–{{ p.max }}{{ p.default === null ? '，每次必填' : '' }}）</span><input v-model="parameters[p.key]" class="input mono" type="number" step="any" :min="p.min" :max="p.max" :placeholder="p.default === null ? '请输入本次运行值' : ''" /></label>
      </div>
      <p class="launch-note"><ShieldCheck />程序运行期间占用绑定设备；停止、完成或发生错误时会关闭这些设备的输出。</p>
      <p v-if="hasBattery" class="battery-note">充电示例仅用于普通 4.2 V 锂电池。请核对极性、允许充电电流；多串电池需有适配的 BMS / 均衡保护。串数估算后仍需确认。</p>
      <p v-if="startError" class="run-error">{{ startError }}</p>
      <template #footer><button class="btn" :disabled="startBusy" @click="starting = false">取消</button><button class="btn primary" :disabled="startBusy" @click="start"><Play />{{ startBusy ? '启动中…' : '启动程序' }}</button></template>
    </Modal>
    <Modal v-if="switchTarget" title="有未保存的更改" @close="switchTarget = null"><p class="muted">切换后将丢弃「{{ draft.name }}」的未保存更改。</p><template #footer><button class="btn" @click="switchTarget = null">取消</button><button class="btn" @click="discardSwitch">丢弃并切换</button><button class="btn primary" @click="saveSwitch">保存并切换</button></template></Modal>
    <Modal v-if="deleting" title="删除程序" @close="deleting = false"><p class="muted">删除「{{ draft.name }}」？</p><template #footer><button class="btn" @click="deleting = false">取消</button><button class="btn danger" @click="remove">删除</button></template></Modal>
  </div>
</template>
<script setup>
import { defineAsyncComponent, computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { Workflow, BatteryCharging, Plus, Play, Square, Save, Undo2, Redo2, Upload, Download, Copy, Trash2, X, ShieldCheck, Settings2 } from '@lucide/vue';
import { store, api, run, toast, upsertRun, deviceProgram } from '../../store.js';
import { fmt, duration } from '../../format.js';
import Modal from '../Modal.vue';
const BlocklyCanvas = defineAsyncComponent(() => import('./BlocklyCanvas.vue'));
const statuses = { running: '运行中', confirming: '等待电池确认', stopping: '正在关闭输出', stopped: '已停止', completed: '已完成', failed: '运行失败' };
const inspectorOpen = ref(false);
const library = ref([]), draft = ref(null), loadError = ref(''), tab = ref('run'), saved = ref('');
const currentRun = computed(() => store.programRuns.find((r) => r.programId === draft.value?.id));
const running = computed(() => currentRun.value && !currentRun.value.endedAt);
const otherRuns = computed(() => store.programRuns.filter((r) => !r.endedAt && r.programId !== draft.value?.id));
const dirty = computed(() => JSON.stringify(draft.value) !== saved.value);
const blockCount = computed(() => { let count = 0; function visit(list) { for (const b of list) { count++; [b.then, b.else, b.body, ...(b.branches || [])].filter(Boolean).forEach(visit); } } if (draft.value) { visit(draft.value.blocks); (draft.value.procedures || []).forEach(p => visit(p.body)); } return count; });
const hasBattery = computed(() => JSON.stringify(draft.value?.blocks || []).includes('"type":"battery"'));
const visualCanvas = ref(null), follow = ref(true);
const clone = (x) => JSON.parse(JSON.stringify(x));
watch(draft, () => { if (draft.value) localStorage.setItem('program-draft', JSON.stringify(draft.value)); }, { deep: true });
async function setDraft(p) { if (!p) return; saved.value = JSON.stringify(library.value.find((x) => x.id === p.id) || null); draft.value = clone(p); }
function undo() { visualCanvas.value?.undo(); }
function redo() { visualCanvas.value?.redo(); }
function canvasChanged(state) { const clean = !dirty.value; draft.value.blocks = state.blocks; draft.value.procedures = state.procedures; draft.value.workspace = state.workspace; if (state.initial && clean) saved.value = JSON.stringify(draft.value); }
function syncCanvas() { if (!visualCanvas.value) throw new Error('画布正在加载，请稍候'); Object.assign(draft.value, visualCanvas.value.flush()); }
onMounted(async () => {
  try {
    library.value = await api.listPrograms();
    let cached;
    try { cached = JSON.parse(localStorage.getItem('program-draft')); } catch { /* recover from invalid local draft */ }
    if (cached?.version === 1 && Array.isArray(cached.blocks) && Array.isArray(cached.devices) && Array.isArray(cached.parameters)) await setDraft(cached);
    else if (library.value.length) await setDraft(library.value[0]);
  } catch (e) { loadError.value = e.message; }
});
async function save() {
  try { syncCanvas(); const p = await api.saveProgram(clone(draft.value)); library.value = await api.listPrograms(); saved.value = JSON.stringify(p); toast('程序已保存', 'success'); return true; }
  catch (e) { toast(e.message, 'error'); return false; }
}
const switchTarget = ref(null);
function select(p) { if (!p) return; if (p.id === draft.value?.id) return; if (draft.value && dirty.value) switchTarget.value = p; else setDraft(p); }
async function discardSwitch() { const target = switchTarget.value; switchTarget.value = null; await setDraft(target); }
async function saveSwitch() { if (await save()) await discardSwitch(); }
async function create(example) { const p = await run(() => api.newProgram(example)); if (!p || p === true) return; p.id = crypto.randomUUID(); if (example) p.name += ' · 副本'; select(p); }
async function importProgram() { const p = await run(() => api.importProgram()); if (p && p !== true) { library.value = await api.listPrograms(); select(p); } }
const exportProgram = () => run(() => { syncCanvas(); return api.exportProgram(clone(draft.value)); });
async function copyProgram() { const p = clone(draft.value); p.id = crypto.randomUUID(); p.name += ' · 副本'; select(p); }
const deleting = ref(false);
async function remove() { const ok = await run(() => api.removeProgram(draft.value.id)); if (ok) { deleting.value = false; library.value = await api.listPrograms(); localStorage.removeItem('program-draft'); if (library.value.length) await setDraft(library.value[0]); else { draft.value = null; saved.value = 'null'; } } }
function addRole() { let i = 2; while (draft.value.devices.some((d) => d.key === `device${i}`)) i++; draft.value.devices.push({ key: `device${i}`, label: `电源 ${i}` }); }
function addParameter() { let i = 1; while (draft.value.parameters.some((p) => p.key === `param${i}`)) i++; draft.value.parameters.push({ key: `param${i}`, label: `参数 ${i}`, unit: '', min: 0, max: 100, default: null }); }
const starting = ref(false), startBusy = ref(false), startError = ref(''), bindings = reactive({}), parameters = reactive({});
async function prepareStart() {
  try { syncCanvas(); await api.validateProgram(clone(draft.value)); } catch (e) { toast(e.message, 'error'); return; }
  for (const key of Object.keys(bindings)) delete bindings[key];
  for (const key of Object.keys(parameters)) delete parameters[key];
  const available = store.devices.filter((d) => d.status === 'online' && d.writable && !deviceProgram(d.id));
  draft.value.devices.forEach((d, i) => { bindings[d.key] = available[i]?.id || ''; });
  for (const p of draft.value.parameters) parameters[p.key] = p.default === null ? '' : p.default;
  startError.value = ''; starting.value = true;
}
async function start() {
  startError.value = ''; startBusy.value = true;
  try {
    const values = {};
    for (const p of draft.value.parameters) { if (parameters[p.key] === '') throw new Error(`请填写${p.label}`); values[p.key] = Number(parameters[p.key]); }
    const s = await api.startProgram(clone(draft.value), clone(bindings), values); upsertRun(s); starting.value = false; tab.value = 'run'; inspectorOpen.value = true;
  } catch (e) { startError.value = e.message; }
  finally { startBusy.value = false; }
}
async function stop() { await run(() => api.stopProgram(currentRun.value.id)); }
function boundDevice(role) { return store.devices.find((d) => d.id === currentRun.value?.bindings[role.key]); }
async function openRun(r) { const p = await run(() => api.runProgram(r.id)); if (p && p !== true) select(p); }
const now = ref(Date.now()); const ticker = setInterval(() => now.value = Date.now(), 1000); onBeforeUnmount(() => clearInterval(ticker));
const elapsed = computed(() => currentRun.value ? duration((currentRun.value.endedAt || now.value) - currentRun.value.startedAt) : '');
const logBox = ref(null); watch(() => currentRun.value?.logs.length, async () => { await nextTick(); if (logBox.value) logBox.value.scrollTop = logBox.value.scrollHeight; });
</script>
<style scoped>
.program-view { display: flex; flex-direction: column; height: 100%; min-height: 650px; padding: 22px 24px 24px; gap: 20px; }
.page-head { display: flex; justify-content: space-between; align-items: center; gap: 18px; }
.eyebrow { display: flex; align-items: center; gap: 6px; color: var(--primary); font: 10px 'JetBrains Mono', monospace; letter-spacing: 2px; margin-bottom: 5px; }
.eyebrow svg { width: 13px; height: 13px; }
h1 { margin: 0; font-size: 25px; font-weight: 600; } .page-head p { margin: 5px 0 0; font-size: 12px; } .head-actions { display: flex; gap: 8px; }
.workspace { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
.side-label { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--text-2); font-size: 11px; font-weight: 600; padding: 0 4px; margin-bottom: 12px; } .side-label > span { color: var(--text-3); font-weight: 400; font-size: 10px; }
.workspace.with-inspector { grid-template-columns: minmax(0, 1fr) 250px; }
.editor { display: flex; flex-direction: column; min-height: 0; min-width: 0; overflow: hidden; }
.editor-head { display: flex; align-items: center; gap: 8px; justify-content: space-between; padding: 14px 16px 8px; flex-wrap: wrap; } .program-title { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 100px; } .program-title input { display: none; border: 0; outline: none; color: var(--text); background: transparent; font: inherit; font-size: 15px; font-weight: 600; min-width: 70px; width: 100%; user-select: text; } .program-title .badge { font-size: 9px; padding: 0 6px; height: 21px; flex: none; }
.editor-actions { display: flex; gap: 5px; } .editor-actions .btn { padding: 0 9px; } .editor-actions .btn.icon { padding: 0; width: 24px; }
.editor-caption { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 6px; font-size: 10px; color: var(--text-3); padding: 0 16px 13px; border-bottom: 1px solid var(--border-strong); }
.follow { display: flex; align-items: center; gap: 4px; } .follow input { margin: 0; width: 11px; height: 11px; accent-color: var(--primary); }
.inspector { display: flex; flex-direction: column; padding: 16px 14px; overflow-y: auto; min-width: 0; } .inspector-tabs { align-self: center; flex: none; margin-bottom: 22px; } .inspector-tabs button { padding: 0 16px; font-size: 11px; }
.run-status { display: flex; align-items: center; gap: 8px; margin: 0 4px 16px; font-size: 13px; } .run-status > span:last-child:not(.dot) { margin-left: auto; font-size: 11px; } .run-status.failed { color: var(--danger); }
.stop-btn { flex: none; margin-bottom: 18px; font-size: 12px; }
.monitor-device { border: 1px solid var(--border-strong); border-radius: 10px; padding: 11px; margin-bottom: 12px; } .monitor-device > div:first-child { display: flex; align-items: center; justify-content: space-between; gap: 6px; font-size: 10px; color: var(--text-2); } .monitor-device .badge { font-size: 9px; height: 20px; padding: 0 5px; max-width: 125px; overflow: hidden; }
.telemetry { display: flex; gap: 6px; justify-content: space-between; margin-top: 12px; font-size: 13px; } .telemetry small { font-size: 9px; }
.inspector-note { color: var(--text-3); font-size: 11px; line-height: 1.8; margin: 0 4px 24px; }
.variables { margin: 8px 0 20px; } .variables > div:not(.side-label) { display: flex; justify-content: space-between; margin: 6px 4px; font-size: 11px; color: var(--text-2); } .variables b { color: var(--primary); font-weight: 500; }
.variables > .list-state { flex-direction: column; gap: 6px; padding: 6px 0; } .list-state small { color: var(--text-3); overflow-wrap: anywhere; }
.run-logs { overflow-y: auto; min-height: 110px; max-height: 360px; flex: 1; } .run-logs > div { display: flex; flex-direction: column; gap: 3px; border-bottom: 1px solid var(--border-strong); padding: 8px 4px; font-size: 11px; overflow-wrap: anywhere; } .run-logs time { font-size: 9px; color: var(--text-3); } .run-logs .error { color: var(--danger); }
.run-error, .error-banner { font-size: 12px; line-height: 1.7; color: var(--on-danger-container); background: var(--danger-container); padding: 10px 12px; border-radius: 10px; overflow-wrap: anywhere; }
.program-settings { border: 0; margin: 0; padding: 0; min-width: 0; display: flex; flex-direction: column; gap: 14px; } .program-settings textarea { height: auto; resize: vertical; padding: 9px; min-height: 70px; } .program-settings .side-label { margin: 6px 0 0; } .program-settings .input { width: 100%; }
.role-field { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; } .role-field .input { flex: 1; width: 90px; } .role-field > span { width: 100%; font-size: 9px; padding-left: 5px; }
.parameter-card { padding: 10px; border: 1px solid var(--border-strong); border-radius: 10px; display: flex; flex-direction: column; gap: 10px; } .param-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; } .checkbox { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--text-2); }
.launch-description { margin: 0 0 18px; font-size: 13px; } .launch-fields { display: flex; flex-direction: column; gap: 16px; } .launch-note { font-size: 12px; color: var(--text-2); line-height: 1.8; background: var(--secondary-container); border-radius: 10px; padding: 12px; margin-top: 20px; } .launch-note svg { width: 16px; height: 16px; vertical-align: middle; margin-right: 5px; color: var(--primary); } .battery-note { font-size: 11px; color: var(--text-2); line-height: 1.8; }
.blank { padding: 60px; display: flex; flex-direction: column; align-items: center; gap: 14px; } .blank > svg { color: var(--primary); }
.other-run { display: flex; align-items: center; gap: 8px; background: transparent; border: 0; color: var(--primary); padding: 10px 4px; text-align: left; cursor: pointer; } .other-run .dot { width: 6px; height: 6px; }
@media (max-width: 1280px) { .program-view { padding: 18px 16px; } .workspace { gap: 10px; } .workspace.with-inspector { grid-template-columns: minmax(0, 1fr) 225px; } .page-head p { max-width: 360px; } .head-actions { gap: 5px; } .head-actions .btn { padding: 0 12px; } .telemetry { font-size: 11px; } }
</style>

<style scoped>
.example-select { height: 36px; border-radius: 18px; color: var(--primary); padding: 0 14px; font-size: 12px; max-width: 160px; }
.program-picker { width: 200px; height: 30px; border-color: transparent; font-size: 14px; font-weight: 600; padding-left: 0; }
</style>
