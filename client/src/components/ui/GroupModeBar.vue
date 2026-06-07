<script setup>
import {GROUP_MODES} from '@/composables/useGrouping'

const model = defineModel({type: String, required: true})
</script>

<template>
  <div class="group-bar" aria-label="Group by">
    <button
      v-for="opt in GROUP_MODES"
      :key="opt.value"
      class="group-btn"
      :class="{ active: model === opt.value }"
      :title="`Group by ${opt.label}`"
      @click="model = opt.value"
    >{{ opt.label }}</button>
  </div>
</template>

<style scoped>
.group-bar {
  display: flex;
  gap: 2px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 2px;
}

.group-btn {
  flex: 1;
  background: none;
  border: none;
  color: var(--text-secondary);
  border-radius: 6px;
  padding: 5px 0;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.group-btn:active {
  background: rgba(255,255,255,0.05);
}

.group-btn.active {
  background: var(--accent);
  color: #fff;
}
</style>
