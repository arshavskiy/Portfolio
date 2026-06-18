<script setup>
import {computed, onMounted, onUnmounted, ref, watch} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {useToast} from 'primevue/usetoast'
import {gainLossClass, useCurrency, useLargeNumber, usePercent, useTickerCurrency} from '@/composables/useFormat'
import {useFeeProfileStore} from '@/stores/feeProfiles'
import {useHistoryStore} from '@/stores/history'
import api from '@/composables/useApi'
import {fetchCachedQuote} from '@/composables/useQuoteCache'
import {getMarketHoursState, MARKET_HOURS_BY_GROUP} from '@/composables/useMarketHours'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import AddTransactionModal from '@/components/ui/AddTransactionModal.vue'
import AlertModal from '@/components/ui/AlertModal.vue'
import DividendModal from '@/components/ui/DividendModal.vue'
import EditTransactionModal from '@/components/ui/EditTransactionModal.vue'
import StockChart from '@/components/charts/StockChart.vue'
import RangeBar from '@/components/ui/RangeBar.vue'
import AppLoader from '@/components/ui/AppLoader.vue'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const historyStore = useHistoryStore()

const ticker = computed(() => decodeURIComponent(route.params.ticker).toUpperCase())
const transactions = ref([])
const quote = ref(null)
const currentPrice = ref(null)
const companyName = ref('')
const loading = ref(false)
const watchedItem = ref(null)
const showModal = ref(false)
const showAlertModal = ref(false)
const showDividendModal = ref(false)
const showSimulator = ref(false)
const editingTx = ref(null)
const simPrice = ref(null)
const simFeeProfileId = ref(null)
const feeStore = useFeeProfileStore()
const history = ref([])
const chartLoading = ref(false)
const selectedChartPoints = ref([])
const ilsToUsd = ref(null)
const now = ref(new Date())
const selectedRange = ref('1d')
const chartMode = ref('line')
const chartModes = ['line', 'candle']
const watchlistNavTickers = ref([])
let refreshTimer = null
let pageRequestId = 0
const WATCHLIST_TICKER_KEY = 'watchlist-opened-ticker'
const WATCHLIST_RETURN_KEY = 'watchlist-return-from-position'
const WATCHLIST_NAV_KEY = 'watchlist-filtered-tickers'
const RANGE_LABELS = {
  '1d': '1D',
  '5d': '5D',
  '1mo': '1M',
  '6mo': '6M',
  '1y': '1Y',
}

onMounted(async () => {
  loadWatchlistNavContext()
  if (!feeStore.profiles.length) await feeStore.fetchProfiles()
  await loadPositionData()
  startAutoRefresh()
})
onUnmounted(() => clearInterval(refreshTimer))

// Pre-fill sim price with current price once loaded
watch(currentPrice, (p) => {
  if (p && !simPrice.value) simPrice.value = p
})
watch(selectedRange, loadHistory)
watch(ticker, async () => {
  loadWatchlistNavContext()
  transactions.value = []
  quote.value = null
  currentPrice.value = null
  companyName.value = ''
  watchedItem.value = null
  selectedChartPoints.value = []
  await loadPositionData()
  startAutoRefresh()
})

async function loadPositionData() {
  const requestId = ++pageRequestId
  loading.value = true
  try {
    await Promise.all([fetchLots(), fetchQuote(), loadHistory(), loadFx(), fetchWatchlistItem()])
  } finally {
    if (requestId === pageRequestId) loading.value = false
  }
}

async function fetchLots() {
  try {
    const data = await api.get(`/portfolio/transactions?ticker=${encodeURIComponent(ticker.value)}&limit=500`)
    transactions.value = data.transactions.sort((a, b) => new Date(a.date) - new Date(b.date))
  } catch (err) {
    toast.add({severity: 'error', summary: 'Failed to load', detail: err.message, life: 3000})
  }
}

async function fetchQuote() {
  try {
    const q = await fetchCachedQuote(ticker.value)
    quote.value = q
    currentPrice.value = q.price
    if (q.name) companyName.value = q.name
  } catch {
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
    history.value = []
  } finally {
    chartLoading.value = false
  }
}

// Dividend transactions for this position
const dividendTxs = computed(() =>
    transactions.value.filter((tx) => tx.type === 'dividend').sort((a, b) => new Date(b.date) - new Date(a.date))
)
const totalDividends = computed(() => dividendTxs.value.reduce((s, d) => s + (d.total || 0), 0))

// Running weighted average per lot
const lots = computed(() => {
  let shares = 0
  let totalCost = 0
  return transactions.value.map((tx) => {
    if (tx.type === 'buy') {
      totalCost += tx.shares * tx.price
      shares += tx.shares
    } else {
      totalCost -= (totalCost / shares) * tx.shares
      shares -= tx.shares
    }
    const avgCost = shares > 0 ? totalCost / shares : 0
    return {...tx, runningShares: shares, runningAvg: avgCost}
  })
})

// Full summary including stored fees, display-only default fee estimates, realized tax,
// and estimated tax if the remaining shares were sold now.
const summary = computed(() => {
  if (!lots.value.length) return null
  const last = lots.value[lots.value.length - 1]
  const shares = last.runningShares
  const avgCost = last.runningAvg
  const totalCost = shares * avgCost

  // Fee rows keep their original currency for display. Net totals convert mixed-currency
  // fees into ticker currency so return math stays in one currency.
  let totalBuyFees = 0
  let totalSellFees = 0
  let totalTax = 0
  let realizedGross = 0   // sell proceeds before fees/tax
  let realizedNet = 0     // sell proceeds after fees/tax
  const feeRows = []

  for (const tx of transactions.value) {
    const feeAmount = effectiveFeeAmountOf(tx)
    const feeCurrency = feeCurrencyOf(tx)
    const feeInTickerCurrency = convertFeeToTickerCurrency(feeAmount, feeCurrency)
    if (tx.type === 'buy') {
      totalBuyFees += feeInTickerCurrency
      addFeeRow(feeRows, 'buy', feeAmount, feeCurrency, isDefaultFeeEstimate(tx))
    } else {
      totalSellFees += feeInTickerCurrency
      addFeeRow(feeRows, 'sell', feeAmount, feeCurrency, isDefaultFeeEstimate(tx))
      totalTax += tx.taxAmount || 0
      realizedGross += tx.total || 0
      realizedNet += tx.total - feeInTickerCurrency - (tx.taxAmount || 0)
    }
  }

  const totalFees = totalBuyFees + totalSellFees
  const currentValue = currentPrice.value != null ? shares * currentPrice.value : null

  // Gross P&L = current value - cost basis (ignores fees/tax)
  const grossPnl = currentValue != null ? currentValue - totalCost : null
  const grossPnlPct = avgCost > 0 && currentPrice.value != null
      ? ((currentPrice.value - avgCost) / avgCost) * 100 : null

  // Estimated future sell tax if sold at current price
  const unrealizedGain = currentValue != null ? currentValue - totalCost : null
  // Tax rate from a saved fee profile, falling back to the active default profile.
  const taxRate = transactions.value.find(t => t.feeProfile?.capitalGainsTax)?.feeProfile?.capitalGainsTax ||
      defaultFeeProfile()?.capitalGainsTax ||
      0
  const estimatedTax = unrealizedGain != null && unrealizedGain > 0 && taxRate > 0
      ? Math.round(unrealizedGain * taxRate / 100 * 100) / 100 : 0

  // Net P&L = gross P&L - all fees paid - realized tax - estimated tax if sold now.
  const netPnl = grossPnl != null ? grossPnl - totalFees - totalTax - estimatedTax : null
  const netPnlPct = totalCost > 0 && netPnl != null
      ? (netPnl / (totalCost + totalFees)) * 100 : null

  return {
    shares, avgCost, totalCost, currentValue,
    grossPnl, grossPnlPct,
    netPnl, netPnlPct,
    totalBuyFees, totalSellFees, totalFees,
    feeRows,
    totalTax, taxRate, estimatedTax,
    realizedGross, realizedNet,
  }
})

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'})
}

function fmt(val) {
  return val >= 0 ? '+' : ''
}

function formatTaxPercent(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '0%'
  return `${num.toFixed(3).replace(/(\.\d*?[1-9])0+$/u, '$1').replace(/\.0+$/u, '')}%`
}

const tickerCurr = computed(() => ticker.value.endsWith('.TA') ? 'ILS' : 'USD')
const currSymbol = computed(() => tickerCurr.value === 'ILS' ? '₪' : '$')

function isAllowedFeeCurrency(profileCurrency, transactionCurrency) {
  if (profileCurrency === transactionCurrency) return true
  return transactionCurrency === 'USD' && profileCurrency === 'ILS'
}

const matchingFeeProfiles = computed(() =>
    feeStore.profiles.filter((p) => isAllowedFeeCurrency(p.currency || 'USD', tickerCurr.value))
)

function defaultFeeProfile() {
  function preferredProfile(currency) {
    const profiles = feeStore.profiles.filter((p) => (p.currency || 'USD') === currency)
    return profiles.find((p) => p.isDefault) || (profiles.length === 1 ? profiles[0] : null)
  }

  return preferredProfile(tickerCurr.value) ||
      (tickerCurr.value === 'USD' ? preferredProfile('ILS') : null)
}

function feeProfileOf(tx) {
  return tx.feeProfile || (tx.feeAmount ? null : defaultFeeProfile())
}

function feeCurrencyOf(tx) {
  return feeProfileOf(tx)?.currency || tickerCurr.value
}

function isDefaultFeeEstimate(tx) {
  return !tx.feeProfile && !(tx.feeAmount > 0) && Boolean(defaultFeeProfile())
}

function effectiveFeeAmountOf(tx) {
  if (tx.feeAmount > 0) return tx.feeAmount
  const profile = feeProfileOf(tx)
  if (!profile) return 0
  const total = tx.total || (tx.shares || 0) * (tx.price || 0)
  const rule = tx.type === 'buy' ? profile.buyFee : profile.sellFee
  return calcFee(rule, total)
}

function convertFeeToTickerCurrency(amount, feeCurrency) {
  if (!amount || feeCurrency === tickerCurr.value) return amount || 0
  if (feeCurrency === 'ILS' && tickerCurr.value === 'USD' && Number.isFinite(ilsToUsd.value) && ilsToUsd.value > 0) {
    return amount * ilsToUsd.value
  }
  if (feeCurrency === 'USD' && tickerCurr.value === 'ILS' && Number.isFinite(ilsToUsd.value) && ilsToUsd.value > 0) {
    return amount / ilsToUsd.value
  }
  return amount || 0
}

function addFeeRow(rows, type, amount, currency, estimated = false) {
  if (!amount) return
  const key = `${type}:${currency}:${estimated ? 'default' : 'saved'}`
  const existing = rows.find((row) => row.key === key)
  if (existing) {
    existing.amount += amount
    return
  }
  rows.push({key, type, amount, currency, estimated})
}

function netProceedsOf(tx) {
  const fee = convertFeeToTickerCurrency(effectiveFeeAmountOf(tx), feeCurrencyOf(tx))
  return (tx.total || 0) - fee - (tx.taxAmount || 0)
}

function calcFee(rule, total) {
  if (!rule || !rule.value) return 0
  let fee = rule.type === 'percent' ? total * rule.value : rule.value
  if (rule.minFee && fee < rule.minFee) fee = rule.minFee
  return Math.round(fee * 100) / 100
}

const marketGroup = computed(() => {
  if (ticker.value.endsWith('.TA')) return 'Israel'
  if (/-USD$/.test(ticker.value)) return 'Crypto'
  return 'US'
})
const marketMeta = computed(() => {
  const market = MARKET_HOURS_BY_GROUP[marketGroup.value]
  return market ? getMarketHoursState(market, now.value) : null
})
const shekelValue = computed(() => {
  if (quote.value?.price == null) return null
  if (marketGroup.value === 'Israel' || marketGroup.value === 'US') return null
  if (!Number.isFinite(ilsToUsd.value) || ilsToUsd.value <= 0) return null
  return quote.value.price / ilsToUsd.value
})
const quoteChange = computed(() => ({
  amount: quote.value?.change ?? null,
  percent: quote.value?.changePercent ?? null,
}))
const rangeChange = computed(() => {
  const rows = history.value.filter((row) => Number.isFinite(row?.close))
  if (rows.length < 2) return null

  const firstClose = rows[0].close
  const lastClose = rows[rows.length - 1].close
  if (!Number.isFinite(firstClose) || !Number.isFinite(lastClose) || firstClose === 0) return null

  const amount = lastClose - firstClose
  return {
    amount,
    percent: (amount / firstClose) * 100,
  }
})
const displayedPriceChange = computed(() => rangeChange.value || quoteChange.value)
const displayedPriceChangeLabel = computed(() => rangeChange.value
  ? `${RANGE_LABELS[selectedRange.value] || selectedRange.value} range`
  : 'Today'
)
const previousCloseLine = computed(() => quote.value?.previousClose ?? null)
const headerSubtitle = computed(() => summary.value ? `${ticker.value} · Transaction Lots` : `${ticker.value} · Market Overview`)
const isWatched = computed(() => Boolean(watchedItem.value))
const watchlistNavIndex = computed(() => watchlistNavTickers.value.indexOf(ticker.value))
const previousWatchlistTicker = computed(() => {
  const index = watchlistNavIndex.value
  return index > 0 ? watchlistNavTickers.value[index - 1] : null
})
const nextWatchlistTicker = computed(() => {
  const index = watchlistNavIndex.value
  return index >= 0 && index < watchlistNavTickers.value.length - 1 ? watchlistNavTickers.value[index + 1] : null
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

function calculateExtendedChange(price, change) {
  if (price == null) return {change: null, changePercent: null}
  const amount = change ?? (quote.value?.price != null ? price - quote.value.price : null)
  if (amount == null) return {change: null, changePercent: null}
  const previous = price - amount
  const percent = Number.isFinite(previous) && previous !== 0 ? (amount / previous) * 100 : null
  return {change: amount, changePercent: percent}
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
          : quote.value.lastPostMarketPrice != null
              ? {
                label: 'After hours (last seen)',
                price: quote.value.lastPostMarketPrice,
                change: quote.value.lastPostMarketChange,
                changePercent: quote.value.lastPostMarketChangePercent,
                time: quote.value.lastPostMarketTime,
              }
              : quote.value.lastPreMarketPrice != null
                  ? {
                    label: 'Pre-market (last seen)',
                    price: quote.value.lastPreMarketPrice,
                    change: quote.value.lastPreMarketChange,
                    changePercent: quote.value.lastPreMarketChangePercent,
                    time: quote.value.lastPreMarketTime,
                  }
                  : null

  if (!source || source.price == null) return null
  const derived = calculateExtendedChange(source.price, source.change)

  return {
    ...source,
    change: source.change ?? derived.change,
    changePercent: source.changePercent ?? derived.changePercent,
    shekelPrice: Number.isFinite(ilsToUsd.value) && ilsToUsd.value > 0 && marketGroup.value !== 'Israel' && marketGroup.value !== 'US'
        ? source.price / ilsToUsd.value
        : null,
    timeLabel: formatExtendedHoursTime(source.time, marketMeta.value?.timezone),
  }
})
const extendedHoursChangeText = computed(() => {
  if (!extendedHours.value) return ''
  if (extendedHours.value.change == null && extendedHours.value.changePercent == null) return ''
  return `${useTickerCurrency(extendedHours.value.change, ticker.value)} (${usePercent(extendedHours.value.changePercent)})`
})
const extendedHoursStats = computed(() => {
  if (!extendedHours.value) return []
  return [
    {
      label: `${extendedHours.value.label} Price`,
      value: useTickerCurrency(extendedHours.value.price, ticker.value),
    },
    {
      label: `${extendedHours.value.label} Change`,
      value: extendedHoursChangeText.value || '—',
      valueClass: gainLossClass(extendedHours.value.change),
    },
    {
      label: `${extendedHours.value.label} Trade`,
      value: extendedHours.value.timeLabel || '—',
    },
  ]
})

const simulation = computed(() => {
  if (!simPrice.value || !summary.value) return null
  const {shares, avgCost, totalCost, totalBuyFees} = summary.value
  const sellPrice = simPrice.value
  const grossProceeds = sellPrice * shares

  // Get sell fee from selected profile
  const profile = feeStore.profiles.find(p => p._id === simFeeProfileId.value)
  const sellFee = calcFee(profile?.sellFee, grossProceeds)
  const sellFeeCurrency = profile?.currency || tickerCurr.value
  const sellFeeInTickerCurrency = convertFeeToTickerCurrency(sellFee, sellFeeCurrency)

  // Capital gains tax on profit only
  const taxRate = profile?.capitalGainsTax || 0
  const gain = grossProceeds - totalCost
  const tax = gain > 0 && taxRate > 0
      ? Math.round(gain * taxRate / 100 * 100) / 100
      : 0

  const netProceeds = grossProceeds - sellFeeInTickerCurrency - tax
  // Net profit = net proceeds - original cost - buy fees already paid
  const netProfit = netProceeds - totalCost - totalBuyFees
  const netProfitPct = (totalCost + totalBuyFees) > 0
      ? (netProfit / (totalCost + totalBuyFees)) * 100 : 0

  return {
    sellPrice, shares, grossProceeds,
    sellFee, sellFeeCurrency, sellFeeInTickerCurrency, tax, taxRate,
    netProceeds, netProfit, netProfitPct,
    profileName: profile?.name || null,
  }
})

watch([tickerCurr, () => feeStore.profiles], ([txCurrency, profiles]) => {
  if (!simFeeProfileId.value || !profiles.some((p) => p._id === simFeeProfileId.value && isAllowedFeeCurrency(p.currency || 'USD', txCurrency))) {
    simFeeProfileId.value = (
      profiles.find((p) => p.isDefault && (p.currency || 'USD') === txCurrency) ||
      (txCurrency === 'USD' ? profiles.find((p) => p.isDefault && (p.currency || 'USD') === 'ILS') : null)
    )?._id || null
  }
}, {immediate: true})

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

function handleChartSelection(points) {
  selectedChartPoints.value = points
}

function loadWatchlistNavContext() {
  try {
    const tickers = JSON.parse(sessionStorage.getItem(WATCHLIST_NAV_KEY) || '[]')
    watchlistNavTickers.value = Array.isArray(tickers)
        ? tickers.map((value) => String(value).toUpperCase()).filter(Boolean)
        : []
  } catch {
    watchlistNavTickers.value = []
  }
}

function openWatchlistTicker(nextTicker) {
  if (!nextTicker) return
  sessionStorage.setItem(WATCHLIST_TICKER_KEY, nextTicker)
  sessionStorage.setItem(WATCHLIST_RETURN_KEY, '1')
  router.push(`/position/${encodeURIComponent(nextTicker)}`)
}

function returnToWatchlist() {
  sessionStorage.setItem(WATCHLIST_TICKER_KEY, ticker.value)
  sessionStorage.setItem(WATCHLIST_RETURN_KEY, '1')
  router.push('/watchlist')
}

async function fetchWatchlistItem() {
  try {
    const data = await api.get(`/watchlist/item/${encodeURIComponent(ticker.value)}`)
    watchedItem.value = data?.item || null
  } catch {
    watchedItem.value = null
  }
}

function startAutoRefresh() {
  clearInterval(refreshTimer)
  refreshTimer = setInterval(() => {
    now.value = new Date()
    fetchQuote()
  }, 60000)
}

async function toggleWatchlist() {
  if (watchedItem.value) {
    await api.delete(`/watchlist/${watchedItem.value._id}`)
    watchedItem.value = null
    toast.add({severity: 'info', summary: 'Removed from watchlist', life: 2000})
  } else {
    watchedItem.value = await api.post('/watchlist', {ticker: ticker.value, companyName: quote.value?.name})
    toast.add({severity: 'success', summary: 'Added to watchlist', life: 2000})
  }
}
</script>

<template>
  <div class="position-detail">
    <Button
        v-if="previousWatchlistTicker"
        v-tooltip.right="`Previous: ${previousWatchlistTicker}`"
        aria-label="Previous watchlist stock"
        class="watchlist-slide-handle watchlist-slide-handle-left"
        icon="pi pi-angle-left"
        @click="openWatchlistTicker(previousWatchlistTicker)"
    />
    <Button
        v-if="nextWatchlistTicker"
        v-tooltip.left="`Next: ${nextWatchlistTicker}`"
        aria-label="Next watchlist stock"
        class="watchlist-slide-handle watchlist-slide-handle-right"
        icon="pi pi-angle-right"
        @click="openWatchlistTicker(nextWatchlistTicker)"
    />
    <header class="page-header">
      <Button icon="pi pi-arrow-left" rounded text @click="returnToWatchlist"/>
      <div class="header-info">
        <h1 class="gradient-title">{{ ticker }}</h1>
        <span class="text-muted">{{ companyName || headerSubtitle }}</span>
      </div>
      <div class="header-actions">
        <Button icon="pi pi-plus" rounded text @click="showModal = true"/>
        <Button
            v-if="summary"
            v-tooltip.bottom="'Log dividend'"
            icon="pi pi-dollar"
            rounded
            text
            @click="showDividendModal = true"
        />
        <Button
            v-tooltip.bottom="'Set price alert'"
            icon="pi pi-bell"
            rounded
            text
            @click="showAlertModal = true"
        />
        <Button
            v-tooltip.bottom="isWatched ? 'Remove from watchlist' : 'Add to watchlist'"
            :icon="isWatched ? 'pi pi-trash' : 'pi pi-eye'"
            :outlined="isWatched"
            :severity="isWatched ? 'danger' : undefined"
            rounded
            text
            @click="toggleWatchlist"
        />
      </div>
    </header>

    <div v-if="loading" class="page-loader">
      <AppLoader/>
    </div>

    <template v-else>
      <div v-if="quote" class="quote-summary">
        <div class="price-row">
          <div class="price-main">
            <div class="current-price">
              {{ useTickerCurrency(quote.price, ticker) }}
              <span v-if="shekelValue != null">
               {{ useCurrency(shekelValue, 'ILS') }}
            </span>
            </div>
            <p :class="gainLossClass(displayedPriceChange.amount)" class="price-change">
              {{ useTickerCurrency(displayedPriceChange.amount, ticker) }} ({{ usePercent(displayedPriceChange.percent) }})
              <span class="price-change-label">{{ displayedPriceChangeLabel }}</span>
            </p>
            <div v-if="extendedHours" class="extended-row">
            <span class="extended-price">
              {{ useTickerCurrency(extendedHours.price, ticker) }}
              <span v-if="extendedHours.shekelPrice != null" class="extended-ils">
                {{ useCurrency(extendedHours.shekelPrice, 'ILS') }}
              </span>
            </span>
              <span v-if="extendedHoursChangeText" :class="gainLossClass(extendedHours.change)" class="extended-change">
              {{ extendedHoursChangeText }}
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

      <template v-if="summary">
        <!-- Gross P&L card -->
        <div :class="gainLossClass(summary.grossPnl)" class="pnl-card">
          <div class="pnl-header">
            <!--          <span class="pnl-label text-muted">Gross P&L</span>-->
            <span class="pnl-label text-muted">Avg {{
                useTickerCurrency(summary.avgCost, ticker)
              }} → {{ currentPrice != null ? useTickerCurrency(currentPrice, ticker) : '…' }}</span>
          </div>
          <div class="pnl-row">
          <span class="pnl-pct" :class="gainLossClass(summary.grossPnlPct)">
            {{ summary.grossPnlPct != null ? fmt(summary.grossPnlPct) + summary.grossPnlPct.toFixed(2) + '%' : '—' }}
          </span>
            <span :class="gainLossClass(summary.grossPnl)" class="pnl-value">
            {{ summary.grossPnl != null ? fmt(summary.grossPnl) + useTickerCurrency(summary.grossPnl, ticker) : '—' }}
          </span>
          </div>
        </div>

        <!-- Net P&L card (after all fees + tax) -->
        <div v-if="summary.totalFees > 0 || summary.totalTax > 0 || summary.estimatedTax > 0" :class="gainLossClass(summary.netPnl)"
             class="pnl-card net-card">
          <div class="pnl-header">
            <span class="pnl-label text-muted">Net P&L <span class="after-badge">after fees & tax</span></span>
            <span :class="gainLossClass(summary.netPnl)" class="pnl-label">
            {{ summary.netPnl != null ? fmt(summary.netPnl) + useTickerCurrency(summary.netPnl, ticker) : '—' }}
          </span>
          </div>
          <div class="fee-breakdown">
            <div v-for="row in summary.feeRows" :key="row.key" class="fee-row">
              <span class="text-muted">{{ row.type === 'buy' ? 'Buy' : 'Sell' }} fees {{ row.estimated ? '(default)' : 'paid' }}</span>
              <span class="loss">-{{ useCurrency(row.amount, row.currency) }}</span>
            </div>
            <div v-if="summary.totalTax > 0" class="fee-row">
              <span class="text-muted">Capital gains tax paid</span>
              <span class="loss">-{{ useTickerCurrency(summary.totalTax, ticker) }}</span>
            </div>
            <div v-if="summary.estimatedTax > 0" class="fee-row est-row">
              <span class="text-muted">Est. tax if sold now ({{ formatTaxPercent(summary.taxRate) }})</span>
              <span class="loss">-{{ useTickerCurrency(summary.estimatedTax, ticker) }}</span>
            </div>
          </div>
          <div v-if="summary.netPnlPct != null" class="fee-row net-return-row">
            <span class="text-muted net-return-label">Net Return</span>
            <span :class="gainLossClass(summary.netPnlPct)" class="net-pct">
              {{ fmt(summary.netPnlPct) }}{{ summary.netPnlPct.toFixed(2) }}%
            </span>
          </div>
        </div>

        <!-- Stats grid -->
        <div class="stats-row">
          <div class="stat-item">
            <span class="text-muted">Shares held</span>
            <span>{{ summary.shares.toFixed(4).replace(/\.?0+$/, '') }}</span>
          </div>
          <div class="stat-item">
            <span class="text-muted">Avg cost</span>
            <span>{{ useTickerCurrency(summary.avgCost, ticker) }}</span>
          </div>
          <div class="stat-item">
            <span class="text-muted">Total invested</span>
            <span>{{ useTickerCurrency(summary.totalCost, ticker) }}</span>
          </div>
          <div class="stat-item">
            <span class="text-muted">Current value</span>
            <span>{{ summary.currentValue != null ? useTickerCurrency(summary.currentValue, ticker) : '…' }}</span>
          </div>
        </div>
      </template>

      <div class="chart-controls">
        <RangeBar v-model="selectedRange" class="page-range"/>
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
          <span class="text-muted">
          {{ selectedDelta.startLabel }} to {{ selectedDelta.endLabel }} · {{ selectedDelta.spanLabel }}
        </span>
        </div>
      </div>

      <StockChart
          :key="`${ticker}-${selectedRange}-${chartMode}`"
          :current-price="previousCloseLine"
          :data="history"
          :loading="chartLoading"
          :mode="chartMode"
          :range="selectedRange"
          :ticker="ticker"
          @selection-change="handleChartSelection"
      />

      <div v-if="quote" class="stats-grid">
        <div
            v-for="row in extendedHoursStats"
            :key="row.label"
            class="stat stat-extended"
        >
          <span class="text-muted">{{ row.label }}</span>
          <span :class="row.valueClass">{{ row.value }}</span>
        </div>
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

      <!-- Sell Simulator -->
      <div v-if="summary" class="sim-wrap">
        <button class="sim-toggle" @click="showSimulator = !showSimulator">
          <i class="pi pi-calculator"/>
          Sell Simulator
          <i :class="showSimulator ? 'pi pi-chevron-up' : 'pi pi-chevron-down'" class="sim-chevron"/>
        </button>

        <div v-if="showSimulator" class="sim-body">
          <div class="sim-inputs">
            <div class="sim-field">
              <label>Sell price per share</label>
              <InputNumber
                  v-model="simPrice"
                  :currency="tickerCurr"
                  :max-fraction-digits="4"
                  :min="0.001"
                  fluid
                  mode="currency"
              />
            </div>
            <div class="sim-field">
              <label>Fee profile</label>
              <Select
                  v-model="simFeeProfileId"
                  :options="[{ label: 'No fee profile', value: null }, ...matchingFeeProfiles.map(p => ({ label: p.name, value: p._id }))]"
                  fluid
                  option-label="label"
                  option-value="value"
              />
            </div>
          </div>

          <div v-if="simulation" class="sim-results">
            <div class="sim-row">
              <span class="text-muted">Gross proceeds</span>
              <span>{{ currSymbol }}{{ simulation.grossProceeds.toFixed(2) }}</span>
            </div>
            <div v-if="simulation.sellFee > 0" class="sim-row">
              <span class="text-muted">Sell fee{{ simulation.profileName ? ` · ${simulation.profileName}` : '' }}</span>
              <span class="loss">-{{ useCurrency(simulation.sellFee, simulation.sellFeeCurrency) }}</span>
            </div>
            <div v-if="simulation.tax > 0" class="sim-row">
              <span class="text-muted">Capital gains tax ({{ formatTaxPercent(simulation.taxRate) }})</span>
              <span class="loss">-{{ currSymbol }}{{ simulation.tax.toFixed(2) }}</span>
            </div>
            <div class="sim-row sim-divider">
              <span>Net proceeds</span>
              <span class="sim-net">{{ currSymbol }}{{ simulation.netProceeds.toFixed(2) }}</span>
            </div>
            <div :class="gainLossClass(simulation.netProfit)" class="sim-row sim-profit">
              <span>Net profit / loss</span>
              <div class="sim-profit-right">
                <span class="sim-profit-pct">{{ fmt(simulation.netProfitPct) }}{{
                    simulation.netProfitPct.toFixed(2)
                  }}%</span>
                <span>{{ fmt(simulation.netProfit) }}{{ currSymbol }}{{
                    Math.abs(simulation.netProfit).toFixed(2)
                  }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Dividend summary -->
      <div v-if="dividendTxs.length" class="dividends-section">
        <div class="dividends-header">
          <h2 class="section-title">Dividends</h2>
          <span class="div-total gain">Total {{ useTickerCurrency(totalDividends, ticker) }}</span>
        </div>
        <div v-for="d in dividendTxs" :key="d._id" class="lot-row">
          <div class="lot-left">
            <div class="lot-top">
              <span class="div-badge">DIV</span>
              <span class="lot-date text-muted">{{ formatDate(d.date) }}</span>
              <span v-if="d.drip" class="drip-tag">DRIP</span>
            </div>
            <div class="lot-detail">
              {{ useTickerCurrency(d.price, ticker) }} / share
              <template v-if="d.drip && d.shares"> · +{{ d.shares }} shares</template>
            </div>
            <div v-if="d.notes" class="lot-notes text-muted">{{ d.notes }}</div>
          </div>
          <div class="lot-right">
            <span class="lot-total gain">+{{ useTickerCurrency(d.total, ticker) }}</span>
            <Button class="lot-edit-btn" icon="pi pi-pencil" rounded size="small" text @click.stop="editingTx = d"/>
          </div>
        </div>
      </div>

      <div v-if="!lots.length" class="empty">
        <i class="pi pi-list"/>
        <p class="text-muted">No transactions yet</p>
        <Button label="Add Transaction" @click="showModal = true"/>
      </div>

      <div v-else class="lots-list">
        <h2 class="section-title">Lots</h2>
        <div v-for="lot in lots" :key="lot._id" class="lot-row">
          <div class="lot-left">
            <div class="lot-top">
              <Tag :severity="lot.type === 'buy' ? 'success' : 'danger'" :value="lot.type.toUpperCase()"
                   class="lot-tag"/>
              <span class="lot-date text-muted">{{ formatDate(lot.date) }}</span>
            </div>
            <div class="lot-detail">
              {{ lot.shares }} shares @ {{ useTickerCurrency(lot.price, ticker) }}
            </div>
            <!-- Buy fee -->
            <div v-if="lot.type === 'buy' && effectiveFeeAmountOf(lot)" class="lot-extra loss">
              <i class="pi pi-percentage"/> Buy fee: {{ useCurrency(effectiveFeeAmountOf(lot), feeCurrencyOf(lot)) }}
              <span class="text-muted"> · {{ feeProfileOf(lot)?.name || 'Default profile' }}</span>
            </div>
            <!-- Sell fee -->
            <div v-if="lot.type === 'sell' && effectiveFeeAmountOf(lot)" class="lot-extra loss">
              <i class="pi pi-percentage"/> Sell fee: {{ useCurrency(effectiveFeeAmountOf(lot), feeCurrencyOf(lot)) }}
              <span class="text-muted"> · {{ feeProfileOf(lot)?.name || 'Default profile' }}</span>
            </div>
            <!-- Tax -->
            <div v-if="lot.taxAmount" class="lot-extra loss">
              <i class="pi pi-building-columns"/> Tax ({{ formatTaxPercent(lot.feeProfile?.capitalGainsTax) }}):
              {{ useTickerCurrency(lot.taxAmount, ticker) }}
            </div>
            <!-- Net proceeds -->
            <div v-if="lot.type === 'sell'" class="lot-extra gain">
              <i class="pi pi-wallet"/> Net proceeds: {{
                useTickerCurrency(netProceedsOf(lot), ticker)
              }}
            </div>
            <div v-if="lot.notes" class="lot-notes text-muted">{{ lot.notes }}</div>
          </div>
          <div class="lot-right">
            <span class="lot-total">{{ useTickerCurrency(lot.total, ticker) }}</span>
            <span class="lot-avg text-muted">Avg → {{ useTickerCurrency(lot.runningAvg, ticker) }}</span>
            <span class="lot-shares text-muted">{{ lot.runningShares.toFixed(2) }} held</span>
            <Button class="lot-edit-btn" icon="pi pi-pencil" rounded size="small" text @click.stop="editingTx = lot"/>
          </div>
        </div>
      </div>
    </template>

    <AddTransactionModal
        v-model:visible="showModal"
        :default-ticker="ticker"
        :default-price="currentPrice"
        :max-shares="summary?.shares ?? null"
        @hide="fetchLots"
    />

    <AlertModal v-model:visible="showAlertModal" :current-price="quote?.price" :ticker="ticker"/>

    <DividendModal
        v-model:visible="showDividendModal"
        :current-price="currentPrice"
        :default-ticker="ticker"
        :position-shares="summary?.shares ?? null"
        @saved="fetchLots"
    />

    <EditTransactionModal
        :transaction="editingTx"
        :visible="!!editingTx"
        @saved="fetchLots"
        @update:visible="v => { if (!v) editingTx = null }"
    />
  </div>
</template>

<style scoped>
.position-detail {
  padding: 0.5rem 1rem 2rem;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1.25rem;
}

.header-info {
  flex: 1;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.125rem;
}

.watchlist-slide-handle {
  position: fixed;
  top: 50%;
  z-index: 20;
  width: 2.75rem;
  height: 2.75rem;
  transform: translateY(-50%);
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  color: #fff;
}

.watchlist-slide-handle:enabled:hover,
.watchlist-slide-handle:enabled:focus {
  background: transparent;
  color: #fff;
}

.watchlist-slide-handle-left {
  left: 0;
}

.watchlist-slide-handle-right {
  right: 0;
}

@media (min-width: 768px) {
  .watchlist-slide-handle-left {
    left: 0.35rem;
  }

  .watchlist-slide-handle-right {
    right: 0.35rem;
  }
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
  flex-wrap: wrap;
}

.price-change {
  font-size: 1rem;
}

.price-change-label {
  margin-left: 0.35rem;
  color: var(--text-secondary);
  font-size: 0.74rem;
  font-weight: 600;
}

.price-ils {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-secondary);
  white-space: nowrap;
  padding-top: 0.35rem;
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

.hours-line {
  font-size: 0.82rem;
}

.price-skeleton {
  height: 2.5rem;
  width: 160px;
  border-radius: 6px;
  animation: shimmer 1.5s infinite;
  background: linear-gradient(90deg, var(--border) 25%, #475569 50%, var(--border) 75%);
  background-size: 200% 100%;
}

.pnl-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 1rem 1.25rem;
  margin-bottom: 0.75rem;
}

.pnl-card.gain {
  border-color: rgba(34, 197, 94, 0.3);
}

.pnl-card.loss {
  border-color: rgba(239, 68, 68, 0.3);
}

.net-card {
  background: rgba(255, 255, 255, 0.02);
}

.pnl-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
  font-size: 0.82rem;
}

.pnl-label {
  font-size: 0.82rem;
}

.after-badge {
  background: rgba(59, 130, 246, 0.15);
  color: var(--accent);
  border-radius: 4px;
  padding: 1px 6px;
  font-size: 0.7rem;
  margin-left: 4px;
}

.pnl-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.pnl-pct {
  font-size: 1.8rem;
  font-weight: 700;
}

.pnl-value {
  font-size: 1.1rem;
  font-weight: 600;
}

.fee-breakdown {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0.75rem 0 0.5rem;
  border-top: 1px solid var(--border);
  padding-top: 0.5rem;
}

.fee-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.82rem;
}

.est-row {
  border-top: 1px dashed var(--border);
  padding-top: 4px;
  margin-top: 2px;
}

.net-pct {
  font-size: 0.9rem;
  font-weight: 600;
  text-align: right;
}

.net-return-row {
  position: relative;
  padding-top: 0.5rem;
  margin-top: 0.25rem;
}

.net-return-row::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--accent), transparent);
  background-size: 200% 100%;
  animation: net-return-border-sweep 8s ease-in-out infinite;
}

.net-return-label {
  font-weight: 700;
}

@keyframes net-return-border-sweep {
  0% { background-position: 200% 0; opacity: 0.45; }
  50% { opacity: 1; }
  100% { background-position: -200% 0; opacity: 0.45; }
}

.stats-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 1.5rem;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.7rem 1rem;
  border-bottom: 1px solid var(--border);
  font-size: 0.85rem;
}

.stat-item:nth-last-child(-n+2) {
  border-bottom: none;
}

.stat-item .text-muted {
  font-size: 0.78rem;
}

.chart-controls {
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
  margin: 1rem 0 1.5rem;
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
}

.stat {
  padding: 0.75rem 1rem;
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  border-bottom: 1px solid var(--border);
  font-size: 0.88rem;
}

.stat span:last-child {
  text-align: right;
}

.stat-extended {
  background: rgba(168, 85, 247, 0.08);
}

.stat:nth-last-child(-n+2) {
  border-bottom: none;
}

.sim-wrap {
  margin-bottom: 1.5rem;
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
}

.sim-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.85rem 1rem;
  background: var(--bg-card);
  border: none;
  color: var(--text-primary);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
}

.sim-toggle i:first-child {
  color: var(--accent);
}

.sim-chevron {
  margin-left: auto;
  color: var(--text-secondary);
  font-size: 0.75rem;
}

.sim-body {
  padding: 1rem;
  background: var(--bg-card);
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.sim-inputs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.sim-field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.sim-field label {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.sim-results {
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
  padding: 0.75rem;
}

.sim-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.85rem;
}

.sim-divider {
  border-top: 1px solid var(--border);
  padding-top: 8px;
  margin-top: 2px;
  font-weight: 600;
}

.sim-net {
  font-size: 1rem;
  font-weight: 700;
}

.sim-profit {
  border-top: 1px solid var(--border);
  padding-top: 8px;
  margin-top: 2px;
  font-weight: 700;
}

.sim-profit-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
}

.sim-profit-pct {
  font-size: 1.2rem;
}

.page-loader {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 260px;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 3rem 1rem;
}

.empty i {
  font-size: 3rem;
  color: var(--text-secondary);
}

.section-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.5rem;
}

.lots-list {
  display: flex;
  flex-direction: column;
}

.lot-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 0.85rem 0;
  border-bottom: 1px solid var(--border);
  gap: 0.5rem;
}

.lot-left {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.lot-top {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 2px;
}

.lot-tag {
  font-size: 0.7rem;
}

.lot-date {
  font-size: 0.78rem;
}

.lot-detail {
  font-size: 0.88rem;
}

.lot-extra {
  font-size: 0.75rem;
  display: flex;
  align-items: center;
  gap: 4px;
}

.lot-extra i {
  font-size: 0.65rem;
}

.lot-notes {
  font-size: 0.78rem;
  font-style: italic;
  color: var(--text-secondary);
}

.lot-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.lot-total {
  font-weight: 600;
  font-size: 0.95rem;
}

.lot-avg {
  font-size: 0.75rem;
}

.lot-shares {
  font-size: 0.75rem;
}

.lot-edit-btn {
  margin-top: 2px;
  opacity: 0.6;
}

.dividends-section {
  margin-top: 1.5rem;
}

.dividends-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.div-total {
  font-size: 0.88rem;
  font-weight: 600;
}

.div-badge {
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  background: rgba(0, 195, 106, 0.15);
  color: var(--neon-green);
  border-radius: 4px;
  padding: 1px 5px;
}

.drip-tag {
  font-size: 0.65rem;
  font-weight: 700;
  background: rgba(59, 130, 246, 0.15);
  color: var(--accent);
  border-radius: 4px;
  padding: 1px 5px;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
</style>
