<script setup>
import {computed, onMounted, ref, watch} from 'vue'
import {usePortfolioStore} from '@/stores/portfolio'
import {useHistoryStore} from '@/stores/history'
import {useChartRange} from '@/composables/useChartRange'
import {GROUP_MODES, groupItems} from '@/composables/useGrouping'
import {useStorage} from '@vueuse/core'
import {gainLossClass, useCurrency, usePercent, useTickerCurrency} from '@/composables/useFormat'
import api from '@/composables/useApi'
import Select from 'primevue/select'
import BreakdownCard from '@/components/charts/BreakdownCard.vue'
import SparklineChart from '@/components/charts/SparklineChart.vue'
import SkeletonCard from '@/components/ui/SkeletonCard.vue'
import PageSettings from '@/components/ui/PageSettings.vue'
import SettingsRow from '@/components/ui/SettingsRow.vue'

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
const range = useChartRange()
const sparklines = ref({})
const groupMode = useStorage('dashboard-group-mode', 'none')

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
    await portfolio.fetchPortfolio()
    await Promise.all([fetchSparklines(), fetchHistory()])
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
      <PageSettings>
        <SettingsRow icon="pi pi-chart-line" label="Chart range">
          <div class="toggle-group">
            <button
                v-for="opt in RANGE_OPTIONS"
                :key="opt.value"
                :class="{ active: range === opt.value }"
                class="toggle-btn"
                @click="range = opt.value"
            >{{ opt.label }}
            </button>
          </div>
        </SettingsRow>
        <SettingsRow icon="pi pi-objects-column" label="Group by">
          <Select
              v-model="groupMode"
              :options="GROUP_MODES"
              class="group-select"
              option-label="label"
              option-value="value"
          />
        </SettingsRow>
      </PageSettings>
    </header>

    <div v-if="portfolio.loading" class="cards-grid">
      <SkeletonCard v-for="n in 3" :key="n" />
    </div>

    <template v-else>

      <!-- Allocation + movers, unified -->
      <BreakdownCard :positions="portfolio.positions"/>


      <!-- One card per stock (optionally grouped) -->
      <template v-for="section in groupedPositions" :key="section.group ?? '_all'">
        <div v-if="section.group" class="group-header">{{ section.group }}</div>
        <div
            v-for="pos in section.items"
            :key="`${section.group ?? ''}-${pos.ticker}`"
            :style="neonStyle(pos.pnlPercent)"
            class="stock-card"
            @click="$router.push(`/stock/${pos.ticker}`)"
        >
          <div class="stock-top">
            <div class="stock-left">
              <span class="ticker">{{ pos.ticker }}</span>
              <span class="company text-muted">{{ pos.companyName }}</span>
            </div>
            <div class="stock-right">
              <span class="stock-value">{{ useTickerCurrency(pos.value, pos.ticker) }}</span>
              <span class="stock-price text-muted">{{ pos.shares }} × {{
                  useTickerCurrency(pos.currentPrice, pos.ticker)
                }}</span>
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
            <!--            <span class="text-muted" style="font-size:0.78rem">P&L</span>-->
            <span :class="gainLossClass(pos.pnl)" class="pnl-val">
              {{ pos.pnl >= 0 ? '+' : '' }}{{ useTickerCurrency(pos.pnl, pos.ticker) }}
              ({{ usePercent(pos.pnlPercent) }})
            </span>
            <span :class="gainLossClass(pos.changePercent)" class="day-pnl">
              Today {{ usePercent(pos.changePercent) }}
            </span>
          </div>
        </div>
      </template>

      <!-- Total card per currency -->
      <div class="totals-grid">
        <div
            v-for="t in portfolio.totals"
            :key="`total-${t.currency}`"
            class="total-card"
        >
          <div class="total-row">
            <span class="total-label">{{ t.currency }}</span>
            <div class="total-values">
              <span class="total-value">{{ useCurrency(t.value, t.currency) }}</span>
              <span v-if="portfolio.combinedUsd?.ilsToUsd" class="total-converted text-muted">
                {{
                  t.currency === 'ILS'
                      ? useCurrency(t.value * portfolio.combinedUsd.ilsToUsd, 'USD')
                      : useCurrency(t.value / portfolio.combinedUsd.ilsToUsd, 'ILS')
                }}
              </span>
            </div>
          </div>
          <div class="total-row">
            <!--            <span class="text-muted" style="font-size:0.78rem">P&L</span>-->
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
          <div v-if="portfolio.combinedUsd?.ilsToUsd" class="fx-note text-muted">
            ₪1 = ${{ portfolio.combinedUsd.ilsToUsd.toFixed(4) }}
          </div>
        </div>
      </div>

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

/* Totals grid */
.totals-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.5rem;
  margin: 0.25rem 0 0.75rem;
}

.totals-grid > .total-card:only-child {
  grid-column: 1 / -1;
}

/* Total card */
.total-card {
  border: 1px solid var(--accent);
  border-radius: 14px;
  padding: 0.9rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.total-row { display: flex; justify-content: space-between; align-items: center; }

.total-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-secondary);
}
.total-values { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; }

.total-value {
  font-size: 1.15rem;
  font-weight: 700;
}
.total-converted { font-size: 0.78rem; }

.total-pnl {
  font-size: 0.88rem;
  font-weight: 600;
  text-align: right
}
.total-day { font-size: 0.85rem; font-weight: 500; }
.fx-note { font-size: 0.72rem; text-align: right; margin-top: 0.15rem; }

.empty { padding: 2rem 0; font-size: 0.9rem; text-align: center; }
</style>
