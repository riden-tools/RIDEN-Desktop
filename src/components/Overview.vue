<template>
  <div class="view">
    <header class="head">
      <div>
        <h1>总览</h1>
        <div class="faint sub">{{ store.devices.length }} 台设备 · {{ online }} 台在线 · {{ outputs }} 路输出中</div>
      </div>
      <div class="totals">
        <div class="total"><em>总功率</em><span class="mono power">{{ totalP.toFixed(2) }}</span><i>W</i></div>
        <div class="total"><em>总能量</em><span class="mono">{{ totalWh.toFixed(3) }}</span><i>Wh</i></div>
        <button class="btn primary" @click="$emit('add')"><Plus />添加设备</button>
      </div>
    </header>

    <div v-if="!store.devices.length" class="welcome panel">
      <img class="w-icon" :src="logo" alt="" />
      <h2>连接你的第一台 RIDEN 电源</h2>
      <p class="muted">通过 USB 串口连接 RD6006 / RD6012 / RD6018 / RD6024 / RD6030 / RK8009 等型号，可同时管理多台设备。</p>
      <button class="btn primary lg" @click="$emit('add')"><Plus />添加设备</button>
    </div>

    <template v-else>
      <div class="cards">
        <article v-for="(d, k) in store.devices" :key="d.id" class="panel card" @click="store.selected = d.id">
          <div class="c-head">
            <span class="dot" :class="STATUS[d.status]?.cls" />
            <span class="swatch" :style="{ background: seriesColor(k) }" />
            <span class="c-name">{{ d.config.name }}</span>
            <span class="faint c-model">{{ d.modelName }}</span>
            <span v-if="d.live?.output && d.status === 'online'" class="badge" :class="d.live.cc ? 'cc' : 'cv'">{{ d.live.cc ? 'CC' : 'CV' }}</span>
            <button
              class="mini-out"
              :class="{ on: d.live?.output }"
              :disabled="!d.writable || d.status !== 'online'"
              :title="d.live?.output ? '关闭输出' : '打开输出'"
              @click.stop="run(() => api.setOutput(d.id, !d.live?.output))"
            >
              <Power />
            </button>
          </div>
          <div v-if="d.live && d.status === 'online'" class="c-read mono">
            <div><span class="volt">{{ fmt(d.live.v, digits(d.vScale)) }}</span><small>V</small></div>
            <div><span class="curr">{{ fmt(d.live.i, digits(d.iScale)) }}</span><small>A</small></div>
            <div><span class="power">{{ fmt(d.live.p, powerDigits(d.live.p)) }}</span><small>W</small></div>
          </div>
          <div v-else class="c-offline" :class="STATUS[d.status]?.cls">
            {{ STATUS[d.status]?.text }}<span v-if="d.error" class="faint"> · {{ d.error }}</span>
          </div>
          <div class="c-set faint">
            <span>设定 <b class="mono">{{ fmt(d.live?.setV, digits(d.vScale)) }} V</b></span>
            <span>限流 <b class="mono">{{ fmt(d.live?.setI, digits(d.iScale)) }} A</b></span>
            <span class="mono">{{ deviceSubtitle(d) }}</span>
          </div>
          <Sparkline :id="d.id" field="p" color="power" />
        </article>
      </div>
      <CompareChart />
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { Plus, Power } from '@lucide/vue';
import logo from '../assets/logo.png';
import Sparkline from './Sparkline.vue';
import CompareChart from './CompareChart.vue';
import { store, api, run } from '../store.js';
import { seriesColor } from '../charts.js';
import { STATUS, fmt, digits, powerDigits, deviceSubtitle } from '../format.js';

defineEmits(['add']);

const online = computed(() => store.devices.filter((d) => d.status === 'online').length);
const outputs = computed(() => store.devices.filter((d) => d.live?.output).length);
const totalP = computed(() => store.devices.reduce((s, d) => s + (d.status === 'online' && d.live ? d.live.p : 0), 0));
const totalWh = computed(() => store.devices.reduce((s, d) => s + (d.stats?.wh || 0), 0));
</script>

<style scoped>
.view {
  padding: 20px 24px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
h1 {
  margin: 0;
  font-size: 22px;
}
.sub {
  font-size: 13px;
  margin-top: 2px;
}
.totals {
  display: flex;
  align-items: center;
  gap: 24px;
}
.total {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.total em {
  font-style: normal;
  font-size: 12px;
  color: var(--text-3);
}
.total span {
  font-size: 22px;
  font-weight: 500;
}
.total i {
  font-style: normal;
  font-size: 12px;
  color: var(--text-3);
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 14px;
}
.card {
  padding: 14px 16px 10px;
  cursor: pointer;
  transition: border-color 0.15s, transform 0.15s;
}
.card:hover {
  background: var(--panel-2);
}
.c-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.swatch {
  width: 4px;
  height: 14px;
  border-radius: 2px;
}
.c-name {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.c-model {
  font-size: 12px;
  margin-right: auto;
}
.mini-out {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1.5px solid var(--border-strong);
  background: var(--panel-2);
  color: var(--text-3);
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: all 0.15s;
}
.mini-out svg {
  width: 15px;
  height: 15px;
}
.mini-out:hover:not(:disabled) {
  border-color: var(--ok);
  color: var(--ok);
}
.mini-out.on {
  background: var(--ok);
  border-color: var(--ok);
  color: var(--on-ok);
}
.mini-out:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.c-read {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  margin: 12px 0 6px;
}
.c-read span {
  font-size: 26px;
  font-weight: 500;
  letter-spacing: -0.02em;
}
.c-read small {
  font-size: 12px;
  color: var(--text-3);
  margin-left: 3px;
}
.c-offline {
  margin: 14px 0 10px;
  font-size: 14px;
  min-height: 30px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.c-offline.err {
  color: var(--danger);
}
.c-offline.warn {
  color: var(--warn);
}
.c-set {
  display: flex;
  gap: 14px;
  font-size: 12px;
  margin-bottom: 6px;
}
.c-set b {
  font-weight: 500;
  color: var(--text-2);
}
.c-set span:last-child {
  margin-left: auto;
}
.welcome {
  margin: 40px auto;
  max-width: 560px;
  padding: 44px 40px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.w-icon {
  width: 80px;
  height: 80px;
  border-radius: 20px;
}
.welcome h2 {
  margin: 20px 0 8px;
  font-size: 20px;
}
.welcome p {
  margin: 0 0 24px;
  line-height: 1.7;
}
.btn.lg {
  height: 42px;
  padding: 0 22px;
  font-size: 14px;
}
</style>
