<script setup>
import {ref} from 'vue'

const open = ref(false)
</script>

<template>
  <div>
    <!-- Trigger -->
    <button :class="{ active: open }" class="settings-trigger" @click="open = !open">
      <i class="pi pi-sliders-h"/>
    </button>

    <!-- Backdrop -->
    <Transition name="fade">
      <div v-if="open" class="backdrop" @click="open = false"/>
    </Transition>

    <!-- Drawer -->
    <Transition name="slide">
      <div v-if="open" class="drawer">
        <div class="drawer-header">
          <span class="drawer-title">Settings</span>
          <button class="drawer-close" @click="open = false">
            <i class="pi pi-times"/>
          </button>
        </div>
        <div class="drawer-body">
          <slot/>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.settings-trigger {
  background: none;
  border: 1px solid var(--border);
  color: var(--text-secondary);
  border-radius: 8px;
  padding: 5px 9px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  line-height: 1;
}

.settings-trigger.active,
.settings-trigger:active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0, 0, 0, 0.45);
}

.drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 260px;
  z-index: 201;
  background: var(--bg-secondary);
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
}

.drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1rem 0.75rem;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.drawer-title {
  font-size: 0.9rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.drawer-close {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.85rem;
  padding: 4px;
  line-height: 1;
}

.drawer-body {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  overflow-y: auto;
}

/* Transitions */
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s;
}

.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

.slide-enter-active, .slide-leave-active {
  transition: transform 0.25s ease;
}

.slide-enter-from, .slide-leave-to {
  transform: translateX(100%);
}
</style>
