<template>
  <Teleport to="body">
    <div class="backdrop" @mousedown.self="$emit('close')">
      <div class="modal panel" :style="{ width }" role="dialog">
        <header class="m-head">
          <h3>{{ title }}</h3>
          <button class="btn ghost sm icon" title="关闭" @click="$emit('close')"><X /></button>
        </header>
        <div class="m-body"><slot /></div>
        <footer v-if="$slots.footer" class="m-foot"><slot name="footer" /></footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { onBeforeUnmount, onMounted } from 'vue';
import { X } from '@lucide/vue';

defineProps({ title: String, width: { type: String, default: '440px' } });
const emit = defineEmits(['close']);
const onKey = (e) => e.key === 'Escape' && emit('close');
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--scrim) 40%, transparent);
  animation: fade 0.15s ease-out;
}
.modal {
  background: var(--panel-2);
  border-radius: 28px;
  max-width: calc(100vw - 48px);
  max-height: calc(100vh - 48px);
  display: flex;
  flex-direction: column;
  animation: rise 0.18s ease-out;
}
.m-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 22px 18px 4px 26px;
}
.m-head h3 {
  margin: 0;
  font-size: 22px;
  font-weight: 400;
}
.m-body {
  padding: 12px 26px 18px;
  overflow: auto;
}
.m-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 8px 26px 24px;
}
@keyframes fade {
  from {
    opacity: 0;
  }
}
@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.98);
  }
}
</style>
