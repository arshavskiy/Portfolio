<script setup>
import {computed, onMounted, ref} from 'vue'
import api from '@/composables/useApi'
import {useI18n} from '@/composables/useI18n'

const {t} = useI18n()

const macroSnapshot = ref(null)

const macroRows = computed(() => {
  const series = macroSnapshot.value?.series
  if (!series) return []
  const rows = [
    {key: 'fedFunds', label: t('tickerInsight.fedFunds'), info: t('tickerInsight.fedFundsInfo'), point: series.FEDFUNDS, format: (v) => `${v.toFixed(2)}%`},
    {key: 'cpiYoy', label: t('tickerInsight.cpiYoy'), info: t('tickerInsight.cpiYoyInfo'), point: series.CPIAUCSL, format: (v) => `${v.toFixed(1)}%`},
    {key: 'corePceYoy', label: t('tickerInsight.corePceYoy'), info: t('tickerInsight.corePceYoyInfo'), point: series.PCEPILFE, format: (v) => `${v.toFixed(1)}%`},
    {key: 'unemployment', label: t('tickerInsight.unemployment'), info: t('tickerInsight.unemploymentInfo'), point: series.UNRATE, format: (v) => `${v.toFixed(1)}%`},
    {key: 'treasury10y', label: t('tickerInsight.treasury10y'), info: t('tickerInsight.treasury10yInfo'), point: series.DGS10, format: (v) => `${v.toFixed(2)}%`},
  ]
  return rows.filter((r) => r.point?.value != null)
})

onMounted(async () => {
  try {
    macroSnapshot.value = await api.get('/enrich/macro-snapshot')
  } catch {
    macroSnapshot.value = null
  }
})
</script>

<template>
  <div v-if="macroRows.length" class="macro-context-strip">
    <span class="macro-strip-heading text-muted">{{ t('tickerInsight.macroContext') }}</span>
    <div class="macro-strip-items">
      <span v-for="row in macroRows" :key="row.key" v-tooltip.top="row.info" class="macro-strip-item" tabindex="0">
        <span class="text-muted macro-strip-item-label">{{ row.label }}</span>
        <span class="macro-strip-item-value">{{ row.format(row.point.value) }}</span>
      </span>
    </div>
  </div>
</template>

<style scoped>
.macro-context-strip {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.4rem 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.macro-context-strip::-webkit-scrollbar {
  display: none;
}

.macro-strip-heading {
  font-size: 0.68rem;
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
}

.macro-strip-items {
  display: flex;
  gap: 0.5rem;
}

.macro-strip-item {
  display: inline-flex;
  align-items: baseline;
  gap: 0.3rem;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: rgba(148, 163, 184, 0.06);
  white-space: nowrap;
  cursor: default;
}

.macro-strip-item-label {
  font-size: 0.65rem;
}

.macro-strip-item-value {
  font-size: 0.72rem;
  font-weight: 700;
}
</style>
