<script setup>
import {computed} from 'vue'
import {useStorage} from '@vueuse/core'
import {usePortfolioStore} from '@/stores/portfolio'
import {gainLossClass, useCurrency, usePercent} from '@/composables/useFormat'
import {useI18n} from '@/composables/useI18n'

const portfolio = usePortfolioStore()
const {t} = useI18n()

const ilsTotal = computed(() => portfolio.totals.find(t => t.currency === 'ILS') ?? null)
const usdTotal = computed(() => portfolio.totals.find(t => t.currency === 'USD') ?? null)
const combined = computed(() => portfolio.combinedUsd)
const combinedCurrency = useStorage('holdings-combined-currency', 'ILS')
const combinedDisplay = computed(() => {
  const c = combined.value
  if (!c) return null
  if (combinedCurrency.value === 'ILS' && c.ilsToUsd > 0) {
    return {
      value: c.value / c.ilsToUsd,
      pnl: c.pnl / c.ilsToUsd,
      pnlPercent: c.pnlPercent,
      currency: 'ILS',
    }
  }
  return { value: c.value, pnl: c.pnl, pnlPercent: c.pnlPercent, currency: 'USD' }
})
</script>

<template>
  <div v-if="combined || ilsTotal || usdTotal" class="stats-card">
    <div v-if="usdTotal" class="stat">
      <span class="stat-label text-muted">USD</span>
      <span class="stat-value">{{ useCurrency(usdTotal.value, 'USD') }}</span>
      <span :class="gainLossClass(usdTotal.pnl)" class="stat-pnl">{{ usdTotal.pnl >= 0 ? '+' : '' }}{{ useCurrency(usdTotal.pnl, 'USD') }}</span>
      <span :class="gainLossClass(usdTotal.pnl)" class="stat-pct">{{ usePercent(usdTotal.pnlPercent) }}</span>
    </div>
    <div v-if="ilsTotal" class="stat" :class="usdTotal ? 'stat-bordered' : ''">
      <span class="stat-label text-muted">ILS ₪</span>
      <span class="stat-value">{{ useCurrency(ilsTotal.value, 'ILS') }}</span>
      <span :class="gainLossClass(ilsTotal.pnl)" class="stat-pnl">{{ ilsTotal.pnl >= 0 ? '+' : '' }}{{ useCurrency(ilsTotal.pnl, 'ILS') }}</span>
      <span :class="gainLossClass(ilsTotal.pnl)" class="stat-pct">{{ usePercent(ilsTotal.pnlPercent) }}</span>
    </div>
    <div v-if="combinedDisplay" class="stat stat-combined" :class="(usdTotal || ilsTotal) ? 'stat-bordered' : ''">
      <button
          class="currency-toggle"
          :title="t('dashboard.switchCurrency', { currency: combinedCurrency === 'ILS' ? 'USD' : 'ILS' })"
          @click="combinedCurrency = combinedCurrency === 'ILS' ? 'USD' : 'ILS'"
      >{{ combinedCurrency === 'ILS' ? '$' : '₪' }}</button>
      <div class="stat-label-row">
        <span class="stat-label text-muted">{{ t('dashboard.combined') }}</span>
      </div>
      <span class="stat-value">{{ useCurrency(combinedDisplay.value, combinedDisplay.currency) }}</span>
      <span :class="gainLossClass(combinedDisplay.pnl)" class="stat-pnl">{{ combinedDisplay.pnl >= 0 ? '+' : '' }}{{ useCurrency(combinedDisplay.pnl, combinedDisplay.currency) }}</span>
      <span :class="gainLossClass(combinedDisplay.pnl)" class="stat-pct">{{ usePercent(combinedDisplay.pnlPercent) }}</span>
    </div>
  </div>
</template>

<style scoped>
.stats-card {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
  gap: 0.5rem;
  padding: 1rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 16px;
  margin-bottom: 0.75rem;
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.stat-bordered {
  position: relative;
  border-left: 1px solid var(--border);
  padding-left: 0.75rem;
}

.stat-label {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.stat-value {
  font-size: 0.85rem;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stat-pnl {
  font-size: 0.72rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stat-pct {
  font-size: 0.68rem;
}

.stat-combined {
  position: relative;
}

.stat-label-row {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.currency-toggle {
  position: absolute;
  top: -10px;
  right: -10px;
  background: none;
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-secondary);
  font-size: 0.62rem;
  font-weight: 700;
  padding: 1px 6px;
  cursor: pointer;
  line-height: 1.4;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}

.currency-toggle:hover {
  border-color: var(--accent);
  color: var(--text-primary);
}
</style>
