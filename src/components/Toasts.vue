<template>
  <div class="toasts">
    <TransitionGroup name="toast">
      <div v-for="t in store.toasts" :key="t.id" class="toast" :class="t.type">
        <CircleCheck v-if="t.type === 'success'" />
        <CircleAlert v-else-if="t.type === 'error'" />
        <Info v-else />
        <span>{{ t.message }}</span>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup>
import { CircleCheck, CircleAlert, Info } from '@lucide/vue';
import { store } from '../store.js';
</script>

<style scoped>
.toasts {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-end;
  pointer-events: none;
}
.toast {
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 440px;
  padding: 10px 14px;
  border-radius: 8px;
  background: var(--inverse-surface);
  color: var(--inverse-on-surface);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  font-size: 13px;
  pointer-events: auto;
  user-select: text;
}
.toast svg {
  width: 17px;
  height: 17px;
  flex: none;
}
.toast-enter-active,
.toast-leave-active {
  transition: all 0.2s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(20px);
}
</style>
