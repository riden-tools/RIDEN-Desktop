<template>
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
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { api, run, toast } from '../store.js';
import { digits, fmt } from '../format.js';

const props = defineProps({ device: { type: Object, required: true }, canWrite: Boolean });
const vd = computed(() => digits(props.device.vScale));
const id = computed(() => digits(props.device.iScale));
const activeSlot = computed(() => props.device.live?.activeSlot ?? null);
const protection = computed(() => props.device.protection);
const ovp = ref('');
const ocp = ref('');
const dirty = ref(false);

watch(
  [activeSlot, protection],
  ([slot, p], previous) => {
    if (previous && slot !== previous[0]) dirty.value = false;
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
.prot {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  align-items: end;
  gap: 10px;
  margin: 0;
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
</style>
