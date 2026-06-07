<script setup>
import {computed, onMounted, onUnmounted, ref, watch} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {useToast} from 'primevue/usetoast'
import {useConfirm} from 'primevue/useconfirm'
import {gainLossClass, useCurrency, useLargeNumber, usePercent, useTickerCurrency} from '@/composables/useFormat'
import {useWatchlistStore} from '@/stores/watchlist'
import {useHistoryStore} from '@/stores/history'
import {usePortfolioStore} from '@/stores/portfolio'
import api from '@/composables/useApi'
import {getMarketHoursState, MARKET_HOURS_BY_GROUP} from '@/composables/useMarketHours'
import Button from 'primevue/button'
import SelectButton from 'primevue/selectbutton'
import StockChart from '@/components/charts/StockChart.vue'
import AddTransactionModal from '@/components/ui/AddTransactionModal.vue'
import AlertModal from '@/components/ui/AlertModal.vue'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const confirm = useConfirm()
const watchlist = useWatchlistStore()
const historyStore = useHistoryStore()
const portfolio = usePortfolioStore()

const ticker = ref(route.params.ticker?.toUpperCase())
const quote = ref(null)
const history = ref([])
const loading = ref(false)
const chartLoading = ref(false)
const showTxModal = ref(false)
const showSellModal = ref(false)
const showAlertModal = ref(false)
const selectedChartPoints = ref([])
const ilsToUsd = ref(null)
const now = ref(new Date())

const ranges = ['1d', '5d', '1mo', '3mo', '6mo', '1y']
const selectedRange = ref('3mo')
const chartMode = ref('line')
const chartModes = ['line', 'candle']

let refreshTimer = null
const heldPosition = computed(() => portfolio.positions.find((pos) => pos.ticker === ticker.value) || null)

const marketGroup = computed(() => {
  const symbol = ticker.value?.toUpperCase() || ''
  if (symbol.endsWith('.TA')) return 'Israel'
  if (/-USD$/.test(symbol)) return 'Crypto'
  return 'US'
})

const marketMeta = computed(() => {
  const market = MARKET_HOURS_BY_GROUP[marketGroup.value]
  return market ? getMarketHoursState(market, now.value) : null
})

const rangeChange = computed(() => {
  const firstClose = history.value[0]?.close
  if (firstClose == null) {
    return {
      amount: quote.value?.change ?? null,
      percent: quote.value?.changePercent ?? null,
    }
  }

  const latestPrice = quote.value?.price ?? history.value[history.value.length - 1]?.close
  if (latestPrice == null) {
    return {
      amount: quote.value?.change ?? null,
      percent: quote.value?.changePercent ?? null,
    }
  }

  const amount = latestPrice - firstClose
  const percent = firstClose ? (amount / firstClose) * 100 : null
  return {amount, percent}
})

const previousCloseLine = computed(() => quote.value?.previousClose ?? null)
const shekelValue = computed(() => {
  if (quote.value?.price == null) return null
  if (marketGroup.value === 'Israel') return quote.value.price
  if (!Number.isFinite(ilsToUsd.value) || ilsToUsd.value <= 0) return null
  return quote.value.price / ilsToUsd.value
})

const sessionMetaText = computed(() => {
  const meta = marketMeta.value
  if (!meta?.closeLabel) return ''
  if (meta.key === 'crypto') return 'Trades 24/7'
  return `${meta.isOpen ? 'Closes' : 'After hours'}: ${meta.closeLabel}`
})

function formatExtendedHoursTime(value, timezone) {
  if (!value) return ''

  const date = typeof value === 'number' ? new Date(value * 1000) : new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone || undefined,
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date)
}

const extendedHours = computed(() => {
  if (!quote.value || marketGroup.value === 'Crypto') return null

  const source = quote.value.postMarketPrice != null
    ? {
      label: 'After hours',
      price: quote.value.postMarketPrice,
      change: quote.value.postMarketChange,
      changePercent: quote.value.postMarketChangePercent,
      time: quote.value.postMarketTime,
    }
    : quote.value.preMarketPrice != null
      ? {
        label: 'Pre-market',
        price: quote.value.preMarketPrice,
        change: quote.value.preMarketChange,
        changePercent: quote.value.preMarketChangePercent,
        time: quote.value.preMarketTime,
      }
      : null

  if (!source || source.price == null) return null

  return {
    ...source,
    shekelPrice: marketGroup.value === 'Israel'
      ? source.price
      : Number.isFinite(ilsToUsd.value) && ilsToUsd.value > 0
        ? source.price / ilsToUsd.value
        : null,
    timeLabel: formatExtendedHoursTime(source.time, marketMeta.value?.timezone),
  }
})

const selectedDelta = computed(() => {
  if (selectedChartPoints.value.length !== 2) return null

  const [start, end] = selectedChartPoints.value
  const startPrice = start?.close
  const endPrice = end?.close
  if (startPrice == null || endPrice == null) return null

  const amount = endPrice - startPrice
  const percent = startPrice ? (amount / startPrice) * 100 : null
  const startDate = new Date(start.date)
  const endDate = new Date(end.date)
  const hours = Math.abs(endDate - startDate) / 36e5

  return {
    amount,
    percent,
    startPrice,
    endPrice,
    startLabel: startDate.toLocaleString('en-US', {month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'}),
    endLabel: endDate.toLocaleString('en-US', {month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'}),
    spanLabel: hours >= 24 ? `${(hours / 24).toFixed(1)}d` : `${hours.toFixed(1)}h`,
  }
})

async function loadQuote() {
  try {
    quote.value = await api.get(`/stocks/quote/${encodeURIComponent(ticker.value)}`)
  } catch (err) {
    toast.add({severity: 'error', summary: 'Failed to refresh', detail: err.message, life: 2000})
  }
}

async function loadFx() {
  try {
    const data = await api.get('/stocks/fx/ils-to-usd')
    ilsToUsd.value = data?.ilsToUsd ?? null
  } catch {
  }
}

async function loadHistory() {
  chartLoading.value = true
  try {
    const points = selectedRange.value === '1d' ? 160 : 50
    history.value = await historyStore.fetchHistory(ticker.value, selectedRange.value, points)
  } catch (err) {
    toast.add({severity: 'error', summary: 'Failed to load chart', detail: err.message, life: 3000})
  } finally {
    chartLoading.value = false
  }
}

async function loadData() {
  loading.value = true
  await Promise.all([loadQuote(), loadHistory(), loadFx()])
  loading.value = false
}

async function ensureWatchlistLoaded() {
  if (watchlist.items.length || watchlist.loading) return
  try {
    await watchlist.fetchWatchlist()
  } catch {
  }
}

async function ensurePortfolioLoaded() {
  if (portfolio.positions.length || portfolio.loading) return
  try {
    await portfolio.fetchPortfolio()
  } catch {
  }
}

function startAutoRefresh() {
  clearInterval(refreshTimer)
  refreshTimer = setInterval(() => {
    now.value = new Date()
    loadQuote()
  }, 60000)
}

onMounted(() => {
  ensureWatchlistLoaded()
  ensurePortfolioLoaded()
  loadData()
  startAutoRefresh()
})
onUnmounted(() => clearInterval(refreshTimer))
watch(selectedRange, loadHistory)
watch(() => route.params.ticker, (t) => {
  ticker.value = t?.toUpperCase()
  ensurePortfolioLoaded()
  loadData()
  startAutoRefresh()
})

async function toggleWatchlist() {
  const existing = watchlist.items.find((i) => i.ticker === ticker.value)
  if (existing) {
    await watchlist.removeItem(existing._id)
    toast.add({severity: 'info', summary: 'Removed from watchlist', life: 2000})
  } else {
    await watchlist.addItem(ticker.value, quote.value?.name)
    toast.add({severity: 'success', summary: 'Added to watchlist', life: 2000})
  }
}

const isWatched = () => watchlist.items.some((i) => i.ticker === ticker.value)

function openLots() {
  if (!heldPosition.value) return
  router.push(`/position/${encodeURIComponent(ticker.value)}`)
}

function openSell() {
  if (!heldPosition.value) return
  showSellModal.value = true
}

function confirmDelete() {
  if (!heldPosition.value) return
  confirm.require({
    message: `Remove ${ticker.value} from your portfolio? This deletes the position but keeps its transaction history.`,
    header: 'Confirm',
    icon: 'pi pi-exclamation-triangle',
    acceptClass: 'p-button-danger',
    accept: async () => {
      await portfolio.deletePosition(heldPosition.value._id)
      toast.add({severity: 'success', summary: 'Removed', life: 2000})
      router.push('/holdings')
    },
  })
}

function handleChartSelection(points) {
  selectedChartPoints.value = points
}
</script>

<template>
  <div class="stock-detail">
    <header class="detail-header">
      <Button icon="pi pi-arrow-left" text rounded @click="router.back()"/>
      <div class="header-info">
        <h1 class="gradient-title">{{ ticker }}</h1>
        <span class="text-muted">{{ quote?.name }}</span>
      </div>
      <div class="header-actions">
        <Button
            v-tooltip.bottom="'Buy'"
            icon="pi pi-plus-circle"
            rounded
            text
            @click="showTxModal = true"
        />
        <Button
            v-if="heldPosition"
            v-tooltip.bottom="'View lots'"
            icon="pi pi-list"
            rounded
            text
            @click="openLots"
        />
        <Button
            v-if="heldPosition"
            v-tooltip.bottom="'Sell'"
            icon="pi pi-arrow-up-right"
            rounded
            text
            severity="warn"
            @click="openSell"
        />

        <Button
            v-tooltip.bottom="'Set price alert'"
            icon="pi pi-bell"
            rounded
            text
            @click="showAlertModal = true"
        />
        <!--        <Button-->
        <!--            v-tooltip.bottom="isWatched() ? 'Remove from watchlist' : 'Add to watchlist'"-->
        <!--            :icon="isWatched() ? 'pi pi-trash' : 'pi pi-eye'"-->
        <!--            :outlined="isWatched()"-->
        <!--            :severity="isWatched() ? 'danger' : undefined"-->
        <!--            text-->
        <!--            rounded-->
        <!--            @click="toggleWatchlist"-->
        <!--        />-->
      </div>
    </header>

    <div v-if="quote" class="quote-summary">
      <div class="price-row">
        <div class="price-main">
          <div class="current-price">
            {{ useTickerCurrency(quote.price, ticker) }}
            <span v-if="shekelValue != null">
               {{ useCurrency(shekelValue, 'ILS') }}
            </span>
          </div>
          <p :class="gainLossClass(rangeChange.amount)" class="price-change">
            {{ useTickerCurrency(rangeChange.amount, ticker) }} ({{ usePercent(rangeChange.percent) }})
          </p>
          <div v-if="extendedHours" class="extended-row">
            <span class="extended-price">
              {{ useTickerCurrency(extendedHours.price, ticker) }}
              <span v-if="extendedHours.shekelPrice != null" class="extended-ils">
                {{ useCurrency(extendedHours.shekelPrice, 'ILS') }}
              </span>
            </span>
            <span class="extended-change" :class="gainLossClass(extendedHours.change)">
              {{ useTickerCurrency(extendedHours.change, ticker) }} ({{ usePercent(extendedHours.changePercent) }})
            </span>
          </div>
          <p v-if="extendedHours" class="hours-line text-muted">
            {{ extendedHours.label }}{{ extendedHours.timeLabel ? `: ${extendedHours.timeLabel}` : '' }}
          </p>
          <p v-else-if="sessionMetaText" class="hours-line text-muted">{{ sessionMetaText }}</p>
        </div>

      </div>
    </div>
    <div v-else-if="loading" class="quote-summary">
      <div class="price-skeleton"/>
    </div>

    <div class="chart-controls">
      <SelectButton v-model="selectedRange" :options="ranges" size="small"/>
      <SelectButton v-model="chartMode" :options="chartModes" size="small"/>
    </div>

    <div class="chart-measure">
      <div class="text-muted measure-hint">
        Tap two points on the chart to measure delta.
      </div>
      <div v-if="selectedDelta" class="measure-summary">
        <span :class="gainLossClass(selectedDelta.amount)">
          {{ useTickerCurrency(selectedDelta.amount, ticker) }} ({{ usePercent(selectedDelta.percent) }})
        </span>
        <span class="text-muted">
          {{
            useTickerCurrency(selectedDelta.startPrice, ticker)
          }} to {{ useTickerCurrency(selectedDelta.endPrice, ticker) }}
        </span>
        <span class="text-muted">{{ selectedDelta.startLabel }} to {{
            selectedDelta.endLabel
          }} · {{ selectedDelta.spanLabel }}</span>
      </div>
    </div>

    <StockChart
        :key="`${ticker}-${selectedRange}-${chartMode}`"
        :data="history"
        :loading="chartLoading"
        :mode="chartMode"
        :range="selectedRange"
        :ticker="ticker"
        :current-price="previousCloseLine"
        @selection-change="handleChartSelection"
    />

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

    <AddTransactionModal v-model:visible="showTxModal" :default-ticker="ticker"/>
    <AddTransactionModal
        v-model:visible="showSellModal"
        :default-price="heldPosition?.currentPrice ?? quote?.price ?? null"
        :default-ticker="ticker"
        :max-shares="heldPosition?.shares ?? null"
        default-type="sell"
        @hide="ensurePortfolioLoaded"
    />
    <AlertModal v-model:visible="showAlertModal" :current-price="quote?.price" :ticker="ticker"/>
  </div>
</template>

<style scoped>
.stock-detail {
  padding: 0.5rem 1rem 2rem;
}

.detail-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.header-info {
  flex: 1;
}

.header-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.125rem;
  flex-wrap: wrap;
}

.header-info h1 {
  font-size: 1.3rem;
  line-height: 1;
}

.header-info span {
  font-size: 0.82rem;
}

.quote-summary {
  margin-bottom: 1rem;
}

.price-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}

.price-main {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.25rem;
}

.current-price {
  font-size: 2.2rem;
  font-weight: 700;
  display: flex;
  justify-content: space-between;
  width: 100%;
}

.neon-green {
  color: var(--neon-green);
  text-shadow: 0 0 20px rgba(0, 255, 136, 0.6);
}

.neon-red {
  color: var(--neon-red);
  text-shadow: 0 0 20px rgba(255, 51, 102, 0.6);
}

.price-change {
  font-size: 1rem;
}

.extended-row {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.extended-price {
  font-size: 1.65rem;
  font-weight: 700;
  color: var(--text-primary);
}

.extended-ils {
  margin-left: 0.45rem;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.extended-change {
  font-size: 1rem;
  font-weight: 700;
}

.price-ils {
  font-size: 1rem;
  font-weight: 600;
  white-space: nowrap;
  padding-top: 0.35rem;
}

.hours-line {
  font-size: 0.82rem;
  margin-top: 0.35rem;
}

.price-skeleton {
  height: 2.5rem;
  width: 160px;
  background: var(--bg-card);
  border-radius: 6px;
  animation: shimmer 1.5s infinite;
  background: linear-gradient(90deg, var(--border) 25%, #475569 50%, var(--border) 75%);
  background-size: 200% 100%;
}

.chart-controls {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 0.75rem;
}

.chart-measure {
  margin-bottom: 0.75rem;
}

.measure-hint {
  font-size: 0.78rem;
  margin-bottom: 0.3rem;
}

.measure-summary {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font-size: 0.84rem;
}

.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  margin-top: 1rem;
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
}

.stat {
  padding: 0.75rem 1rem;
  display: flex;
  justify-content: space-between;
  border-bottom: 1px solid var(--border);
  font-size: 0.88rem;
}

.stat:nth-last-child(-n+2) {
  border-bottom: none;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

@media (max-width: 480px) {
  .detail-header {
    align-items: flex-start;
  }

  .header-actions {
    max-width: 11rem;
  }

  .price-row {
    flex-direction: column;
    gap: 0.35rem;
  }

  .price-ils {
    padding-top: 0;
  }
}
</style>
