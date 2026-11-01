<template>
  <section class="panel presets">
    <div class="panel-title"><Bookmark />预设 M1–M9</div>
    <div v-if="slots.length" class="grid">
      <div
        v-for="s in slots"
        :key="s.n"
        class="slot"
        :class="{ match: s.match, disabled: !canWrite }"
        role="button"
        :title="canWrite ? `调用 M${s.n}` : ''"
        @click="recall(s.n)"
      >
        <span class="slot-n">M{{ s.n }}</span>
        <span class="mono volt">{{ fmt(s.v, vd) }}<small>V</small></span>
        <span class="mono curr">{{ fmt(s.i, id) }}<small>A</small></span>
        <button v-if="canWrite" class="save" title="用当前设定覆盖此预设" @click.stop="saving = s.n"><Save /></button>
      </div>
    </div>
    <div v-else class="faint loading">读取预设中…</div>

    <Modal v-if="saving" title="覆盖预设" @close="saving = 0">
      <p class="muted">
        将 M{{ saving }} 改为当前设定
        <b class="mono volt">{{ fmt(device.live?.setV, vd) }} V</b> /
        <b class="mono curr">{{ fmt(device.live?.setI, id) }} A</b>？原有数值会被覆盖。
      </p>
      <template #footer>
        <button class="btn" @click="saving = 0">取消</button>
        <button class="btn primary" @click="save">覆盖</button>
      </template>
    </Modal>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue';
import { Bookmark, Save } from '@lucide/vue';
import Modal from './Modal.vue';
import { api, run } from '../store.js';
import { digits, fmt } from '../format.js';

const props = defineProps({ device: { type: Object, required: true }, canWrite: Boolean });
const saving = ref(0);
const vd = computed(() => digits(props.device.vScale));
const id = computed(() => digits(props.device.iScale));
const slots = computed(() => {
  const list = props.device.presets || [];
  const live = props.device.live;
  return list.slice(1, 10).map((p, k) => ({
    n: k + 1,
    ...p,
    match: !!live && Math.abs(p.v - live.setV) < 1e-6 && Math.abs(p.i - live.setI) < 1e-6,
  }));
});

function recall(n) {
  if (!props.canWrite) return;
  const p = slots.value[n - 1];
  run(() => api.recallPreset(props.device.id, n), `已调用 M${n}：${fmt(p.v, vd.value)} V / ${fmt(p.i, id.value)} A`);
}

async function save() {
  const n = saving.value;
  saving.value = 0;
  const live = props.device.live;
  if (!live) return;
  await run(() => api.savePreset(props.device.id, n, live.setV, live.setI), `M${n} 已保存`);
}
</script>

<style scoped>
.presets {
  padding: 16px 18px 18px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 12px;
}
.slot {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 8px 10px;
  border-radius: 12px;
  border: 1px solid transparent;
  background: var(--panel-2);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
  font-size: 13px;
}
.slot:hover:not(.disabled) {
  background: var(--panel-hover);
}
.slot.disabled {
  cursor: default;
}
.slot.match {
  border-color: var(--primary);
  background: var(--secondary-container);
}
.slot-n {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-3);
  margin-bottom: 2px;
}
.slot.match .slot-n {
  color: var(--primary);
}
.slot small {
  font-size: 10px;
  margin-left: 2px;
  opacity: 0.7;
}
.save {
  position: absolute;
  top: 5px;
  right: 5px;
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s, background 0.15s;
}
.save svg {
  width: 14px;
  height: 14px;
}
.slot:hover .save {
  opacity: 1;
}
.save:hover {
  background: var(--border-strong);
  color: var(--text);
}
.loading {
  padding: 16px 0 4px;
  font-size: 13px;
}
p {
  margin: 0;
  line-height: 1.7;
}
</style>
