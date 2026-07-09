<script setup>
import {computed} from 'vue'
import { useChartRange } from '@/composables/useChartRange'
import {useI18n} from '@/composables/useI18n'

const props = defineProps({
  modelValue: {
    type: String,
    default: undefined,
  },
})

const emit = defineEmits(['update:modelValue'])

const sharedRange = useChartRange()
const {t} = useI18n()

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

const OPTIONS = computed(() => [
  {label: 'D', value: '1d', title: t('range.day')},
  {label: 'W', value: '5d', title: t('range.week')},
  {label: 'M', value: '1mo', title: t('range.month')},
  {label: '6M', value: '6mo', title: t('range.sixMonths')},
  {label: 'Y', value: '1y', title: t('range.year')},
])
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
    <div v-if="$slots.append" class="range-bar-append">
      <slot name="append"/>
    </div>
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

.range-bar-append {
  display: flex;
  align-items: stretch;
  gap: 2px;
  margin-left: 2px;
  padding-left: 2px;
  border-left: 1px solid var(--border);
}
</style>
