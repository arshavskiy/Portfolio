<script setup>
import {onMounted, ref, watch} from 'vue'
import {usePortfolioStore} from '@/stores/portfolio'
import {useHistoryStore} from '@/stores/history'
import {useChartRange} from '@/composables/useChartRange'
import {gainLossClass, useCurrency, usePercent, useTickerCurrency} from '@/composables/useFormat'
import AllocationChart from '@/components/charts/AllocationChart.vue'
import TopMoversChart from '@/components/charts/TopMoversChart.vue'
import SparklineChart from '@/components/charts/SparklineChart.vue'
import SkeletonCard from '@/components/ui/SkeletonCard.vue'

const portfolio = usePortfolioStore()
const historyStore = useHistoryStore()
const range = useChartRange()
const sparklines = ref({})

onMounted(async () => {
  try {
    await portfolio.fetchPortfolio()
    await fetchSparklines()
  } catch {}
})

async function fetchSparklines() {
  const entries = await Promise.all(portfolio.positions.map(async (pos) => {
    try {
      return [pos.ticker, await historyStore.fetchHistory(pos.ticker, range.value)]
    } catch {
      return null
    }
  }))
  sparklines.value = Object.fromEntries(entries.filter(Boolean))
}

watch(() => portfolio.positions, fetchSparklines, { deep: true })
watch(range, fetchSparklines)

function neonStyle(pnlPercent) {
  if (pnlPercent == null) return {}
  const isWin = pnlPercent >= 0
  const intensity = Math.min(Math.abs(pnlPercent) / 20, 1) // max glow at 20%
  const color = isWin ? `rgba(0,255,136,${0.4 + intensity * 0.6})` : `rgba(255,51,102,${0.4 + intensity * 0.6})`
  const spread = 4 + intensity * 8
  return {
    borderColor: color,
    boxShadow: `0 0 ${spread}px ${color}, inset 0 0 ${spread * 0.5}px ${isWin ? 'rgba(0,255,136,0.05)' : 'rgba(255,51,102,0.05)'}`,
  }
}
</script>

<template>
  <div class="dashboard">
    <header class="dash-header">
      <h1 class="gradient-title">Portfolio</h1>
    </header>

    <div v-if="portfolio.loading" class="cards-grid">
      <SkeletonCard v-for="n in 3" :key="n" />
    </div>

    <template v-else>

      <!-- One card per stock -->
      <div
        v-for="pos in portfolio.positions"
        :key="pos.ticker"
        class="stock-card"
        :style="neonStyle(pos.pnlPercent)"
        @click="$router.push(`/stock/${pos.ticker}`)"
      >
        <div class="stock-top">
          <div class="stock-left">
            <span class="ticker">{{ pos.ticker }}</span>
            <span class="company text-muted">{{ pos.companyName }}</span>
          </div>
          <div class="stock-right">
            <span class="stock-value">{{ useTickerCurrency(pos.value, pos.ticker) }}</span>
            <span class="stock-price text-muted">{{ pos.shares }} × {{ useTickerCurrency(pos.currentPrice, pos.ticker) }}</span>
          </div>
        </div>

        <!-- Sparkline -->
        <SparklineChart
          v-if="sparklines[pos.ticker]?.length"
          :data="sparklines[pos.ticker]"
          :pnl-percent="pos.pnlPercent"
          class="stock-spark"
        />

        <div class="stock-pnl">
          <span class="text-muted" style="font-size:0.78rem">P&L</span>
          <span :class="gainLossClass(pos.pnl)" class="pnl-val">
            {{ pos.pnl >= 0 ? '+' : '' }}{{ useTickerCurrency(pos.pnl, pos.ticker) }}
            ({{ usePercent(pos.pnlPercent) }})
          </span>
          <span :class="gainLossClass(pos.changePercent)" class="day-pnl">
            Today {{ usePercent(pos.changePercent) }}
          </span>
        </div>
      </div>

      <!-- Total card per currency -->
      <div
        v-for="t in portfolio.totals"
        :key="`total-${t.currency}`"
        class="total-card"
      >
        <div class="total-row">
          <span class="total-label">Total · {{ t.currency }}</span>
          <div class="total-values">
            <span class="total-value">{{ useCurrency(t.value, t.currency) }}</span>
            <span class="total-converted text-muted" v-if="portfolio.combinedUsd?.ilsToUsd">
              {{ t.currency === 'ILS'
                ? useCurrency(t.value * portfolio.combinedUsd.ilsToUsd, 'USD')
                : useCurrency(t.value / portfolio.combinedUsd.ilsToUsd, 'ILS') }}
            </span>
          </div>
        </div>
        <div class="total-row">
          <span class="text-muted" style="font-size:0.78rem">P&L</span>
          <span :class="gainLossClass(t.pnl)" class="total-pnl">
            {{ t.pnl >= 0 ? '+' : '' }}{{ useCurrency(t.pnl, t.currency) }}
            ({{ usePercent(t.pnlPercent) }})
          </span>
        </div>
        <div class="total-row">
          <span class="text-muted" style="font-size:0.78rem">Today</span>
          <span :class="gainLossClass(t.dayPnl)" class="total-day">
            {{ t.dayPnl >= 0 ? '+' : '' }}{{ useCurrency(t.dayPnl, t.currency) }}
          </span>
        </div>
        <div class="fx-note text-muted" v-if="portfolio.combinedUsd?.ilsToUsd">
          ₪1 = ${{ portfolio.combinedUsd.ilsToUsd.toFixed(4) }}
        </div>
      </div>

      <div v-if="!portfolio.positions.length" class="empty text-muted">
        No holdings yet. Add a transaction to get started.
      </div>

      <!-- Allocation donut -->
      <AllocationChart :positions="portfolio.positions" :combined-usd="portfolio.combinedUsd" />

      <!-- Top movers -->
      <section v-if="portfolio.positions.length > 1" class="section">
        <h2 class="section-title">Today's Movers</h2>
        <TopMoversChart :positions="portfolio.positions" />
      </section>

    </template>
  </div>
</template>

<style scoped>
.dashboard { padding: 1rem; }
.dash-header { margin-bottom: 1.25rem; }
.dash-header h1 { font-size: 1.5rem; font-weight: 800; }

/* Per-stock card */
.stock-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  min-height: 140px;
  padding: 0.9rem 1rem;
  margin-bottom: 0.5rem;
  cursor: pointer;
  transition: border-color 0.15s;
}
.stock-card:active { border-color: var(--accent); }
.stock-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem; }
.stock-left { display: flex; flex-direction: column; gap: 2px; }
.stock-right { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.ticker { font-weight: 700; font-size: 1rem; }
.company { font-size: 0.78rem; }
.stock-value { font-weight: 600; font-size: 1rem; }
.stock-price { font-size: 0.75rem; }
.stock-spark { margin: 0.3rem -1rem; width: calc(100% + 2rem); }
.stock-pnl { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border); padding-top: 0.4rem; font-size: 0.82rem; }
.pnl-val { font-weight: 500; }
.day-pnl { font-size: 0.78rem; }

/* Total card */
.total-card {
  background: var(--bg-card);
  border: 1px solid var(--accent);
  border-radius: 14px;
  padding: 0.9rem 1rem;
  margin-bottom: 0.75rem;
  margin-top: 0.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.total-row { display: flex; justify-content: space-between; align-items: center; }
.total-label { font-size: 0.82rem; font-weight: 600; color: var(--text-secondary); }
.total-values { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; }
.total-value { font-size: 1.3rem; font-weight: 700; }
.total-converted { font-size: 0.78rem; }
.total-pnl { font-size: 0.88rem; font-weight: 600; }
.total-day { font-size: 0.85rem; font-weight: 500; }
.fx-note { font-size: 0.72rem; text-align: right; margin-top: 0.15rem; }

.empty { padding: 2rem 0; font-size: 0.9rem; text-align: center; }

.section { margin-top: 1.5rem; }
.section h2 { font-size: 1rem; font-weight: 600; margin-bottom: 0.75rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; }
</style>
