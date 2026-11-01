<template>
  <div class="sp" :class="[color, { dirty, disabled }]">
    <div class="sp-head">
      <span class="sp-label">{{ label }}</span>
      <span class="faint">上限 {{ fmt(max, decimals) }} {{ unit }}</span>
    </div>
    <div class="sp-row">
      <button class="btn icon" :disabled="disabled" title="减小" @click="step(-1)"><Minus /></button>
      <label class="sp-input">
        <input
          ref="input"
          v-model="draft"
          class="mono"
          inputmode="decimal"
          :disabled="disabled"
          @focus="focused = true"
          @blur="onBlur"
          @input="dirty = true"
          @keydown.enter.prevent="commit()"
          @keydown.esc.prevent="revert"
          @keydown.up.prevent="step(1)"
          @keydown.down.prevent="step(-1)"
          @wheel="onWheel"
        />
        <span class="unit">{{ unit }}</span>
      </label>
      <button class="btn icon" :disabled="disabled" title="增大" @click="step(1)"><Plus /></button>
    </div>
    <div class="sp-foot">
      <div class="segmented">
        <button v-for="s in steps" :key="s" :class="{ active: stepSize === s }" :disabled="disabled" @click="stepSize = s">
          ±{{ s }}
        </button>
      </div>
      <div v-if="dirty" class="sp-actions">
        <button class="btn sm ghost" @click="revert">撤销</button>
        <button class="btn sm primary" :disabled="busy" @click="commit()">应用</button>
      </div>
      <span v-else class="faint hint">回车应用 · ↑↓ 微调</span>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { Minus, Plus } from '@lucide/vue';
import { fmt } from '../format.js';
import { run, toast } from '../store.js';

const props = defineProps({
  label: String,
  unit: String,
  value: Number,
  max: Number,
  decimals: Number,
  color: String,
  disabled: Boolean,
  apply: Function,
});

const input = ref(null);
const draft = ref(fmt(props.value, props.decimals));
const dirty = ref(false);
const focused = ref(false);
const busy = ref(false);
const steps = computed(() => [1, 2, 3].map((k) => Number((10 ** -(props.decimals - k + 1)).toFixed(props.decimals))));
const stepSize = ref(steps.value[1]);
let hold = 0;
let debounce = null;

function sync() {
  if (dirty.value || focused.value || Date.now() < hold) return;
  draft.value = fmt(props.value, props.decimals);
}
watch(() => [props.value, props.decimals], sync);

function onBlur() {
  focused.value = false;
  sync();
}

function revert() {
  dirty.value = false;
  clearTimeout(debounce);
  hold = 0;
  draft.value = fmt(props.value, props.decimals);
  input.value?.blur();
}

async function commit() {
  clearTimeout(debounce);
  const n = Number(String(draft.value).trim());
  if (!String(draft.value).trim() || !Number.isFinite(n) || n < 0 || n > props.max) {
    toast(`请输入 0 – ${fmt(props.max, props.decimals)} ${props.unit} 之间的数值`, 'error');
    return;
  }
  const value = Number(n.toFixed(props.decimals));
  draft.value = value.toFixed(props.decimals);
  dirty.value = false;
  // 设备回读之前保持输入框显示新值，避免闪回旧值。
  hold = Date.now() + 1500;
  setTimeout(sync, 1600);
  busy.value = true;
  const ok = await run(() => props.apply(value));
  busy.value = false;
  if (!ok) {
    hold = 0;
    sync();
  }
}

function step(dir) {
  if (props.disabled) return;
  const base = Number(draft.value);
  const next = Math.min(props.max, Math.max(0, (Number.isFinite(base) ? base : props.value) + dir * stepSize.value));
  draft.value = next.toFixed(props.decimals);
  dirty.value = true;
  clearTimeout(debounce);
  debounce = setTimeout(commit, 350);
}

function onWheel(e) {
  if (!focused.value) return;
  e.preventDefault();
  step(e.deltaY < 0 ? 1 : -1);
}
</script>

<style scoped>
.sp {
  --c: var(--text);
}
.sp.volt {
  --c: var(--volt);
}
.sp.curr {
  --c: var(--curr);
}
.sp-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 12px;
  margin-bottom: 8px;
}
.sp-label {
  font-weight: 600;
  font-size: 13px;
  color: var(--text-2);
}
.sp-row {
  display: flex;
  gap: 8px;
}
.sp-row .btn {
  height: 48px;
  width: 48px;
  border-radius: 12px;
}
.sp-row .btn,
.sp-input {
  height: 48px;
}
.sp-input {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  height: 44px;
  padding: 0 14px;
  border-radius: 12px;
  border: 1px solid var(--outline);
  background: transparent;
  transition: border-color 0.15s, box-shadow 0.15s;
  cursor: text;
}
.sp-input:focus-within {
  border-color: var(--c);
  box-shadow: inset 0 0 0 1px var(--c);
}
.dirty .sp-input {
  border-color: var(--primary);
}
.sp-input input {
  flex: 1;
  width: 100%;
  min-width: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--c);
  font-size: 22px;
  font-weight: 500;
  text-align: right;
}
.sp-input .unit {
  margin-left: 8px;
  color: var(--text-3);
  font-weight: 500;
}
.disabled .sp-input {
  opacity: 0.5;
}
.sp-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
  min-height: 32px;
}
.sp-foot .segmented button {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  padding: 0 8px;
}
.sp-actions {
  display: flex;
  gap: 6px;
}
.hint {
  font-size: 11px;
}
</style>
