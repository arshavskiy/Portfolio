<script setup>
import {ref, watch, computed} from 'vue'
import {useHistoryStore} from '@/stores/history'
import {useWatchlistStore} from '@/stores/watchlist'
import {fetchCachedQuote} from '@/composables/useQuoteCache'
import {useChartRange} from '@/composables/useChartRange'
import {gainLossClass, usePercent, useTickerCurrency} from '@/composables/useFormat'
import {useI18n} from '@/composables/useI18n'
import StockChart from '@/components/charts/StockChart.vue'
import AppLoader from '@/components/ui/AppLoader.vue'

const props = defineProps({
  ticker: {type: String, default: null},
  companyName: {type: String, default: ''},
})

const emit = defineEmits(['select-ticker'])

const historyStore = useHistoryStore()
const watchlist = useWatchlistStore()
const range = useChartRange()
const {t} = useI18n()

const history = ref([])
const chartLoading = ref(false)
const quote = ref(null)
const selectedRange = ref('1d')

const RANGES = ['1d', '5d', '1mo', '3mo', '1y']
const RANGE_LABELS = {'1d': '1D', '5d': '5D', '1mo': '1M', '3mo': '3M', '1y': '1Y'}

async function loadChart(ticker, r) {
  if (!ticker) return
  chartLoading.value = true
  try {
    const [hist, q] = await Promise.all([
      historyStore.fetchHistory(ticker, r, 120),
      fetchCachedQuote(ticker),
    ])
    history.value = hist ?? []
    quote.value = q
  } catch {
    history.value = []
  } finally {
    chartLoading.value = false
  }
}

watch(() => props.ticker, (t) => {
  if (t) loadChart(t, selectedRange.value)
}, {immediate: true})

watch(selectedRange, (r) => {
  if (props.ticker) loadChart(props.ticker, r)
})

const currentPrice = computed(() => quote.value?.price ?? null)
const change = computed(() => quote.value?.change ?? null)
const changePct = computed(() => quote.value?.changePercent ?? null)
</script>

<template>
  <div class="right-panel">
    <!-- Empty state -->
    <div v-if="!ticker" class="empty-state">
      <i class="pi pi-chart-line empty-icon"/>
      <p>{{ t('nav.clickRowToViewPosition') }}</p>
    </div>

    <template v-else>
      <!-- Chart section -->
      <div class="chart-section">
        <div class="chart-header">
          <div class="chart-ticker-info">
            <span class="chart-ticker">{{ ticker }}</span>
            <span v-if="companyName" class="chart-company">{{ companyName }}</span>
          </div>
          <div v-if="currentPrice != null" class="chart-price-block">
            <span class="chart-price">{{ useTickerCurrency(currentPrice, ticker) }}</span>
            <span v-if="changePct != null" :class="gainLossClass(changePct)" class="chart-change">
              {{ changePct >= 0 ? '+' : '' }}{{ usePercent(changePct) }}
            </span>
          </div>
        </div>

        <div class="range-tabs">
          <button
              v-for="r in RANGES"
              :key="r"
              :class="{active: selectedRange === r}"
              class="range-btn"
              @click="selectedRange = r"
          >{{ RANGE_LABELS[r] }}</button>
        </div>

        <div class="chart-wrap">
          <StockChart
              :data="history"
              :loading="chartLoading"
              :ticker="ticker"
              :current-price="currentPrice"
              :range="selectedRange"
              mode="line"
          />
        </div>
      </div>

      <!-- Watchlist section below chart -->
      <div class="watchlist-section">
        <div class="section-label">{{ t('common.watchlist') }}</div>
        <div v-if="watchlist.loading" class="wl-loader"><AppLoader/></div>
        <div v-else-if="!watchlist.items.length" class="wl-empty">{{ t('watchlist.noWatchlistItems') }}</div>
        <div v-else class="wl-list">
          <button
              v-for="item in watchlist.items"
              :key="item.ticker"
              :class="{selected: item.ticker === ticker}"
              class="wl-row"
              @click="emit('select-ticker', item.ticker, item.companyName)"
          >
            <div class="wl-left">
              <span class="wl-ticker">{{ item.ticker }}</span>
              <span class="wl-name">{{ item.companyName }}</span>
            </div>
            <div class="wl-right">
              <span class="wl-price">{{ useTickerCurrency(item.price, item.ticker) }}</span>
              <span :class="gainLossClass(item.changePercent)" class="wl-chg">
                {{ item.changePercent >= 0 ? '+' : '' }}{{ usePercent(item.changePercent) }}
              </span>
            </div>
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.right-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--bg-primary);
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  color: var(--text-secondary);
  font-size: 0.85rem;
  text-align: center;
  padding: 2rem;
}

.empty-icon {
  font-size: 2.5rem;
  opacity: 0.3;
}

/* Chart section */
.chart-section {
  padding: 1rem 1rem 0;
  flex-shrink: 0;
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.6rem;
}

.chart-ticker-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.chart-ticker {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary);
}

.chart-company {
  font-size: 0.72rem;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
}

.chart-price-block {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.chart-price {
  font-size: 0.95rem;
  font-weight: 700;
}

.chart-change {
  font-size: 0.75rem;
  font-weight: 600;
}

.range-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 0.5rem;
}

.range-btn {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-secondary);
  font-size: 0.72rem;
  font-weight: 600;
  padding: 3px 8px;
  cursor: pointer;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}

.range-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.chart-wrap {
  height: 200px;
}

/* Watchlist section */
.watchlist-section {
  flex: 1;
  overflow-y: auto;
  border-top: 1px solid var(--border);
  padding: 0.75rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.section-label {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-secondary);
  margin-bottom: 0.25rem;
}

.wl-loader {
  display: flex;
  justify-content: center;
  padding: 1rem;
}

.wl-empty {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.wl-list {
  display: flex;
  flex-direction: column;
}

.wl-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.45rem 0.4rem;
  border-radius: 8px;
  cursor: pointer;
  border: none;
  background: none;
  color: inherit;
  text-align: left;
  transition: background 0.12s;
  width: 100%;
}

.wl-row:hover {
  background: rgba(255, 255, 255, 0.04);
}

.wl-row.selected {
  background: rgba(0, 207, 255, 0.08);
}

.wl-left {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.wl-ticker {
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--text-primary);
}

.wl-name {
  font-size: 0.68rem;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 140px;
}

.wl-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
  flex-shrink: 0;
}

.wl-price {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-primary);
}

.wl-chg {
  font-size: 0.68rem;
  font-weight: 600;
}
</style>
