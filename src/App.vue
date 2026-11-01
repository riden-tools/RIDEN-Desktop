<template>
  <div class="app">
    <Sidebar @add="adding = true" />
    <main class="main">
      <div v-if="store.appInfo && !store.appInfo.corePath" class="core-missing">
        <TriangleAlert />
        未找到 riden-cored，串口设备无法连接。请先运行 npm run core:linux（Windows 为 core:win）构建 RIDEN-Core，或设置环境变量 RIDEN_CORED 指向可执行文件。
      </div>
      <DeviceView v-if="current" :key="current.id" :device="current" />
      <Overview v-else @add="adding = true" />
    </main>
    <AddDeviceDialog v-if="adding" @close="adding = false" />
    <Toasts />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { TriangleAlert } from '@lucide/vue';
import { store, deviceById } from './store.js';
import Sidebar from './components/Sidebar.vue';
import Overview from './components/Overview.vue';
import DeviceView from './components/DeviceView.vue';
import AddDeviceDialog from './components/AddDeviceDialog.vue';
import Toasts from './components/Toasts.vue';

const adding = ref(false);
const current = computed(() => (store.selected === 'overview' ? null : deviceById(store.selected)));
</script>

<style scoped>
.app {
  display: grid;
  grid-template-columns: 264px 1fr;
  height: 100%;
}
.main {
  min-width: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
}
.core-missing {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 16px 24px 0;
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 13px;
  color: var(--warn);
  background: color-mix(in srgb, var(--warn) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--warn) 30%, transparent);
}
.core-missing svg {
  width: 18px;
  flex: none;
}
</style>
