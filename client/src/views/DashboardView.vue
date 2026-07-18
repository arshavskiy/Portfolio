<script setup>
import {computed, defineAsyncComponent, onMounted, onUnmounted} from 'vue'
import {storeToRefs} from 'pinia'
import {useDashboardStore} from '@/stores/dashboard'
import {useAuthStore} from '@/stores/auth'
import PortfolioStatsCard from '@/components/ui/PortfolioStatsCard.vue'
import AppLoader from '@/components/ui/AppLoader.vue'
import {gainLossClass, usePercent} from '@/composables/useFormat'
import {useI18n} from '@/composables/useI18n'

const DailySummaryCard      = defineAsyncComponent(() => import('@/components/charts/DailySummaryCard.vue'))
const BreakdownCard         = defineAsyncComponent(() => import('@/components/charts/BreakdownCard.vue'))
const PortfolioHistoryChart = defineAsyncComponent(() => import('@/components/charts/PortfolioHistoryChart.vue'))
const PortfolioCompareChart = defineAsyncComponent(() => import('@/components/charts/PortfolioCompareChart.vue'))
const MarketsCard           = defineAsyncComponent(() => import('@/components/charts/MarketsCard.vue'))
const TrendingCard          = defineAsyncComponent(() => import('@/components/charts/TrendingCard.vue'))
const WatchlistMoversCard   = defineAsyncComponent(() => import('@/components/charts/WatchlistMoversCard.vue'))
// const TopMomentumCard       = defineAsyncComponent(() => import('@/components/charts/TopMomentumCard.vue'))
const DividendCalendarCard  = defineAsyncComponent(() => import('@/components/charts/DividendCalendarCard.vue'))

const dashboard = useDashboardStore()
const auth = useAuthStore()
const {t} = useI18n()
const aiSummaryEnabled = computed(() => auth.user?.aiDailySummaryEnabled !== false)
const {
  ready,
  groupedPositions,
  portfolioPositions,
  portfolioCombinedUsd,
  portfolioLoading,
  watchlistMoversItems,
  watchlistMoversLoading,
  watchlistGainersLosersItems,
  watchlistGainersLosersLoading,
  showTrending,
  showSkeleton,
  showEmpty,
  history,
  historyLoading,
  historyRange,
} = storeToRefs(dashboard)

const historyChangePercent = computed(() => portfolioCombinedUsd.value?.pnlPercent ?? null)

const HISTORY_RANGES = [
  {label: '1D', value: '1d'},
  {label: '1W', value: '1wk'},
  {label: '1M', value: '1mo'},
  {label: '3M', value: '3mo'},
  {label: '6M', value: '6mo'},
]

onMounted(async () => {
  try {
    await dashboard.initialize()
  } catch {}
})

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

onUnmounted(() => {
  dashboard.stopClock()
})
</script>

<template>
  <div class="dashboard">
    <header class="dash-header">
      <h1 class="gradient-title">{{ t('common.dashboard') }}</h1>
    </header>

    <!-- Full-page loader until all data is ready -->
    <div v-if="!ready" class="dash-loader">
      <AppLoader/>
    </div>

    <template v-else>
    <!-- Portfolio totals (USD / ILS / combined) -->
    <PortfolioStatsCard />

    <!-- AI-generated daily summary: holdings, watchlist, markets -->
    <DailySummaryCard v-if="aiSummaryEnabled" />

    <!-- Global markets overview -->
    <MarketsCard />

    <WatchlistMoversCard :items="watchlistMoversItems" :loading="watchlistMoversLoading"/>
    <!-- Momentum disabled for now
    <TopMomentumCard :items="watchlistMoversItems" :loading="watchlistMoversLoading"/>
    -->

    <!-- Allocation + movers, unified -->
    <BreakdownCard :combined-usd="portfolioCombinedUsd" :positions="portfolioPositions"/>

    <template v-if="showTrending">
      <TrendingCard />
    </template>

<!--    <template v-else>-->

      <!-- One card per stock (optionally grouped) -->
<!--      <template v-for="section in groupedPositions" :key="section.group ?? '_all'">-->
<!--        <div v-if="section.group" class="group-header">{{ section.group }}</div>-->
<!--        <div class="stock-grid">-->
<!--        <div-->
<!--            v-for="pos in section.items"-->
<!--            :key="`${section.group ?? ''}-${pos.ticker}`"-->
<!--            :style="neonStyle(pos.pnlPercent)"-->
<!--            class="stock-card"-->
<!--            @click="$router.push(`/position/${pos.ticker}`)"-->
<!--        >-->
<!--          <div class="stock-top">-->
<!--            <div class="stock-left">-->
<!--              <span class="ticker">{{ pos.ticker }}</span>-->
<!--              <span class="company text-muted">{{ pos.companyName }}</span>-->
<!--            </div>-->
<!--            <div class="stock-right">-->
<!--              <span class="stock-value">{{ useTickerCurrency(pos.value, pos.ticker) }}</span>-->
<!--              <span class="stock-price text-muted">{{ pos.shares }} × {{-->
<!--                  useTickerCurrency(pos.currentPrice, pos.ticker)-->
<!--                }}</span>-->
<!--            </div>-->
<!--          </div>-->

<!--          &lt;!&ndash; Sparkline &ndash;&gt;-->
<!--          <SparklineChart-->
<!--              v-if="sparklines[pos.ticker]?.length"-->
<!--              :data="sparklines[pos.ticker]"-->
<!--              :pnl-percent="pos.pnlPercent"-->
<!--              class="stock-spark"-->
<!--          />-->

<!--          <div class="stock-pnl">-->
<!--            &lt;!&ndash;            <span class="text-muted" style="font-size:0.78rem">P&L</span>&ndash;&gt;-->
<!--            <span :class="gainLossClass(pos.pnl)" class="pnl-val">-->
<!--              {{ pos.pnl >= 0 ? '+' : '' }}{{ useTickerCurrency(pos.pnl, pos.ticker) }}-->
<!--              ({{ usePercent(pos.pnlPercent) }})-->
<!--            </span>-->
<!--            <span :class="gainLossClass(pos.changePercent)" class="day-pnl">-->
<!--              Today {{ usePercent(pos.changePercent) }}-->
<!--            </span>-->
<!--          </div>-->
<!--        </div>-->
<!--        </div>-->
<!--      </template>-->

<!--      <TotalsGrid :totals="portfolio.totals" :combined-usd="portfolio.combinedUsd" />-->

      <!-- Portfolio value over time -->
      <section v-if="portfolioPositions.length" class="history-card">
        <div class="history-head">
          <div class="history-title-row">
            <div>
              <h2 class="section-title">{{ t('dashboard.portfolioValue') }}</h2>
            </div>
            <div v-if="historyChangePercent != null" :class="gainLossClass(historyChangePercent)" class="history-change">
              {{ usePercent(historyChangePercent) }}
            </div>
          </div>
          <div class="toggle-group">
            <button
                v-for="opt in HISTORY_RANGES"
                :key="opt.value"
                :class="{ active: historyRange === opt.value }"
                class="toggle-btn"
                @click="dashboard.setHistoryRange(opt.value)"
            >{{ opt.label }}
            </button>
          </div>
        </div>
        <PortfolioHistoryChart
            :key="historyRange"
            :data="history"
            :day-pnl="portfolioCombinedUsd?.dayPnl"
            :loading="historyLoading"
            :range="historyRange"
        />
      </section>

    <!-- Per-stock comparison: normalized % change, one line per holding -->
    <PortfolioCompareChart :positions="portfolioPositions" :range="historyRange"/>

    <!-- Upcoming ex-dividend / payment dates for held tickers -->
    <DividendCalendarCard v-if="portfolioPositions.length"/>

      <div v-if="showEmpty" class="empty text-muted">
        {{ t('dashboard.empty') }}
      </div>

    </template>
  </div>
</template>

<style scoped>
.dashboard { padding: 1rem; }

.dash-loader {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 50vh;
  margin-top: 140px;
}

.dash-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.25rem;
}

.dash-header h1 {
  font-size: 1.5rem;
}

.history-card {
  margin-bottom: 1.75rem;
}

.history-head {
  padding: 0 0.25rem;
}

.history-title-row {
  display: flex;
  justify-content: space-between;
}

.history-change {
  font-size: 0.8rem;
  font-weight: 600;
}

.section-title {
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-secondary);
}

.history-head .section-title {
  margin: 0;
}

.history-card .toggle-btn {
  padding: 3px 8px;
  font-size: 0.72rem;
}

.toggle-group {
  display: flex;
  gap: 0.25rem;
  flex-wrap: wrap;
  margin-top: 0.5rem;
}

.toggle-btn {
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}

.toggle-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.group-select {
  min-width: 110px;
}

.group-select :deep(.p-select-label) {
  padding: 4px 8px;
  font-size: 0.8rem;
}

.group-header {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-secondary);
  padding: 0.6rem 0.25rem 0.3rem;
  border-bottom: 1px solid var(--border);
  margin: 0.5rem 0;
}

/* Per-stock card */
.stock-grid {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.stock-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  min-height: 140px;
  padding: 0.9rem 1rem;
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

.empty { display: block; height: auto; padding: 2rem 0; font-size: 0.9rem; text-align: center; }

/* ── Responsive: tile stock cards + roomier totals on wide screens ── */
@media (min-width: 768px) {
  .dashboard {
    padding: 1.5rem;
  }

  .stock-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 0.75rem;
    align-items: start;
  }

}

@media (min-width: 1280px) {
  .dashboard {
    padding: 2rem;
  }
}
</style>
