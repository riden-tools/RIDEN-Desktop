<template>
  <aside class="sidebar">
    <div class="brand">
      <img class="logo" :src="logo" alt="" />
      <div>
        <div class="brand-name">RIDEN Desktop</div>
        <div class="brand-sub">可调电源上位机</div>
      </div>
    </div>

    <button class="nav" :class="{ active: store.selected === 'overview' }" @click="store.selected = 'overview'">
      <LayoutGrid />
      <span>总览</span>
      <span class="count">{{ onlineCount }}/{{ store.devices.length }}</span>
    </button>

    <button class="nav" :class="{ active: store.selected === 'programs' }" @click="store.selected = 'programs'">
      <Workflow /><span>编程输出</span><span v-if="running" class="badge on">{{ running }} 运行中</span>
    </button>

    <div class="section-head">
      <span>设备</span>
      <button class="btn ghost sm icon" title="添加设备" @click="$emit('add')"><Plus /></button>
    </div>

    <div class="list">
      <button
        v-for="d in store.devices"
        :key="d.id"
        class="item"
        :class="{ active: store.selected === d.id }"
        @click="store.selected = d.id"
      >
        <div class="item-top">
          <span class="dot" :class="STATUS[d.status]?.cls" />
          <span class="item-name">{{ d.config.name }}</span>
          <span v-if="d.live?.output && d.status === 'online'" class="out-pill">ON</span>
        </div>
        <div class="item-sub">
          <span>{{ d.modelName || '—' }}</span>
          <span class="faint">·</span>
          <span class="faint">{{ deviceSubtitle(d) }}</span>
        </div>
        <div v-if="d.live && d.status === 'online'" class="item-read mono">
          <span class="volt">{{ fmt(d.live.v, digits(d.vScale)) }}<small>V</small></span>
          <span class="curr">{{ fmt(d.live.i, digits(d.iScale)) }}<small>A</small></span>
          <span class="power">{{ fmt(d.live.p, powerDigits(d.live.p)) }}<small>W</small></span>
        </div>
        <div v-else class="item-read status-text" :class="STATUS[d.status]?.cls">
          {{ STATUS[d.status]?.text }}
        </div>
      </button>

      <button v-if="!store.devices.length" class="empty" @click="$emit('add')">
        <Plus />
        <span>添加第一台电源</span>
      </button>
    </div>

    <div class="footer">
      <button class="btn danger all-off" :disabled="!anyOn" title="关闭所有设备的输出" @click="allOff">
        <ZapOff />
        全部关闭输出
      </button>
      <div class="footer-row">
        <button class="btn ghost sm" @click="setTheme(store.theme === 'dark' ? 'light' : 'dark')">
          <Sun v-if="store.theme === 'dark'" />
          <Moon v-else />
          {{ store.theme === 'dark' ? '浅色' : '深色' }}
        </button>
        <div class="seeds" title="Material 主题色">
          <button
            v-for="s in SEEDS"
            :key="s.hex"
            class="seed"
            :class="{ active: store.seed === s.hex }"
            :style="{ background: s.hex }"
            :title="s.name"
            @click="setTheme(store.theme, s.hex)"
          />
          <label class="seed custom" :class="{ active: !SEEDS.some((s) => s.hex === store.seed) }" title="自定义主题色">
            <Palette />
            <input type="color" :value="store.seed" @change="setTheme(store.theme, $event.target.value)" />
          </label>
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup>
import { computed } from 'vue';
import { LayoutGrid, Plus, ZapOff, Sun, Moon, Palette, Workflow } from '@lucide/vue';
import logo from '../assets/logo.png';
import { SEEDS } from '../theme.js';
import { store, setTheme, run, api } from '../store.js';
import { STATUS, fmt, digits, powerDigits, deviceSubtitle } from '../format.js';

defineEmits(['add']);

const onlineCount = computed(() => store.devices.filter((d) => d.status === 'online').length);
const running = computed(() => store.programRuns.filter((r) => !r.endedAt).length);
const anyOn = computed(() => running.value || store.devices.some((d) => d.live?.output && d.writable));

function allOff() {
  run(() => api.allOutputOff(), '已关闭所有输出');
}
</script>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  background: var(--sidebar);
  padding: 18px 14px 14px;
  min-height: 0;
}
.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 6px 18px;
}
.logo {
  width: 40px;
  height: 40px;
  border-radius: 10px;
}
.brand-name {
  font-weight: 700;
  font-size: 15px;
  letter-spacing: 0.01em;
}
.brand-sub {
  font-size: 12px;
  color: var(--text-3);
}
.nav {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 48px;
  padding: 0 16px;
  border-radius: 24px;
  border: 0;
  background: transparent;
  color: var(--text-2);
  font: inherit;
  font-weight: 500;
  cursor: pointer;
}
.nav svg {
  width: 17px;
  height: 17px;
}
.nav:hover {
  background: color-mix(in srgb, var(--text) 8%, transparent);
  color: var(--text);
}
.nav.active {
  background: var(--secondary-container);
  color: var(--on-secondary-container);
  font-weight: 600;
}
.count {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-3);
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 8px 6px 12px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--text-3);
}
.list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0 -4px;
  padding: 2px 4px;
}
.item {
  text-align: left;
  border: 0;
  border-radius: 16px;
  padding: 10px 12px;
  background: transparent;
  color: var(--text);
  font: inherit;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.item:hover {
  background: color-mix(in srgb, var(--text) 8%, transparent);
}
.item.active {
  background: var(--secondary-container);
  color: var(--on-secondary-container);
}
.item-top {
  display: flex;
  align-items: center;
  gap: 8px;
}
.item-name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.out-pill {
  margin-left: auto;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 5px;
  color: var(--on-ok-container);
  background: var(--ok-container);
}
.item-sub {
  display: flex;
  gap: 5px;
  font-size: 12px;
  color: var(--text-2);
  margin: 2px 0 6px 16px;
  white-space: nowrap;
  overflow: hidden;
}
.item-read {
  display: flex;
  justify-content: space-between;
  margin-left: 16px;
  font-size: 13px;
  font-weight: 500;
}
.item-read small {
  font-size: 10px;
  margin-left: 1px;
  opacity: 0.7;
}
.status-text {
  font-size: 12px;
  justify-content: flex-start;
}
.status-text.warn {
  color: var(--warn);
}
.status-text.err {
  color: var(--danger);
}
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 22px 10px;
  border: 1.5px dashed var(--border-strong);
  border-radius: 12px;
  background: transparent;
  color: var(--text-2);
  font: inherit;
  cursor: pointer;
}
.empty:hover {
  border-color: var(--primary);
  color: var(--primary);
}
.footer {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 12px;
}
.all-off {
  height: 38px;
}
.footer-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.seeds {
  display: flex;
  gap: 6px;
  padding-right: 4px;
}
.seed {
  position: relative;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 0;
  padding: 0;
  cursor: pointer;
  outline: 2px solid transparent;
  outline-offset: 2px;
  transition: outline-color 0.15s;
}
.seed.active {
  outline-color: var(--text);
}
.seed.custom {
  display: grid;
  place-items: center;
  background: var(--panel-hover);
  color: var(--text-2);
}
.seed.custom svg {
  width: 12px;
  height: 12px;
}
.seed input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
</style>
