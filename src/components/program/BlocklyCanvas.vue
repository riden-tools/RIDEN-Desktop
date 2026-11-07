<template>
  <div class="scratch-editor">
    <div class="canvas-toolbar"><span><MousePointer2 />拖拽积木，吸附拼接；数值和条件直接嵌入槽位</span><div><button class="btn ghost sm" :disabled="disabled" @click="workspace?.undo(false)" title="撤销（Ctrl+Z）"><Undo2 /></button><button class="btn ghost sm" :disabled="disabled" @click="workspace?.undo(true)" title="重做（Ctrl+Y）"><Redo2 /></button><button class="btn ghost sm" :disabled="disabled" @click="tidy"><AlignStartVertical />整理</button><button class="btn ghost sm" @click="fit"><Maximize2 />居中</button></div></div>
    <div ref="host" class="blockly-host" :class="{ 'is-running': disabled }"><div v-if="!program.blocks.length" class="empty-guide"><strong>像拼积木一样，搭出你的流程</strong><span>① 点击左侧分类，拖出积木</span><span>② 接到「当点击 ▶ 运行」下面</span><span>③ 把读数和条件放进对应形状的槽里</span></div></div>
    <div class="canvas-foot" :class="{ invalid: error }"><span>{{ error || '从「当点击 ▶ 运行」开始 · 未连接的积木不会执行' }}</span><span v-if="progressText" class="hold-badge mono">{{ progressText }}</span><span v-else>滚轮缩放 · 拖动空白平移</span></div>
  </div>
  <Modal v-if="prompt" :title="prompt.title || (prompt.kind === 'prompt' ? '变量名称' : '确认')" @close="answer(null)">
    <p class="muted">{{ prompt.message }}</p>
    <input v-if="prompt.kind === 'prompt'" v-model="prompt.value" class="input" aria-label="变量名称" maxlength="40" @keydown.enter="answer(prompt.value)" />
    <template #footer><button class="btn" @click="answer(null)">取消</button><button class="btn primary" @click="answer(prompt.kind === 'prompt' ? prompt.value : true)">确定</button></template>
  </Modal>
</template>
<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { MousePointer2, Undo2, Redo2, AlignStartVertical, Maximize2 } from '@lucide/vue';
import { store } from '../../store.js';
import { Blockly, toolbox, theme } from '../../program/blocks.mjs';
import { programWorkspace, workspaceDefinition } from '../../program/codec.mjs';
import Modal from '../Modal.vue';
const props = defineProps({ program: Object, disabled: Boolean, active: Array, progress: Object, follow: Boolean });
const emit = defineEmits(['change']);
const host = ref(null), error = ref(''), prompt = ref(null);
let workspace, observer, loading = true, locked = false, firstSerialization = true;
const progressText = computed(() => { const id = props.active?.findLast((id) => props.progress?.[id]); const p = props.progress?.[id]; return p ? `条件持续 ${p.held.toFixed(1)} / ${p.hold} s` : ''; });
function context() { workspace.ridenDevices = props.program.devices; workspace.ridenParameters = props.program.parameters; workspace.ridenProcedures = props.program.procedures || []; }
function serialize() {
  if (!workspace || loading) return;
  workspace.ridenProcedures = workspace.getAllBlocks(false).filter((b) => b.type === 'riden_define').map((b) => ({ name: b.getFieldValue('NAME') }));
  let blocks = [], procedures = [], problem = '';
  try { ({ blocks, procedures } = workspaceDefinition(workspace)); } catch (e) { problem = e.message; }
  error.value = problem;
  emit('change', { blocks, procedures, workspace: Blockly.serialization.workspaces.save(workspace), error: problem, initial: firstSerialization });
  firstSerialization = false;
}
function flush() { const result = workspaceDefinition(workspace); if (!result.blocks.length) throw new Error('请将动作积木接在「当点击 ▶ 运行」下面'); return { ...result, workspace: Blockly.serialization.workspaces.save(workspace) }; }
function fit() { workspace?.zoomToFit(); if (workspace?.scale > 0.85) workspace.setScale(0.85); workspace?.scrollCenter(); }
function tidy() { workspace?.cleanUp(); fit(); }
function answer(value) { const p = prompt.value; prompt.value = null; if (p) p.callback(p.kind === 'confirm' ? !!value : value); }
function lock(value) {
  if (!workspace || locked === value) return;
  locked = value;
  Blockly.Events.disable();
  try { for (const b of workspace.getAllBlocks(false)) { b.setEditable(!value); b.setMovable(!value); b.setDeletable(!value); } }
  finally { Blockly.Events.enable(); }
  host.value?.classList.toggle('is-running', value);
}
onMounted(async () => {
  Blockly.dialog.setPrompt((message, value, callback) => { prompt.value = { kind: 'prompt', message, value, callback }; });
  Blockly.dialog.setConfirm((message, callback) => { prompt.value = { kind: 'confirm', message, callback }; });
  workspace = Blockly.inject(host.value, { renderer: 'zelos', theme: theme(store.theme === 'dark'), toolbox,
    media: new URL('blockly-media/', new URL(import.meta.env.BASE_URL, document.baseURI)).href,
    sounds: false, trashcan: true, grid: { spacing: 22, length: 2, colour: getComputedStyle(document.documentElement).getPropertyValue('--border-strong').trim(), snap: false },
    zoom: { controls: true, wheel: true, startScale: 0.8, maxScale: 1.6, minScale: 0.3, scaleSpeed: 1.1 },
    move: { scrollbars: true, drag: true, wheel: true }, maxBlocks: 1200,
  });
  context();
  workspace.registerToolboxCategoryCallback('RIDEN_PROCEDURES', () => {
    const names = [...new Set(workspace.getAllBlocks(false).filter((b) => b.type === 'riden_define').map((b) => b.getFieldValue('NAME')))];
    return [{ kind: 'button', text: '新建自定义积木', callbackKey: 'RIDEN_NEW_PROCEDURE' }, ...names.map((name) => ({ kind: 'block', type: 'riden_call', fields: { NAME: name } }))];
  });
  workspace.registerButtonCallback('RIDEN_NEW_PROCEDURE', () => {
    if (locked) return;
    let n = 1; const used = workspace.getAllBlocks(false).filter((b) => b.type === 'riden_define').map((b) => b.getFieldValue('NAME'));
    while (used.includes(`自定义动作 ${n}`)) n++;
    prompt.value = { kind: 'prompt', title: '自定义积木名称', message: '给这组可重复调用的动作起一个名字', value: `自定义动作 ${n}`, callback: (name) => {
      if (!name?.trim() || locked) return;
      if (used.includes(name.trim())) { error.value = '自定义积木名称已存在'; return; }
      Blockly.Events.setGroup(true);
      try {
        const b = workspace.newBlock('riden_define'); b.setFieldValue(name.trim(), 'NAME'); b.initSvg(); b.render();
        const metrics = workspace.getMetrics(); b.moveBy(metrics.viewLeft / workspace.scale + 120, metrics.viewTop / workspace.scale + 100);
        workspace.centerOnBlock(b.id, true);
      } finally { Blockly.Events.setGroup(false); }
    } };
  });
  try { Blockly.serialization.workspaces.load(props.program.workspace || programWorkspace(props.program), workspace); }
  catch { workspace.clear(); Blockly.serialization.workspaces.load(programWorkspace(props.program), workspace); }
  workspace.clearUndo();
  workspace.addChangeListener((e) => {
    if (e.isUiEvent || loading || locked) return;
    if (e.type === Blockly.Events.BLOCK_CHANGE && e.element === 'field' && e.name === 'NAME' && workspace.getBlockById(e.blockId)?.type === 'riden_define') {
      const calls = workspace.getAllBlocks(false).filter((b) => b.type === 'riden_call' && b.getFieldValue('NAME') === e.oldValue);
      for (const b of calls) { const field = b.getField('NAME'); field.getOptions(false); field.setValue(e.newValue); }
    }
    serialize();
  });
  observer = new ResizeObserver(() => Blockly.svgResize(workspace)); observer.observe(host.value);
  await nextTick();
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  Blockly.svgResize(workspace);
  workspace.setScale(0.75);
  const start = workspace.getAllBlocks(false).find((b) => b.type === 'riden_start');
  if (start) { const xy = start.getRelativeToSurfaceXY(); workspace.scroll(32 - xy.x * workspace.scale, 35 - xy.y * workspace.scale, false); }
  loading = false;
  serialize();
  lock(props.disabled);
});
watch(() => [store.theme, store.seed], () => { if (workspace) workspace.setTheme(theme(store.theme === 'dark')); });
watch(() => [JSON.stringify(props.program.devices), JSON.stringify(props.program.parameters)], () => {
  if (!workspace) return;
  context();
  Blockly.Events.disable();
  try { for (const b of workspace.getAllBlocks(false)) for (const name of ['DEVICE', ...(b.type === 'riden_param' ? ['NAME'] : [])]) { const field = b.getField(name); if (field?.setOptions) { const value = field.getValue(); field.getOptions(false); field.setValue(value); field.forceRerender(); } } }
  finally { Blockly.Events.enable(); }
});
watch(() => props.disabled, lock);
watch(() => props.active?.join(','), () => {
  if (!workspace) return;
  workspace.highlightBlock(null);
  for (const id of props.active || []) workspace.highlightBlock(id, true);
  if (props.follow && props.disabled && props.active?.length) workspace.centerOnBlock(props.active.at(-1), true);
});
onBeforeUnmount(() => { answer(null); observer?.disconnect(); workspace?.dispose(); });
defineExpose({ flush, undo: () => workspace?.undo(false), redo: () => workspace?.undo(true), fit });
</script>
<style scoped>
.scratch-editor { display: flex; flex-direction: column; flex: 1; min-height: 0; min-width: 0; }
.canvas-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 7px 12px; border-bottom: 1px solid var(--border-strong); }
.canvas-toolbar > span { color: var(--text-3); font-size: 10px; display: flex; align-items: center; gap: 5px; }
.canvas-toolbar > span svg { width: 12px; height: 12px; }
.canvas-toolbar > div { display: flex; gap: 3px; } .canvas-toolbar .btn { font-size: 10px; padding: 0 7px; height: 27px; } .canvas-toolbar .btn svg { width: 13px; height: 13px; }
.blockly-host { flex: 1; position: relative; isolation: isolate; z-index: 0; min-height: 280px; min-width: 0; }
.empty-guide { position: absolute; z-index: 1; top: 150px; left: max(150px, 28%); display: flex; flex-direction: column; gap: 12px; color: var(--text-3); pointer-events: none; font-size: 12px; } .empty-guide strong { color: var(--text-2); font-size: 15px; font-weight: 500; margin-bottom: 4px; }
.blockly-host :deep(.blocklySvg) { position: absolute; inset: 0; border: 0; }
.blockly-host :deep(.blocklyToolbox) { padding: 10px 0; background: var(--panel); border-right: 1px solid var(--border-strong); }
.blockly-host :deep(.blocklyToolboxCategory) { height: 43px; line-height: 43px; padding: 0 14px 0 10px; margin-bottom: 4px; border-radius: 9px; }
.blockly-host :deep(.blocklyToolboxCategoryLabel) { font-family: inherit; font-size: 12px; padding: 0 8px; }
.blockly-host :deep(.blocklyFlyoutBackground) { fill: var(--panel-2); fill-opacity: 1; }
.blockly-host :deep(.blocklyMainBackground) { stroke: none; }
.blockly-host.is-running :deep(.blocklyToolbox), .blockly-host.is-running :deep(.blocklyFlyout) { pointer-events: none; opacity: 0.6; }
.canvas-foot { display: flex; justify-content: space-between; gap: 10px; padding: 9px 14px; color: var(--text-3); font-size: 10px; border-top: 1px solid var(--border-strong); flex-wrap: wrap; }
.canvas-foot.invalid { color: var(--warn); }
.hold-badge { color: var(--primary); }
</style>
