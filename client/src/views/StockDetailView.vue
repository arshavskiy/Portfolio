<script setup>
import {onMounted, onUnmounted, ref, watch} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {useToast} from 'primevue/usetoast'
import {gainLossClass, useLargeNumber, usePercent, useTickerCurrency} from '@/composables/useFormat'
import {useWatchlistStore} from '@/stores/watchlist'
import {useHistoryStore} from '@/stores/history'
import api from '@/composables/useApi'
import Button from 'primevue/button'
import SelectButton from 'primevue/selectbutton'
import StockChart from '@/components/charts/StockChart.vue'
import AddTransactionModal from '@/components/ui/AddTransactionModal.vue'
import AlertModal from '@/components/ui/AlertModal.vue'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const watchlist = useWatchlistStore()
const historyStore = useHistoryStore()

const ticker = ref(route.params.ticker?.toUpperCase())
const quote = ref(null)
const history = ref([])
const loading = ref(false)
const chartLoading = ref(false)
const showTxModal = ref(false)
const showAlertModal = ref(false)

const ranges = ['1d', '5d', '1mo', '3mo', '6mo', '1y']
const selectedRange = ref('3mo')
const chartMode = ref('line')
const chartModes = ['line', 'candle']

let refreshTimer = null

async function loadQuote() {
  try {
    quote.value = await api.get(`/stocks/quote/${encodeURIComponent(ticker.value)}`)
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Failed to refresh', detail: err.message, life: 2000 })
  }
}

async function loadHistory() {
  chartLoading.value = true
  try {
    history.value = await historyStore.fetchHistory(ticker.value, selectedRange.value, 150)
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Failed to load chart', detail: err.message, life: 3000 })
  } finally {
    chartLoading.value = false
  }
}

async function loadData() {
  loading.value = true
  await Promise.all([loadQuote(), loadHistory()])
  loading.value = false
}

async function ensureWatchlistLoaded() {
  if (watchlist.items.length || watchlist.loading) return
  try {
    await watchlist.fetchWatchlist()
  } catch {
  }
}

function startAutoRefresh() {
  clearInterval(refreshTimer)
  refreshTimer = setInterval(loadQuote, 60000)
}

onMounted(() => {
  ensureWatchlistLoaded()
  loadData()
  startAutoRefresh()
})
onUnmounted(() => clearInterval(refreshTimer))
watch(selectedRange, loadHistory)
watch(() => route.params.ticker, (t) => {
  ticker.value = t?.toUpperCase()
  loadData()
  startAutoRefresh()
})

async function toggleWatchlist() {
  const existing = watchlist.items.find((i) => i.ticker === ticker.value)
  if (existing) {
    await watchlist.removeItem(existing._id)
    toast.add({ severity: 'info', summary: 'Removed from watchlist', life: 2000 })
  } else {
    await watchlist.addItem(ticker.value, quote.value?.name)
    toast.add({ severity: 'success', summary: 'Added to watchlist', life: 2000 })
  }
}

const isWatched = () => watchlist.items.some((i) => i.ticker === ticker.value)
</script>

<template>
  <div class="stock-detail">
    <header class="detail-header">
      <Button icon="pi pi-arrow-left" text rounded @click="router.back()" />
      <div class="header-info">
        <h1 class="gradient-title">{{ ticker }}</h1>
        <span class="text-muted">{{ quote?.name }}</span>
      </div>
      <Button
          v-tooltip.bottom="'Set price alert'"
          icon="pi pi-bell" rounded
          text
          @click="showAlertModal = true"
      />
      <Button
          v-tooltip.bottom="isWatched() ? 'Remove from watchlist' : 'Add to watchlist'"
          :icon="isWatched() ? 'pi pi-times' : 'pi pi-eye'"
          :outlined="isWatched()"
          :severity="isWatched() ? 'danger' : undefined"
        text rounded
        @click="toggleWatchlist"
      />
    </header>

    <div v-if="quote" class="quote-summary">
      <p class="current-price" :class="quote.change >= 0 ? 'neon-green' : 'neon-red'">
        {{ useTickerCurrency(quote.price, ticker) }}
      </p>
      <p :class="gainLossClass(quote.change)" class="price-change">
        {{ useTickerCurrency(quote.change, ticker) }} ({{ usePercent(quote.changePercent) }})
      </p>
    </div>
    <div v-else-if="loading" class="quote-summary">
      <div class="price-skeleton" />
    </div>

    <div class="chart-controls">
      <SelectButton v-model="selectedRange" :options="ranges" size="small" />
      <SelectButton v-model="chartMode" :options="chartModes" size="small" />
    </div>

    <StockChart :data="history" :loading="chartLoading" :mode="chartMode" :current-price="quote?.price ?? null" />

    <div v-if="quote" class="stats-grid">
      <div class="stat">
        <span class="text-muted">Open</span>
        <span>{{ useTickerCurrency(quote.open, ticker) }}</span>
      </div>
      <div class="stat">
        <span class="text-muted">Day High</span>
        <span>{{ useTickerCurrency(quote.dayHigh, ticker) }}</span>
      </div>
      <div class="stat">
        <span class="text-muted">Day Low</span>
        <span>{{ useTickerCurrency(quote.dayLow, ticker) }}</span>
      </div>
      <div class="stat">
        <span class="text-muted">Volume</span>
        <span>{{ useLargeNumber(quote.volume, ticker) }}</span>
      </div>
      <div class="stat">
        <span class="text-muted">Mkt Cap</span>
        <span>{{ useLargeNumber(quote.marketCap, ticker) }}</span>
      </div>
      <div class="stat">
        <span class="text-muted">P/E</span>
        <span>{{ quote.pe?.toFixed(2) || '—' }}</span>
      </div>
      <div class="stat">
        <span class="text-muted">52W High</span>
        <span>{{ useTickerCurrency(quote.week52High, ticker) }}</span>
      </div>
      <div class="stat">
        <span class="text-muted">52W Low</span>
        <span>{{ useTickerCurrency(quote.week52Low, ticker) }}</span>
      </div>
    </div>

    <div class="action-bar">
      <Button fluid label="Buy" outlined severity="success" @click="showTxModal = true"/>
    </div>

    <AddTransactionModal v-model:visible="showTxModal" :default-ticker="ticker" />
    <AlertModal v-model:visible="showAlertModal" :current-price="quote?.price" :ticker="ticker"/>
  </div>
</template>

<style scoped>
.stock-detail { padding: 0.5rem 1rem 2rem; }
.detail-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem; }
.header-info { flex: 1; }

.header-info h1 {
  font-size: 1.3rem;
  line-height: 1;
}
.header-info span { font-size: 0.82rem; }
.quote-summary { margin-bottom: 1rem; }
.current-price { font-size: 2.2rem; font-weight: 700; }
.neon-green { color: var(--neon-green); text-shadow: 0 0 20px rgba(0,255,136,0.6); }
.neon-red { color: var(--neon-red); text-shadow: 0 0 20px rgba(255,51,102,0.6); }
.price-change { font-size: 1rem; }
.price-skeleton { height: 2.5rem; width: 160px; background: var(--bg-card); border-radius: 6px; animation: shimmer 1.5s infinite; background: linear-gradient(90deg, var(--border) 25%, #475569 50%, var(--border) 75%); background-size: 200% 100%; }
.chart-controls { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.75rem; }
.stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; margin-top: 1rem; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
.stat { padding: 0.75rem 1rem; display: flex; justify-content: space-between; border-bottom: 1px solid var(--border); font-size: 0.88rem; }
.stat:nth-last-child(-n+2) { border-bottom: none; }
.action-bar { margin-top: 1.5rem; }
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
</style>
