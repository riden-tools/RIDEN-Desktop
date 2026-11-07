<template>
  <Modal v-if="pendingRun && !dismissed.includes(pendingRun.pending.id)" title="确认电池与串数" width="500px" @close="dismissed.push(pendingRun.pending.id)">
    <div class="battery-identity"><BatteryCharging /><div><b>{{ pendingRun.pending.name }}</b><span>{{ pendingRun.name }}</span></div><strong class="mono">{{ pendingRun.pending.voltage.toFixed(2) }} <small>V</small></strong></div>
    <p class="muted">已读取电池电压。总电压无法唯一区分所有串数，请核对电池标签后确认；确认前保持输出关闭。</p>
    <p class="muted">读数来源：{{ pendingRun.pending.source === 'HR10' ? 'HR33 为零，使用输出关闭时的端电压（HR10）' : '电池电压寄存器（HR33）' }}。</p>
    <label class="field"><span>电池串数（候选）</span><select v-model="cells" class="select"><option v-for="n in pendingRun.pending.candidates" :key="n" :value="n">{{ n }} 串 · 目标 {{ (n * 4.2).toFixed(2) }} V · 当前每串 {{ (pendingRun.pending.voltage / n).toFixed(2) }} V</option></select></label>
    <div class="target"><span>充电目标</span><b class="mono volt">{{ (cells * 4.2).toFixed(2) }} V</b><b v-if="pendingRun.pending.current !== null" class="mono curr">{{ pendingRun.pending.current }} A</b></div>
    <label class="consent"><input v-model="confirmed" type="checkbox" />已核对为普通 4.2 V 锂电池，串数、极性、限流与 BMS / 均衡保护均适合本次充电。</label>
    <p v-if="error" class="error">{{ error }}</p>
    <template #footer><button class="btn" :disabled="busy" @click="stop">停止程序</button><button class="btn primary" :disabled="!confirmed || busy" @click="confirm">确认并继续</button></template>
  </Modal>
  <button v-else-if="pendingRun" class="confirmation-reminder btn tonal" @click="dismissed = []"><BatteryCharging />{{ pendingRun.pending.name }} 等待电池确认</button>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import { BatteryCharging } from '@lucide/vue';
import { store, api, run } from '../../store.js';
import Modal from '../Modal.vue';
const pendingRun = computed(() => store.programRuns.find((r) => !r.endedAt && r.pending));
const cells = ref(1), confirmed = ref(false), busy = ref(false), error = ref(''), dismissed = ref([]);
watch(() => pendingRun.value?.pending?.id, () => { cells.value = pendingRun.value?.pending?.suggested || 1; confirmed.value = false; error.value = ''; }, { immediate: true });
watch(cells, () => confirmed.value = false);
async function confirm() {
  const r = pendingRun.value; if (!r) return;
  busy.value = true; error.value = '';
  try { await api.confirmBattery(r.id, r.pending.id, cells.value); }
  catch (e) { error.value = e.message; }
  finally { busy.value = false; }
}
async function stop() { if (pendingRun.value) await run(() => api.stopProgram(pendingRun.value.id)); }
</script>
<style scoped>
.battery-identity { display: flex; align-items: center; gap: 12px; margin: 6px 0 20px; }
.battery-identity > svg { width: 32px; height: 32px; color: var(--primary); }
.battery-identity > div { display: flex; flex-direction: column; gap: 3px; font-size: 14px; }
.battery-identity span { font-size: 11px; color: var(--text-3); }
.battery-identity > strong { margin-left: auto; font-size: 24px; color: var(--volt); }
.battery-identity small { font-size: 12px; }
p { font-size: 12px; line-height: 1.8; margin: 16px 0; }
.target { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 12px; border-radius: 12px; background: var(--secondary-container); margin: 18px 0; font-size: 12px; }
.target b { font-size: 17px; }
.consent { display: flex; align-items: flex-start; gap: 9px; font-size: 12px; line-height: 1.8; color: var(--text-2); }
.consent input { margin-top: 5px; flex: none; accent-color: var(--primary); }
.error { color: var(--danger); }
.confirmation-reminder { position: fixed; right: 28px; bottom: 24px; z-index: 40; box-shadow: 0 4px 15px #0003; }
</style>
