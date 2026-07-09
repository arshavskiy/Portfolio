<script setup>
import {computed, onUnmounted, ref, watch} from 'vue'
import {useRouter} from 'vue-router'
import {useHistoryStore} from '@/stores/history'
import {usePortfolioStore} from '@/stores/portfolio'
import {fetchCachedQuote} from '@/composables/useQuoteCache'
import {buildBreakdown, signalFromScore} from '@/composables/useMomentumScore'
import {useMomentumStore} from '@/stores/momentum'
import {gainLossClass, usePercent, useTickerCurrency, useCurrency} from '@/composables/useFormat'
import {getMarketHoursState, MARKET_HOURS_BY_GROUP} from '@/composables/useMarketHours'
import StockChart from '@/components/charts/StockChart.vue'
import AppLoader from '@/components/ui/AppLoader.vue'
import Button from 'primevue/button'
import {useI18n} from '@/composables/useI18n'
import Tag from 'primevue/tag'

const props = defineProps({
  ticker: {type: String, default: null},
  companyName: {type: String, default: ''},
})
const {t} = useI18n()

const router = useRouter()
const historyStore = useHistoryStore()
const portfolio = usePortfolioStore()
const momentumStore = useMomentumStore()

const history = ref([])
const chartLoading = ref(false)
const quote = ref(null)
const loading = ref(false)
const selectedRange = ref('1d')

const RANGES = ['1d', '5d', '1mo', '3mo', '1y']
const RANGE_LABELS = {'1d': '1D', '5d': '5D', '1mo': '1M', '3mo': '3M', '1y': '1Y'}

let loadId = 0
let mounted = true
onUnmounted(() => { mounted = false })

// ── Data loading ──
async function load(ticker, range) {
  if (!ticker) return
  const id = ++loadId
  loading.value = true
  chartLoading.value = true
  try {
    const pointsMap = {'1d': 160, '5d': 100, '1mo': 60}
    const points = pointsMap[range] ?? 50
    const [hist, q] = await Promise.all([
      historyStore.fetchHistory(ticker, range, points),
      fetchCachedQuote(ticker),
    ])
    if (!mounted || id !== loadId) return
    history.value = hist ?? []
    quote.value = q
  } catch {
    if (!mounted || id !== loadId) return
    history.value = []
  } finally {
    if (mounted && id === loadId) {
      loading.value = false
      chartLoading.value = false
    }
  }
}

watch(() => props.ticker, (t) => {
  quote.value = null
  history.value = []
  selectedRange.value = '1d'
  if (t) load(t, '1d')
}, {immediate: true})

watch(selectedRange, (r) => {
  if (props.ticker) load(props.ticker, r)
})

// ── Quote derived ──
const currentPrice = computed(() => quote.value?.price ?? null)
const change = computed(() => quote.value?.change ?? null)
const changePct = computed(() => quote.value?.changePercent ?? null)
const previousClose = computed(() => quote.value?.previousClose ?? null)
const volume = computed(() => quote.value?.regularMarketVolume ?? null)
const high = computed(() => quote.value?.regularMarketDayHigh ?? null)
const low = computed(() => quote.value?.regularMarketDayLow ?? null)
const open = computed(() => quote.value?.regularMarketOpen ?? null)

// range change (for non-1d ranges)
const rangeChange = computed(() => {
  const rows = history.value.filter((r) => Number.isFinite(r?.close))
  if (rows.length < 2) return null
  const first = rows[0].close
  const last = rows[rows.length - 1].close
  if (!first) return null
  return {amount: last - first, percent: ((last - first) / first) * 100}
})
const displayedChange = computed(() =>
  selectedRange.value === '1d'
    ? {amount: change.value, percent: changePct.value}
    : (rangeChange.value || {amount: change.value, percent: changePct.value})
)
const changeLabel = computed(() =>
  selectedRange.value !== '1d' && rangeChange.value
      ? t('dashboard.rangeLabel', {range: RANGE_LABELS[selectedRange.value]})
      : t('dashboard.today')
)

// ── Market state ──
const marketGroup = computed(() => {
  if (!props.ticker) return 'US'
  if (props.ticker.endsWith('.TA')) return 'Israel'
  if (/-USD$/.test(props.ticker)) return 'Crypto'
  return 'US'
})
const marketMeta = computed(() => {
  const market = MARKET_HOURS_BY_GROUP[marketGroup.value]
  return market ? getMarketHoursState(market, new Date()) : null
})
const marketDotClass = computed(() => {
  const state = quote.value?.marketState
  if (state === 'REGULAR') return 'dot-open'
  if (state === 'PRE' || state === 'POST') return 'dot-ext'
  return 'dot-closed'
})

// ── Position (if held) ──
const position = computed(() =>
  portfolio.positions.find((p) => p.ticker === props.ticker) ?? null
)

// ── Momentum signals ──
const breakdown = computed(() => {
  if (!props.ticker || !quote.value) return []
  const score = momentumStore.getScore(props.ticker)
  if (score == null) return []
  return buildBreakdown({
    dayPct: changePct.value,
    extPct: quote.value.postMarketChangePercent ?? quote.value.preMarketChangePercent ?? null,
    hist: history.value,
    price: currentPrice.value,
    volume: quote.value.regularMarketVolume ?? null,
    avgVolume: quote.value.averageVolume ?? null,
    wave: 0,
  })
})
const signal = computed(() => {
  if (!props.ticker) return null
  const score = momentumStore.getScore(props.ticker)
  return score != null ? signalFromScore(score) : null
})

function formatVol(v) {
  if (v == null) return '—'
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`
  return String(v)
}
</script>

<template>
  <div class="position-panel">
    <!-- Empty state -->
    <div v-if="!ticker" class="empty-state">
      <i class="pi pi-chart-line empty-icon"/>
      <p>{{ t('stockDetail.clickForDetails') }}</p>
    </div>

    <template v-else>
      <!-- Header -->
      <div class="panel-header">
        <div class="header-left">
          <div class="ticker-row">
            <span class="ticker-name">{{ ticker }}</span>
            <span :class="marketDotClass" class="market-dot" :title="quote?.marketState"/>
          </div>
          <span class="company-name">{{ companyName || quote?.name }}</span>
        </div>
        <Button
            v-tooltip.left="t('stockDetail.openFullPage')"
            icon="pi pi-arrow-up-right"
            size="small"
            text
            class="open-btn"
            @click="router.push(`/position/${encodeURIComponent(ticker)}`)"
        />
      </div>

      <!-- Price block -->
      <div v-if="currentPrice != null" class="price-block">
        <div class="price-main">
          <span class="price-value">{{ useTickerCurrency(currentPrice, ticker) }}</span>
          <span v-if="displayedChange.percent != null" :class="gainLossClass(displayedChange.percent)" class="price-change">
            {{ displayedChange.percent >= 0 ? '+' : '' }}{{ usePercent(displayedChange.percent) }}
            <span class="change-label">{{ changeLabel }}</span>
          </span>
        </div>
        <div class="price-meta">
          <span v-if="open != null">{{ t('dashboard.openShort') }} {{ useTickerCurrency(open, ticker) }}</span>
          <span v-if="high != null">{{ t('dashboard.highShort') }} {{ useTickerCurrency(high, ticker) }}</span>
          <span v-if="low != null">{{ t('dashboard.lowShort') }} {{ useTickerCurrency(low, ticker) }}</span>
          <span v-if="volume != null">{{ t('dashboard.volumeShort') }} {{ formatVol(volume) }}</span>
        </div>
      </div>

      <!-- Range tabs -->
      <div class="range-tabs">
        <button
            v-for="r in RANGES"
            :key="r"
            :class="{active: selectedRange === r}"
            class="range-btn"
            @click="selectedRange = r"
        >{{ RANGE_LABELS[r] }}</button>
      </div>

      <!-- Chart -->
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

      <!-- Position summary if held -->
      <div v-if="position" class="position-summary">
        <div class="summary-label">{{ t('dashboard.yourPosition') }}</div>
        <div class="summary-grid">
          <div class="summary-item">
            <span class="si-label">{{ t('common.shares') }}</span>
            <span class="si-value">{{ position.shares }}</span>
          </div>
          <div class="summary-item">
            <span class="si-label">{{ t('stockDetail.avgCost') }}</span>
            <span class="si-value">{{ useTickerCurrency(position.avgCost, ticker) }}</span>
          </div>
          <div class="summary-item">
            <span class="si-label">{{ t('stockDetail.value') }}</span>
            <span class="si-value">{{ useTickerCurrency(position.value, ticker) }}</span>
          </div>
          <div class="summary-item">
            <span class="si-label">P&L</span>
            <span :class="gainLossClass(position.pnl)" class="si-value">
              {{ position.pnl >= 0 ? '+' : '' }}{{ useTickerCurrency(position.pnl, ticker) }}
              ({{ usePercent(position.pnlPercent) }})
            </span>
          </div>
        </div>
      </div>

      <!-- Signal breakdown -->
      <div v-if="breakdown.length" class="signals">
        <div class="summary-label">
          Signals
          <Tag v-if="signal" :severity="signal.severity" :value="signal.label" class="signal-tag"/>
        </div>
        <div class="signal-chips">
          <div
              v-for="chip in breakdown"
              :key="chip.key"
              :class="`chip-${chip.direction}`"
              class="signal-chip"
              :title="chip.detail"
          >
            {{ chip.label }}
          </div>
        </div>
      </div>

      <!-- Link to full page -->
      <div class="full-page-link">
        <Button
            :label="t('stockDetail.openFullPositionPage')"
            icon="pi pi-arrow-up-right"
            text
            size="small"
            class="full-btn"
            @click="router.push(`/position/${encodeURIComponent(ticker)}`)"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.position-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
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
.empty-icon { font-size: 2.5rem; opacity: 0.25; }

/* Header */
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 1rem 1rem 0.5rem;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.header-left { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ticker-row { display: flex; align-items: center; gap: 0.5rem; }
.ticker-name { font-size: 1.1rem; font-weight: 800; color: var(--text-primary); }
.company-name {
  font-size: 0.72rem;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}
.open-btn { flex-shrink: 0; }

/* Market dot */
.market-dot {
  width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
}
.dot-open   { background: var(--neon-green, #00ff88); box-shadow: 0 0 4px var(--neon-green, #00ff88); }
.dot-ext    { background: #facc15; box-shadow: 0 0 4px #facc15; }
.dot-closed { background: var(--text-secondary); }

/* Price block */
.price-block {
  padding: 0.75rem 1rem 0.5rem;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.price-main { display: flex; align-items: baseline; gap: 0.6rem; flex-wrap: wrap; }
.price-value { font-size: 1.4rem; font-weight: 700; }
.price-change { font-size: 0.82rem; font-weight: 600; }
.change-label { font-size: 0.68rem; font-weight: 400; color: var(--text-secondary); margin-left: 3px; }
.price-meta {
  display: flex; gap: 0.75rem; margin-top: 0.3rem;
  font-size: 0.68rem; color: var(--text-secondary);
}

/* Range tabs */
.range-tabs {
  display: flex;
  gap: 4px;
  padding: 0.5rem 1rem;
  flex-shrink: 0;
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

/* Chart */
.chart-wrap {
  height: 220px;
  flex-shrink: 0;
  padding: 0 0.25rem;
}

/* Position summary */
.position-summary {
  margin: 0.75rem 1rem 0;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 0.75rem;
  flex-shrink: 0;
}
.summary-label {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--text-secondary);
  margin-bottom: 0.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.summary-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.4rem 0.75rem;
}
.summary-item { display: flex; flex-direction: column; gap: 1px; }
.si-label { font-size: 0.65rem; color: var(--text-secondary); }
.si-value { font-size: 0.8rem; font-weight: 600; }

/* Signals */
.signals {
  margin: 0.75rem 1rem 0;
  flex-shrink: 0;
}
.signal-tag { font-size: 0.65rem; padding: 1px 6px; }
.signal-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 0.4rem;
}
.signal-chip {
  font-size: 0.68rem;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 6px;
  cursor: default;
}
.chip-up   { background: rgba(0,255,136,0.12); color: var(--neon-green, #00ff88); border: 1px solid rgba(0,255,136,0.25); }
.chip-down { background: rgba(255,51,102,0.12); color: #ff3366; border: 1px solid rgba(255,51,102,0.25); }
.chip-neutral { background: var(--bg-card); color: var(--text-secondary); border: 1px solid var(--border); }

/* Full page link */
.full-page-link {
  padding: 0.75rem 1rem;
  margin-top: auto;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}
.full-btn { width: 100%; justify-content: center; }
</style>
