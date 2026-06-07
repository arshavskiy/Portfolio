<script setup>
import {computed, onMounted, ref, watch} from 'vue'
import {usePortfolioStore} from '@/stores/portfolio'
import {useHistoryStore} from '@/stores/history'
import {useWatchlistStore} from '@/stores/watchlist'
import {useChartRange} from '@/composables/useChartRange'
import {groupItems} from '@/composables/useGrouping'
import {useStorage} from '@vueuse/core'
import api from '@/composables/useApi'
import BreakdownCard from '@/components/charts/BreakdownCard.vue'
import MarketsCard from '@/components/charts/MarketsCard.vue'
import TrendingCard from '@/components/charts/TrendingCard.vue'
import WatchlistMoversCard from '@/components/charts/WatchlistMoversCard.vue'
import WatchlistGainersLosersCard from '@/components/charts/WatchlistGainersLosersCard.vue'
import TotalsGrid from '@/components/charts/TotalsGrid.vue'
import SkeletonCard from '@/components/ui/SkeletonCard.vue'
import NewsCard from "../components/charts/NewsCard.vue";

const RANGE_OPTIONS = [
  {label: '1W', value: '1wk'},
  {label: '1M', value: '1mo'},
]

const HISTORY_RANGES = [
  {label: '1W', value: '1wk'},
  {label: '1M', value: '1mo'},
  {label: '3M', value: '3mo'},
  {label: '6M', value: '6mo'},
  {label: '1Y', value: '1y'},
  {label: 'All', value: 'all'},
]

const portfolio = usePortfolioStore()
const historyStore = useHistoryStore()
const watchlist = useWatchlistStore()
const range = useChartRange()
const sparklines = ref({})
const groupMode = useStorage('dashboard-group-mode', 'sector')

const groupedPositions = computed(() => groupItems(portfolio.positions, groupMode.value))

const historyRange = useStorage('dashboard-history-range', '1mo')
const history = ref([])
const historyLoading = ref(false)

async function fetchHistory() {
  historyLoading.value = true
  try {
    history.value = await api.get(`/portfolio/history?range=${encodeURIComponent(historyRange.value)}`)
  } catch {
    history.value = []
  } finally {
    historyLoading.value = false
  }
}

watch(historyRange, fetchHistory)
watch(() => portfolio.positions.length, fetchHistory)

onMounted(async () => {
  try {
    await Promise.all([
      portfolio.fetchPortfolio(),
      watchlist.fetchWatchlist(range.value),
    ])
    await Promise.all([fetchSparklines(), fetchHistory()])
  } catch {}
})

async function fetchSparklines() {
  const entries = await Promise.all(portfolio.positions.map(async (pos) => {
    try {
      return [pos.ticker, await historyStore.fetchHistory(pos.ticker, range.value, 40)]
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
      <h1 class="gradient-title">StockFolio</h1>
      <!--      <PageSettings>-->
      <!--        <SettingsRow icon="pi pi-chart-line" label="Chart range">-->
      <!--          <div class="toggle-group">-->
      <!--            <button-->
      <!--                v-for="opt in RANGE_OPTIONS"-->
      <!--                :key="opt.value"-->
      <!--                :class="{ active: range === opt.value }"-->
      <!--                class="toggle-btn"-->
      <!--                @click="range = opt.value"-->
      <!--            >{{ opt.label }}-->
      <!--            </button>-->
      <!--          </div>-->
      <!--        </SettingsRow>-->
      <!--        <SettingsRow icon="pi pi-objects-column" label="Group by">-->
      <!--          <Select-->
      <!--              v-model="groupMode"-->
      <!--              :options="GROUP_MODES"-->
      <!--              class="group-select"-->
      <!--              option-label="label"-->
      <!--              option-value="value"-->
      <!--          />-->
      <!--        </SettingsRow>-->
      <!--      </PageSettings>-->
    </header>


    <!-- Global markets overview (always shown) -->
    <MarketsCard />
    <!--    <MarketHoursCard />-->

    <WatchlistMoversCard :items="watchlist.items" :loading="watchlist.loading"/>
    <WatchlistGainersLosersCard :items="watchlist.items" :loading="watchlist.loading"/>

    <!-- Allocation + movers, unified -->
    <BreakdownCard :positions="portfolio.positions"/>

    <!-- Trending tickers -->
    <TrendingCard />

    <!-- Market news -->
<!--    <NewsCard/>-->

    <div v-if="portfolio.loading" class="cards-grid">
      <SkeletonCard v-for="n in 3" :key="n" />
    </div>

    <template v-else>

      <!-- One card per stock (optionally grouped) -->
      <template v-for="section in groupedPositions" :key="section.group ?? '_all'">
        <div v-if="section.group" class="group-header">{{ section.group }}</div>
<!--        <div class="stock-grid">-->
<!--        <div-->
<!--            v-for="pos in section.items"-->
<!--            :key="`${section.group ?? ''}-${pos.ticker}`"-->
<!--            :style="neonStyle(pos.pnlPercent)"-->
<!--            class="stock-card"-->
<!--            @click="$router.push(`/stock/${pos.ticker}`)"-->
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
      </template>

<!--      <TotalsGrid :totals="portfolio.totals" :combined-usd="portfolio.combinedUsd" />-->

      <!-- Portfolio value over time -->
      <!--      <section v-if="portfolio.positions.length" class="history-card">-->
      <!--        <div class="history-head">-->
      <!--          &lt;!&ndash;          <h2 class="section-title">Portfolio Value</h2>&ndash;&gt;-->
      <!--          <div class="toggle-group">-->
      <!--            <button-->
      <!--                v-for="opt in HISTORY_RANGES"-->
      <!--                :key="opt.value"-->
      <!--                :class="{ active: historyRange === opt.value }"-->
      <!--                class="toggle-btn"-->
      <!--                @click="historyRange = opt.value"-->
      <!--            >{{ opt.label }}-->
      <!--            </button>-->
      <!--          </div>-->
      <!--        </div>-->
      <!--        <PortfolioHistoryChart :data="history" :loading="historyLoading"/>-->
      <!--      </section>-->

      <div v-if="!portfolio.positions.length" class="empty text-muted">
        No holdings yet. Add a transaction to get started.
      </div>

    </template>
  </div>
</template>

<style scoped>
.dashboard { padding: 1rem; }

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
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
  padding: 0 0.25rem;
  flex-wrap: wrap;
  gap: 0.5rem;
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

.empty { padding: 2rem 0; font-size: 0.9rem; text-align: center; }

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
