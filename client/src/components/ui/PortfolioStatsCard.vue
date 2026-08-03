<script setup>
import {computed} from 'vue'
import {usePortfolioStore} from '@/stores/portfolio'
import {gainLossClass, useCurrency, usePercent} from '@/composables/useFormat'
import {useI18n} from '@/composables/useI18n'
import {usePortfolioDisplayCurrency} from '@/composables/usePortfolioDisplayCurrency'

const portfolio = usePortfolioStore()
const {t} = useI18n()
const {
  convertUsd: convertPortfolioUsd,
  displayCurrencyForRate: portfolioCurrencyForRate,
} = usePortfolioDisplayCurrency()

const ilsTotal = computed(() => portfolio.totals.find(t => t.currency === 'ILS') ?? null)
const usdTotal = computed(() => portfolio.totals.find(t => t.currency === 'USD') ?? null)
const combined = computed(() => portfolio.combinedUsd)
const combinedDisplay = computed(() => {
  const c = combined.value
  if (!c) return null
  return {
    value: convertPortfolioUsd(c.value, c.ilsToUsd),
    pnl: convertPortfolioUsd(c.pnl, c.ilsToUsd),
    pnlPercent: c.pnlPercent,
    currency: portfolioCurrencyForRate(c.ilsToUsd),
  }
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
      <div class="stat-label-row">
        <span class="stat-label text-muted">{{ t('dashboard.combined') }} {{ combinedDisplay.currency }}</span>
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

</style>
