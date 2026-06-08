<script setup>
import {computed, onMounted, ref, watch} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {useToast} from 'primevue/usetoast'
import {gainLossClass, useCurrency, usePercent, useTickerCurrency} from '@/composables/useFormat'
import {useFeeProfileStore} from '@/stores/feeProfiles'
import {useHistoryStore} from '@/stores/history'
import api from '@/composables/useApi'
import {getMarketHoursState, MARKET_HOURS_BY_GROUP} from '@/composables/useMarketHours'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import AddTransactionModal from '@/components/ui/AddTransactionModal.vue'
import AlertModal from '@/components/ui/AlertModal.vue'
import EditTransactionModal from '@/components/ui/EditTransactionModal.vue'
import StockChart from '@/components/charts/StockChart.vue'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const historyStore = useHistoryStore()

const ticker = decodeURIComponent(route.params.ticker).toUpperCase()
const transactions = ref([])
const quote = ref(null)
const currentPrice = ref(null)
const companyName = ref('')
const loading = ref(false)
const showModal = ref(false)
const showAlertModal = ref(false)
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
const ranges = ['1d', '5d', '1mo', '3mo', '6mo', '1y']
const selectedRange = ref('3mo')
const chartMode = ref('line')
const chartModes = ['line', 'candle']

onMounted(async () => {
  await Promise.all([fetchLots(), fetchQuote(), loadHistory(), loadFx()])
  feeStore.fetchProfiles()
})

// Pre-fill sim price with current price once loaded
watch(currentPrice, (p) => { if (p && !simPrice.value) simPrice.value = p })
watch(selectedRange, loadHistory)

async function fetchLots() {
  loading.value = true
  try {
    const data = await api.get(`/portfolio/transactions?ticker=${encodeURIComponent(ticker)}&limit=500`)
    transactions.value = data.transactions.sort((a, b) => new Date(a.date) - new Date(b.date))
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Failed to load', detail: err.message, life: 3000 })
  } finally {
    loading.value = false
  }
}

async function fetchQuote() {
  try {
    const q = await api.get(`/stocks/quote/${encodeURIComponent(ticker)}`)
    quote.value = q
    currentPrice.value = q.price
    if (q.name) companyName.value = q.name
  } catch {}
}

async function loadFx() {
  try {
    const data = await api.get('/stocks/fx/ils-to-usd')
    ilsToUsd.value = data?.ilsToUsd ?? null
  } catch {}
}

async function loadHistory() {
  chartLoading.value = true
  try {
    const points = selectedRange.value === '1d' ? 160 : 50
    history.value = await historyStore.fetchHistory(ticker, selectedRange.value, points)
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Failed to load chart', detail: err.message, life: 3000 })
    history.value = []
  } finally {
    chartLoading.value = false
  }
}

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
    return { ...tx, runningShares: shares, runningAvg: avgCost }
  })
})

// Full summary including all fees and taxes paid
const summary = computed(() => {
  if (!lots.value.length) return null
  const last = lots.value[lots.value.length - 1]
  const shares = last.runningShares
  const avgCost = last.runningAvg
  const totalCost = shares * avgCost

  // Accumulate fees & taxes from all lots
  let totalBuyFees = 0
  let totalSellFees = 0
  let totalTax = 0
  let realizedGross = 0   // sell proceeds before fees/tax
  let realizedNet = 0     // sell proceeds after fees/tax

  for (const tx of transactions.value) {
    if (tx.type === 'buy') {
      totalBuyFees += tx.feeAmount || 0
    } else {
      totalSellFees += tx.feeAmount || 0
      totalTax += tx.taxAmount || 0
      realizedGross += tx.total || 0
      realizedNet += tx.netProceeds != null ? tx.netProceeds : (tx.total - (tx.feeAmount || 0) - (tx.taxAmount || 0))
    }
  }

  const totalFees = totalBuyFees + totalSellFees
  const currentValue = currentPrice.value != null ? shares * currentPrice.value : null

  // Gross P&L = current value - cost basis (ignores fees/tax)
  const grossPnl = currentValue != null ? currentValue - totalCost : null
  const grossPnlPct = avgCost > 0 && currentPrice.value != null
    ? ((currentPrice.value - avgCost) / avgCost) * 100 : null

  // Net P&L = gross P&L - all fees paid - all tax paid (true profit)
  const netPnl = grossPnl != null ? grossPnl - totalFees - totalTax : null
  const netPnlPct = totalCost > 0 && netPnl != null
    ? (netPnl / (totalCost + totalFees)) * 100 : null

  // Estimated future sell tax if sold at current price
  const unrealizedGain = currentValue != null ? currentValue - totalCost : null
  // Tax rate from last used fee profile (if any)
  const taxRate = transactions.value.find(t => t.feeProfile?.capitalGainsTax)?.feeProfile?.capitalGainsTax || 0
  const estimatedTax = unrealizedGain != null && unrealizedGain > 0 && taxRate > 0
    ? Math.round(unrealizedGain * taxRate / 100 * 100) / 100 : 0

  return {
    shares, avgCost, totalCost, currentValue,
    grossPnl, grossPnlPct,
    netPnl, netPnlPct,
    totalBuyFees, totalSellFees, totalFees,
    totalTax, taxRate, estimatedTax,
    realizedGross, realizedNet,
  }
})

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmt(val) {
  return val >= 0 ? '+' : ''
}

const tickerCurr = computed(() => ticker.endsWith('.TA') ? 'ILS' : 'USD')
const currSymbol = computed(() => tickerCurr.value === 'ILS' ? '₪' : '$')
const matchingFeeProfiles = computed(() =>
  feeStore.profiles.filter((p) => (p.currency || 'USD') === tickerCurr.value)
)
const marketGroup = computed(() => {
  if (ticker.endsWith('.TA')) return 'Israel'
  if (/-USD$/.test(ticker)) return 'Crypto'
  return 'US'
})
const marketMeta = computed(() => {
  const market = MARKET_HOURS_BY_GROUP[marketGroup.value]
  return market ? getMarketHoursState(market, now.value) : null
})
const shekelValue = computed(() => {
  if (quote.value?.price == null) return null
  if (marketGroup.value === 'Israel') return null
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
    shekelPrice: Number.isFinite(ilsToUsd.value) && ilsToUsd.value > 0 && marketGroup.value !== 'Israel'
      ? source.price / ilsToUsd.value
      : null,
    timeLabel: formatExtendedHoursTime(source.time, marketMeta.value?.timezone),
  }
})

const simulation = computed(() => {
  if (!simPrice.value || !summary.value) return null
  const { shares, avgCost, totalCost, totalBuyFees } = summary.value
  const sellPrice = simPrice.value
  const grossProceeds = sellPrice * shares

  // Get sell fee from selected profile
  const profile = feeStore.profiles.find(p => p._id === simFeeProfileId.value)
  let sellFee = 0
  if (profile?.sellFee?.value) {
    sellFee = profile.sellFee.type === 'percent'
      ? (grossProceeds * profile.sellFee.value) / 100
      : profile.sellFee.value
    if (profile.sellFee.minFee && sellFee < profile.sellFee.minFee)
      sellFee = profile.sellFee.minFee
    sellFee = Math.round(sellFee * 100) / 100
  }

  // Capital gains tax on profit only
  const taxRate = profile?.capitalGainsTax || 0
  const gain = grossProceeds - totalCost
  const tax = gain > 0 && taxRate > 0
    ? Math.round(gain * taxRate / 100 * 100) / 100
    : 0

  const netProceeds = grossProceeds - sellFee - tax
  // Net profit = net proceeds - original cost - buy fees already paid
  const netProfit = netProceeds - totalCost - totalBuyFees
  const netProfitPct = (totalCost + totalBuyFees) > 0
    ? (netProfit / (totalCost + totalBuyFees)) * 100 : 0

  return {
    sellPrice, shares, grossProceeds,
    sellFee, tax, taxRate,
    netProceeds, netProfit, netProfitPct,
    profileName: profile?.name || null,
  }
})

watch([tickerCurr, () => feeStore.profiles], ([txCurrency, profiles]) => {
  if (!simFeeProfileId.value || !profiles.some((p) => p._id === simFeeProfileId.value && (p.currency || 'USD') === txCurrency)) {
    simFeeProfileId.value = profiles.find((p) => p.isDefault && (p.currency || 'USD') === txCurrency)?._id || null
  }
}, { immediate: true })

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
</script>

<template>
  <div class="position-detail">
    <header class="page-header">
      <Button icon="pi pi-arrow-left" text rounded @click="router.back()" />
      <div class="header-info">
        <h1 class="gradient-title">{{ companyName || ticker }}</h1>
        <span class="text-muted">{{ ticker }} · Transaction Lots</span>
      </div>
      <div class="header-actions">
        <Button icon="pi pi-plus" rounded text @click="showModal = true" />
        <Button
          v-tooltip.bottom="'Set price alert'"
          icon="pi pi-bell"
          text
          rounded
          @click="showAlertModal = true"
        />
      </div>
    </header>

    <template v-if="summary">
      <div v-if="quote" class="quote-summary">
        <div class="price-row">
          <div class="price-main">
            <div class="current-price">
              {{ useTickerCurrency(quote.price, ticker) }}
              <span v-if="shekelValue != null">
                 {{ useCurrency(shekelValue, 'ILS') }}
              </span>
            </div>
            <p :class="gainLossClass(quote.change)" class="price-change">
              {{ useTickerCurrency(quote.change, ticker) }} ({{ usePercent(quote.changePercent) }})
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

      <!-- Gross P&L card -->
      <div class="pnl-card" :class="gainLossClass(summary.grossPnl)">
        <div class="pnl-header">
          <!--          <span class="pnl-label text-muted">Gross P&L</span>-->
          <span class="pnl-label text-muted">Avg {{ useTickerCurrency(summary.avgCost, ticker) }} → {{ currentPrice != null ? useTickerCurrency(currentPrice, ticker) : '…' }}</span>
        </div>
        <div class="pnl-row">
          <span class="pnl-pct" :class="gainLossClass(summary.grossPnlPct)">
            {{ summary.grossPnlPct != null ? fmt(summary.grossPnlPct) + summary.grossPnlPct.toFixed(2) + '%' : '—' }}
          </span>
          <span class="pnl-value" :class="gainLossClass(summary.grossPnl)">
            {{ summary.grossPnl != null ? fmt(summary.grossPnl) + useTickerCurrency(summary.grossPnl, ticker) : '—' }}
          </span>
        </div>
      </div>

      <!-- Net P&L card (after all fees + tax) -->
      <div v-if="summary.totalFees > 0 || summary.totalTax > 0" class="pnl-card net-card" :class="gainLossClass(summary.netPnl)">
        <div class="pnl-header">
          <span class="pnl-label text-muted">Net P&L <span class="after-badge">after fees & tax</span></span>
          <span class="pnl-label" :class="gainLossClass(summary.netPnl)">
            {{ summary.netPnl != null ? fmt(summary.netPnl) + useTickerCurrency(summary.netPnl, ticker) : '—' }}
          </span>
        </div>
        <div class="fee-breakdown">
          <div v-if="summary.totalBuyFees > 0" class="fee-row">
            <span class="text-muted">Buy fees paid</span>
            <span class="loss">-{{ useTickerCurrency(summary.totalBuyFees, ticker) }}</span>
          </div>
          <div v-if="summary.totalSellFees > 0" class="fee-row">
            <span class="text-muted">Sell fees paid</span>
            <span class="loss">-{{ useTickerCurrency(summary.totalSellFees, ticker) }}</span>
          </div>
          <div v-if="summary.totalTax > 0" class="fee-row">
            <span class="text-muted">Capital gains tax paid</span>
            <span class="loss">-{{ useTickerCurrency(summary.totalTax, ticker) }}</span>
          </div>
          <div v-if="summary.estimatedTax > 0" class="fee-row est-row">
            <span class="text-muted">Est. tax if sold now ({{ summary.taxRate }}%)</span>
            <span class="loss">-{{ useTickerCurrency(summary.estimatedTax, ticker) }}</span>
          </div>
        </div>
        <div v-if="summary.netPnlPct != null" class="net-pct" :class="gainLossClass(summary.netPnlPct)">
          {{ fmt(summary.netPnlPct) }}{{ summary.netPnlPct.toFixed(2) }}% net return
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
      <SelectButton v-model="selectedRange" :options="ranges" size="small" />
      <SelectButton v-model="chartMode" :options="chartModes" size="small" />
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
          {{ useTickerCurrency(selectedDelta.startPrice, ticker) }} to {{ useTickerCurrency(selectedDelta.endPrice, ticker) }}
        </span>
        <span class="text-muted">
          {{ selectedDelta.startLabel }} to {{ selectedDelta.endLabel }} · {{ selectedDelta.spanLabel }}
        </span>
      </div>
    </div>

    <StockChart
      :key="`${ticker}-${selectedRange}-${chartMode}`"
      :data="history"
      :loading="chartLoading"
      :mode="chartMode"
      :range="selectedRange"
      :ticker="ticker"
      :current-price="currentPrice"
      @selection-change="handleChartSelection"
    />

    <!-- Sell Simulator -->
    <div class="sim-wrap">
      <button class="sim-toggle" @click="showSimulator = !showSimulator">
        <i class="pi pi-calculator" />
        Sell Simulator
        <i :class="showSimulator ? 'pi pi-chevron-up' : 'pi pi-chevron-down'" class="sim-chevron" />
      </button>

      <div v-if="showSimulator" class="sim-body">
        <div class="sim-inputs">
          <div class="sim-field">
            <label>Sell price per share</label>
            <InputNumber
              v-model="simPrice"
              mode="currency"
              :currency="tickerCurr"
              :min="0.001"
              :max-fraction-digits="4"
              fluid
            />
          </div>
          <div class="sim-field">
            <label>Fee profile</label>
            <Select
              v-model="simFeeProfileId"
              :options="[{ label: 'No fee profile', value: null }, ...matchingFeeProfiles.map(p => ({ label: p.name, value: p._id }))]"
              option-label="label"
              option-value="value"
              fluid
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
            <span class="loss">-{{ currSymbol }}{{ simulation.sellFee.toFixed(2) }}</span>
          </div>
          <div v-if="simulation.tax > 0" class="sim-row">
            <span class="text-muted">Capital gains tax ({{ simulation.taxRate }}%)</span>
            <span class="loss">-{{ currSymbol }}{{ simulation.tax.toFixed(2) }}</span>
          </div>
          <div class="sim-row sim-divider">
            <span>Net proceeds</span>
            <span class="sim-net">{{ currSymbol }}{{ simulation.netProceeds.toFixed(2) }}</span>
          </div>
          <div class="sim-row sim-profit" :class="gainLossClass(simulation.netProfit)">
            <span>Net profit / loss</span>
            <div class="sim-profit-right">
              <span class="sim-profit-pct">{{ fmt(simulation.netProfitPct) }}{{ simulation.netProfitPct.toFixed(2) }}%</span>
              <span>{{ fmt(simulation.netProfit) }}{{ currSymbol }}{{ Math.abs(simulation.netProfit).toFixed(2) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="loading" class="text-muted loading">Loading...</div>

    <div v-else-if="!lots.length" class="empty">
      <i class="pi pi-list" />
      <p class="text-muted">No transactions yet</p>
      <Button label="Add Transaction" @click="showModal = true" />
    </div>

    <div v-else class="lots-list">
      <h2 class="section-title">Lots</h2>
      <div v-for="lot in lots" :key="lot._id" class="lot-row">
        <div class="lot-left">
          <div class="lot-top">
            <Tag :value="lot.type.toUpperCase()" :severity="lot.type === 'buy' ? 'success' : 'danger'" class="lot-tag" />
            <span class="lot-date text-muted">{{ formatDate(lot.date) }}</span>
          </div>
          <div class="lot-detail">
            {{ lot.shares }} shares @ {{ useTickerCurrency(lot.price, ticker) }}
          </div>
          <!-- Buy fee -->
          <div v-if="lot.type === 'buy' && lot.feeAmount" class="lot-extra loss">
            <i class="pi pi-percentage" /> Buy fee: {{ useTickerCurrency(lot.feeAmount, ticker) }}
            <span v-if="lot.feeProfile?.name" class="text-muted"> · {{ lot.feeProfile.name }}</span>
          </div>
          <!-- Sell fee -->
          <div v-if="lot.type === 'sell' && lot.feeAmount" class="lot-extra loss">
            <i class="pi pi-percentage" /> Sell fee: {{ useTickerCurrency(lot.feeAmount, ticker) }}
            <span v-if="lot.feeProfile?.name" class="text-muted"> · {{ lot.feeProfile.name }}</span>
          </div>
          <!-- Tax -->
          <div v-if="lot.taxAmount" class="lot-extra loss">
            <i class="pi pi-building-columns" /> Tax ({{ lot.feeProfile?.capitalGainsTax }}%): {{ useTickerCurrency(lot.taxAmount, ticker) }}
          </div>
          <!-- Net proceeds -->
          <div v-if="lot.type === 'sell'" class="lot-extra gain">
            <i class="pi pi-wallet" /> Net proceeds: {{ useTickerCurrency(lot.netProceeds ?? (lot.total - (lot.feeAmount||0) - (lot.taxAmount||0)), ticker) }}
          </div>
          <div v-if="lot.notes" class="lot-notes text-muted">{{ lot.notes }}</div>
        </div>
        <div class="lot-right">
          <span class="lot-total">{{ useTickerCurrency(lot.total, ticker) }}</span>
          <span class="lot-avg text-muted">Avg → {{ useTickerCurrency(lot.runningAvg, ticker) }}</span>
          <span class="lot-shares text-muted">{{ lot.runningShares.toFixed(2) }} held</span>
          <Button icon="pi pi-pencil" text rounded size="small" class="lot-edit-btn" @click.stop="editingTx = lot" />
        </div>
      </div>
    </div>

    <AddTransactionModal
      v-model:visible="showModal"
      :default-ticker="ticker"
      @hide="fetchLots"
    />

    <AlertModal v-model:visible="showAlertModal" :current-price="quote?.price" :ticker="ticker" />

    <EditTransactionModal
      :visible="!!editingTx"
      :transaction="editingTx"
      @update:visible="v => { if (!v) editingTx = null }"
      @saved="fetchLots"
    />
  </div>
</template>

<style scoped>
.position-detail { padding: 0.5rem 1rem 2rem; }
.page-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1.25rem; }
.header-info { flex: 1; }
.header-actions { display: flex; align-items: center; gap: 0.125rem; }

.header-info h1 {
  font-size: 1.3rem;
  line-height: 1;
}
.header-info span { font-size: 0.82rem; }

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

.pnl-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 1rem 1.25rem;
  margin-bottom: 0.75rem;
}
.pnl-card.gain { border-color: rgba(34,197,94,0.3); }
.pnl-card.loss { border-color: rgba(239,68,68,0.3); }
.net-card { background: rgba(255,255,255,0.02); }

.pnl-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; font-size: 0.82rem; }
.pnl-label { font-size: 0.82rem; }
.after-badge { background: rgba(59,130,246,0.15); color: var(--accent); border-radius: 4px; padding: 1px 6px; font-size: 0.7rem; margin-left: 4px; }

.pnl-row { display: flex; justify-content: space-between; align-items: center; }
.pnl-pct { font-size: 1.8rem; font-weight: 700; }
.pnl-value { font-size: 1.1rem; font-weight: 600; }

.fee-breakdown { display: flex; flex-direction: column; gap: 4px; margin: 0.75rem 0 0.5rem; border-top: 1px solid var(--border); padding-top: 0.5rem; }
.fee-row { display: flex; justify-content: space-between; font-size: 0.82rem; }
.est-row { border-top: 1px dashed var(--border); padding-top: 4px; margin-top: 2px; }
.net-pct { font-size: 0.9rem; font-weight: 600; text-align: right; margin-top: 0.5rem; }

.stats-row {
  display: grid; grid-template-columns: 1fr 1fr;
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 12px; overflow: hidden; margin-bottom: 1.5rem;
}
.stat-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 0.7rem 1rem; border-bottom: 1px solid var(--border); font-size: 0.85rem;
}
.stat-item:nth-last-child(-n+2) { border-bottom: none; }
.stat-item .text-muted { font-size: 0.78rem; }

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

.sim-wrap { margin-bottom: 1.5rem; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
.sim-toggle { width: 100%; display: flex; align-items: center; gap: 0.5rem; padding: 0.85rem 1rem; background: var(--bg-card); border: none; color: var(--text-primary); font-size: 0.9rem; font-weight: 600; cursor: pointer; }
.sim-toggle i:first-child { color: var(--accent); }
.sim-chevron { margin-left: auto; color: var(--text-secondary); font-size: 0.75rem; }
.sim-body { padding: 1rem; background: var(--bg-card); border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 1rem; }
.sim-inputs { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
.sim-field { display: flex; flex-direction: column; gap: 0.4rem; }
.sim-field label { font-size: 0.8rem; color: var(--text-secondary); }
.sim-results { display: flex; flex-direction: column; gap: 6px; background: rgba(255,255,255,0.03); border-radius: 8px; padding: 0.75rem; }
.sim-row { display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; }
.sim-divider { border-top: 1px solid var(--border); padding-top: 8px; margin-top: 2px; font-weight: 600; }
.sim-net { font-size: 1rem; font-weight: 700; }
.sim-profit { border-top: 1px solid var(--border); padding-top: 8px; margin-top: 2px; font-weight: 700; }
.sim-profit-right { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; }
.sim-profit-pct { font-size: 1.2rem; }

.loading { padding: 1rem 0; }
.empty { display: flex; flex-direction: column; align-items: center; gap: 1rem; padding: 3rem 1rem; }
.empty i { font-size: 3rem; color: var(--text-secondary); }

.section-title { font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; }
.lots-list { display: flex; flex-direction: column; }
.lot-row { display: flex; justify-content: space-between; align-items: flex-start; padding: 0.85rem 0; border-bottom: 1px solid var(--border); gap: 0.5rem; }
.lot-left { flex: 1; display: flex; flex-direction: column; gap: 3px; }
.lot-top { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 2px; }
.lot-tag { font-size: 0.7rem; }
.lot-date { font-size: 0.78rem; }
.lot-detail { font-size: 0.88rem; }
.lot-extra { font-size: 0.75rem; display: flex; align-items: center; gap: 4px; }
.lot-extra i { font-size: 0.65rem; }
.lot-notes { font-size: 0.78rem; font-style: italic; color: var(--text-secondary); }
.lot-right { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.lot-total { font-weight: 600; font-size: 0.95rem; }
.lot-avg { font-size: 0.75rem; }
.lot-shares { font-size: 0.75rem; }
.lot-edit-btn { margin-top: 2px; opacity: 0.6; }
</style>
