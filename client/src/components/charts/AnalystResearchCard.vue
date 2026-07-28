<script setup>
import {computed, onMounted, ref, watch} from 'vue'
import api from '@/composables/useApi'
import {useI18n} from '@/composables/useI18n'

const props = defineProps({
  ticker: {type: String, required: true},
  currentPrice: {type: Number, default: null},
})

const {t} = useI18n()

const data = ref(null)
const loading = ref(false)

const BULLISH = new Set(['Bullish', 'Up'])
const BEARISH = new Set(['Bearish', 'Down'])

function outlookClass(direction) {
  if (BULLISH.has(direction)) return 'pos'
  if (BEARISH.has(direction)) return 'neg'
  return 'neutral'
}

// Trading Central reports discount as the gap to fair value: negative means
// priced above it. Colour follows that sign, not the word.
const valuationClass = computed(() => {
  const d = data.value?.valuation?.description
  if (d === 'Undervalued') return 'pos'
  if (d === 'Overvalued') return 'neg'
  return 'neutral'
})

const ratingClass = computed(() => {
  const r = (data.value?.recommendation?.rating || '').toUpperCase()
  if (r === 'BUY') return 'pos'
  if (r === 'SELL') return 'neg'
  return 'neutral'
})

const targetDelta = computed(() => {
  const target = data.value?.recommendation?.targetPrice
  const price = props.currentPrice
  if (target == null || !price) return null
  return ((target - price) / price) * 100
})

const outlooks = computed(() => {
  const o = data.value?.outlook
  if (!o) return []
  return [
    {key: 'shortTerm', label: t('analystResearch.shortTerm'), value: o.shortTerm},
    {key: 'intermediateTerm', label: t('analystResearch.intermediateTerm'), value: o.intermediateTerm},
    {key: 'longTerm', label: t('analystResearch.longTerm'), value: o.longTerm},
  ].filter((row) => row.value)
})

const provider = computed(
  () => data.value?.recommendation?.provider || data.value?.valuation?.provider || null
)

async function load() {
  loading.value = true
  try {
    data.value = await api.get(`/stocks/analyst/${encodeURIComponent(props.ticker)}`)
  } catch {
    data.value = null
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(() => props.ticker, load)
</script>

<template>
  <div v-if="loading" class="research-card analyst-card analyst-loading">
    <div class="skeleton-line" style="width: 55%"/>
    <div class="skeleton-line" style="width: 35%"/>
  </div>

  <div v-else-if="data" class="research-card analyst-card">
    <div class="analyst-head">
      <h2 class="stat-label-info">
        {{ t('analystResearch.title') }}
        <i
          v-tooltip.focus="t('analystResearch.cardInfo')"
          class="pi pi-info-circle info-icon"
          tabindex="0"
        />
      </h2>
      <span v-if="provider" class="analyst-provider">{{ provider }}</span>
    </div>

    <div class="analyst-body">
      <div v-if="data.recommendation" class="analyst-row">
        <span class="analyst-label">{{ t('analystResearch.rating') }}</span>
        <span class="analyst-value">
          <span :class="ratingClass" class="analyst-badge">{{ data.recommendation.rating }}</span>
        </span>
      </div>

      <div v-if="data.recommendation?.targetPrice != null" class="analyst-row">
        <span class="analyst-label">{{ t('analystResearch.targetPrice') }}</span>
        <span class="analyst-value">
          ${{ data.recommendation.targetPrice }}
          <small v-if="targetDelta != null" :class="targetDelta >= 0 ? 'pos' : 'neg'">
            {{ targetDelta >= 0 ? '+' : '' }}{{ targetDelta.toFixed(1) }}% {{ t('analystResearch.vsCurrent') }}
          </small>
        </span>
      </div>

      <div v-if="data.valuation" class="analyst-row">
        <span class="analyst-label">{{ t('analystResearch.valuation') }}</span>
        <span class="analyst-value">
          <span :class="valuationClass">{{ data.valuation.description }}</span>
          <small v-if="data.valuation.discount"> ({{ data.valuation.discount }})</small>
        </span>
      </div>

      <div v-if="outlooks.length" class="analyst-row">
        <span class="analyst-label">{{ t('analystResearch.outlook') }}</span>
        <span class="analyst-value analyst-outlooks">
          <span v-for="row in outlooks" :key="row.key" class="analyst-outlook">
            <small>{{ row.label }}</small>
            <span :class="outlookClass(row.value)">{{ row.value }}</span>
          </span>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.analyst-card {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-secondary, #111111);
  margin: 1rem 0;
  overflow: hidden;
}

.analyst-loading {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.analyst-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border);
}

.analyst-provider {
  opacity: 0.6;
  font-weight: 400;
}

.stat-label-info {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}

.info-icon {
  font-size: 0.72rem;
  opacity: 0.55;
  cursor: pointer;
}

.info-icon:hover,
.info-icon:focus {
  opacity: 1;
  color: var(--accent);
  outline: none;
}

.analyst-body {
  padding: 0.5rem 1rem 0.85rem;
}

.analyst-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.4rem 0;
}

.analyst-label {
  opacity: 0.7;
  flex-shrink: 0;
}

.analyst-value {
  text-align: right;
  font-weight: 600;
}

.analyst-value small {
  font-weight: 400;
  opacity: 0.75;
  margin-left: 0.3rem;
}

.analyst-badge {
  padding: 0.1rem 0.45rem;
  border-radius: 6px;
  border: 1px solid currentColor;
  font-size: 0.75rem;
}

.analyst-outlooks {
  display: inline-flex;
  gap: 0.7rem;
}

.analyst-outlook {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-end;
  line-height: 1.25;
}

.analyst-outlook small {
  margin-left: 0;
  opacity: 0.6;
}

.pos {
  color: var(--green, #22c55e);
}

.neg {
  color: var(--red, #ef4444);
}

.neutral {
  opacity: 0.8;
}
</style>
