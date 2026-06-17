<script setup>
import {watch} from 'vue'
import {GROUP_MODES} from '@/composables/useGrouping'

const model = defineModel({type: String, required: true})
// 'down' = gainers first (default), 'up' = losers first. Meaningful
// while model === 'change' or 'prepost'; clicking the already-active chip again
// flips it (next click toggles direction instead of needing a double-click).
const changeDirection = defineModel('changeDirection', {type: String, default: 'down'})
const directionalModes = new Set(['change', 'prepost'])

watch(model, (value) => {
  if (value === 'sector') model.value = 'prepost'
}, {immediate: true})

function onTap(value) {
  if (directionalModes.has(value) && model.value === value) {
    changeDirection.value = changeDirection.value === 'down' ? 'up' : 'down'
    return
  }
  model.value = value
}
</script>

<template>
  <div class="group-bar" aria-label="Group by">
    <button
      v-for="opt in GROUP_MODES"
      :key="opt.value"
      class="group-btn"
      :class="{ active: model === opt.value }"
      :title="directionalModes.has(opt.value) ? `${opt.label} (click again to flip up/down)` : `Group by ${opt.label}`"
      @click="onTap(opt.value)"
    >
      <span>{{ opt.label }}</span>
      <i
          v-if="directionalModes.has(opt.value) && model === opt.value"
        :class="changeDirection === 'up' ? 'pi pi-arrow-down' : 'pi pi-arrow-up'"
        class="change-dir-icon"
      />
    </button>
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
  position: relative;
  flex: 1;
  background: none;
  border: none;
  color: var(--text-secondary);
  border-radius: 6px;
  padding: 5px 12px 5px 4px;
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

.change-dir-icon {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.55rem;
}
</style>
