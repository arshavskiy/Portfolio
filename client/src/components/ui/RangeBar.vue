<script setup>
import {computed} from 'vue'
import { useChartRange } from '@/composables/useChartRange'

const props = defineProps({
  modelValue: {
    type: String,
    default: undefined,
  },
})

const emit = defineEmits(['update:modelValue'])

const sharedRange = useChartRange()

const range = computed({
  get: () => props.modelValue ?? sharedRange.value,
  set: (value) => {
    if (props.modelValue !== undefined) {
      emit('update:modelValue', value)
      return
    }
    sharedRange.value = value
  },
})

const OPTIONS = [
  { label: 'D', value: '1d', title: 'Day' },
  { label: 'W', value: '5d', title: 'Week' },
  { label: 'M', value: '1mo', title: 'Month' },
  { label: '6M', value: '6mo', title: '6 Months' },
  { label: 'Y', value: '1y', title: 'Year' },
]
</script>

<template>
  <div class="range-bar">
    <button
      v-for="opt in OPTIONS"
      :key="opt.value"
      class="range-btn"
      :class="{ active: range === opt.value }"
      :title="opt.title"
      @click="range = opt.value"
    >{{ opt.label }}</button>
  </div>
</template>

<style scoped>
.range-bar {
  display: flex;
  gap: 2px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 2px;
}

.range-bar.page-range {
  margin-bottom: 1rem;
}

.range-btn {
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
.range-btn:active { background: rgba(255,255,255,0.05); }
.range-btn.active {
  background: var(--accent);
  color: #fff;
}
</style>
