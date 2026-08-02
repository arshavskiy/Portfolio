<script setup>
import { computed, useAttrs } from 'vue'
import { usePercent, useTickerCurrency } from '@/composables/useFormat'
import { insiderValuePctOf } from '@/composables/useGrouping'
import { useChartRange } from '@/composables/useChartRange'
import { useAlertsStore } from '@/stores/alerts'
import { useI18n } from '@/composables/useI18n'
import SparklineChart from '@/components/charts/SparklineChart.vue'

const props = defineProps({
  item: { type: Object, required: true },
  highlightHeld: { type: Boolean, default: false },
  groupMode: { type: String, default: 'market' },
  position: { type: Object, default: null },
})
const emit = defineEmits(['edit-groups', 'open-stock'])
const alerts = useAlertsStore()
const { t } = useI18n()
const chartRange = useChartRange()
const attrs = useAttrs()
const exposeTourAnchors = computed(() => attrs['data-tour'] === 'wl-row')

const activeAlerts = computed(
  () => alerts.forTicker(props.item.ticker).filter((a) => a.active).length,
)

const rangeStartPrice = computed(() => props.item.history?.[0]?.close ?? null)
const rangeEndPrice = computed(
  () => props.item.history?.[props.item.history.length - 1]?.close ?? null,
)
const rangeChangePercent = computed(() => {
  if (chartRange.value === '1d') return props.item.changePercent ?? null
  const start = rangeStartPrice.value
  const end = rangeEndPrice.value
  if (start != null && end != null && start !== 0) return ((end - start) / start) * 100
  return props.item.changePercent ?? null
})

function calculateExtendedChangePercent(price, change) {
  if (price == null || change == null) return null
  const previous = price - change
  if (!Number.isFinite(previous) || previous === 0) return null
  return (change / previous) * 100
}

function isRecentSnapshot(timeValue) {
  if (!timeValue) return false
  return Date.now() - new Date(timeValue).getTime() < 20 * 60 * 60 * 1000
}

function resolveExtendedHours(kind) {
  const isPost = kind === 'post'
  const priceKey = isPost ? 'postMarketPrice' : 'preMarketPrice'
  const changeKey = isPost ? 'postMarketChange' : 'preMarketChange'
  const percentKey = isPost ? 'postMarketChangePercent' : 'preMarketChangePercent'
  const lastPriceKey = isPost ? 'lastPostMarketPrice' : 'lastPreMarketPrice'
  const lastChangeKey = isPost ? 'lastPostMarketChange' : 'lastPreMarketChange'
  const lastPercentKey = isPost ? 'lastPostMarketChangePercent' : 'lastPreMarketChangePercent'
  const lastTimeKey = isPost ? 'lastPostMarketTime' : 'lastPreMarketTime'

  if (props.item[priceKey] != null || props.item[changeKey] != null || props.item[percentKey] != null) {
    return {
      label: isPost ? t('watchlist.afterHours') : t('watchlist.preMarket'),
      price: props.item[priceKey] ?? null,
      percent: props.item[percentKey] ?? calculateExtendedChangePercent(props.item[priceKey], props.item[changeKey]),
    }
  }

  if (
    isRecentSnapshot(props.item[lastTimeKey]) &&
    (props.item[lastPriceKey] != null || props.item[lastChangeKey] != null || props.item[lastPercentKey] != null)
  ) {
    return {
      label: isPost ? t('watchlist.afterHoursLastSeen') : t('watchlist.preMarketLastSeen'),
      price: props.item[lastPriceKey] ?? null,
      percent: props.item[lastPercentKey] ?? calculateExtendedChangePercent(props.item[lastPriceKey], props.item[lastChangeKey]),
    }
  }
  return null
}

const isStaleQuote = computed(() => {
  if (props.item.marketState !== 'CLOSED') return false
  const ts = props.item.regularMarketTime
  if (!ts) return false
  return Date.now() - new Date(ts).getTime() > 28 * 60 * 60 * 1000
})

const activeExtended = computed(() => {
  const ticker = props.item.ticker
  const state = props.item.marketState
  if (/-USD$/u.test(ticker)) return resolveExtendedHours('post')
  if (state === 'REGULAR') return resolveExtendedHours('pre')
  const ny = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const minutes = ny.getHours() * 60 + ny.getMinutes()
  const isPreTime = minutes < 9 * 60 + 30
  return (
    resolveExtendedHours(isPreTime ? 'pre' : 'post') ??
    resolveExtendedHours(isPreTime ? 'post' : 'pre') ??
    null
  )
})

const hasVisibleExtended = computed(
  () => !isStaleQuote.value && activeExtended.value?.percent != null,
)

const earningsInDays = computed(() => {
  const ts = props.item.earningsTimestamp
  if (!ts) return null
  const when = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts)
  if (Number.isNaN(when.getTime())) return null
  const days = Math.ceil((when.getTime() - Date.now()) / 86400000)
  return days >= 0 && days <= 7 ? days : null
})

const earningsTitle = computed(() => {
  if (earningsInDays.value == null) return ''
  const ts = props.item.earningsTimestamp
  const when = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts)
  return t('watchlist.earningsOn', { date: when.toLocaleDateString() })
})

function positiveNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}

function formatDividendYield(value) {
  if (value == null) return null
  const pct = value * 100
  return `${pct.toFixed(pct >= 10 ? 1 : 2).replace(/\.?0+$/u, '')}%`
}

const dividendYield = computed(() => positiveNumber(props.item.dividendYield))
const dividendRate = computed(() => positiveNumber(props.item.dividendRate))
const hasDividendSupport = computed(() => dividendYield.value != null || dividendRate.value != null)
const dividendBadgeText = computed(
  () => formatDividendYield(dividendYield.value) || t('watchlist.dividendBadge'),
)
const dividendTitle = computed(() => {
  const yieldText = formatDividendYield(dividendYield.value)
  const rateText = dividendRate.value != null ? useTickerCurrency(dividendRate.value, props.item.ticker) : null
  if (yieldText && rateText) return t('watchlist.dividendTooltipFull', { yield: yieldText, rate: rateText })
  if (yieldText) return t('watchlist.dividendTooltipYield', { yield: yieldText })
  if (rateText) return t('watchlist.dividendTooltipRate', { rate: rateText })
  return ''
})

function formatShareCount(n) {
  const abs = Math.abs(n)
  if (abs >= 1e6) return `${(abs / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `${(abs / 1e3).toFixed(1)}K`
  return `${abs}`
}

const insiderNet = computed(() => {
  const n = Number(props.item.insiderNet3m)
  return Number.isFinite(n) && n !== 0 ? n : null
})
const insiderValuePct = computed(() =>
  insiderNet.value == null ? null : insiderValuePctOf(props.item),
)
const insiderBadgeText = computed(() => {
  if (insiderNet.value == null) return null
  if (insiderValuePct.value != null) {
    const abs = Math.abs(insiderValuePct.value)
    return `${abs >= 10 ? abs.toFixed(0) : abs.toFixed(2)}%`
  }
  return formatShareCount(insiderNet.value)
})
const insiderTitle = computed(() => {
  if (insiderNet.value == null) return ''
  const direction = insiderNet.value > 0 ? t('watchlist.insiderBuying') : t('watchlist.insiderSelling')
  const shares = formatShareCount(insiderNet.value)
  if (insiderValuePct.value != null) {
    return t('watchlist.insiderTooltipPct', { direction, shares, pct: `${insiderValuePct.value.toFixed(2)}%` })
  }
  return t('watchlist.insiderTooltip', { direction, shares })
})

const netMargin = computed(() => {
  const n = Number(props.item.netMarginPct)
  return Number.isFinite(n) ? n : null
})
const netMarginBadgeText = computed(() => {
  if (netMargin.value == null) return null
  const abs = Math.abs(netMargin.value)
  return `${abs >= 10 ? abs.toFixed(0) : abs.toFixed(1)}%`
})
const netMarginTitle = computed(() => {
  if (netMargin.value == null) return ''
  return t('watchlist.netMarginTooltip', { pct: `${netMargin.value.toFixed(1)}%` })
})

// Card-specific computeds
const volume = computed(() => {
  const v = props.item.volume
  if (!v) return null
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`
  return String(v)
})

const dayRangePct = computed(() => {
  const { dayLow: lo, dayHigh: hi, price } = props.item
  if (lo == null || hi == null || price == null || hi === lo) return null
  return Math.max(0, Math.min(100, ((price - lo) / (hi - lo)) * 100))
})

const pnl = computed(() => props.position?.pnl ?? null)
const pnlPercent = computed(() => props.position?.pnlPercent ?? null)
</script>

<template>
  <div
    class="watch-card"
    :class="{ 'card-held': highlightHeld, 'card-stale': item.stale }"
    @click="emit('open-stock', item)"
  >
    <!-- Header: ticker + all badges -->
    <div class="card-header">
      <div class="card-identity">
        <span
          class="card-ticker"
          :data-tour="exposeTourAnchors ? 'wl-row-identity' : null"
        >
          {{ item.ticker }}
          <span
            v-if="activeAlerts"
            class="alert-badge"
            :title="t('watchlist.activeAlerts', { count: activeAlerts, plural: activeAlerts > 1 ? 's' : '' })"
          >
            <i class="pi pi-bell" />
            <span v-if="activeAlerts > 1" class="alert-count">{{ activeAlerts }}</span>
          </span>
          <span
            v-if="earningsInDays != null"
            class="earnings-badge"
            :title="earningsTitle"
            :data-tour="exposeTourAnchors ? 'wl-row-earnings' : null"
          >
            <i class="pi pi-megaphone" />
            {{ earningsInDays === 0 ? t('watchlist.earningsToday') : `${earningsInDays}${t('watchlist.daysShort')}` }}
          </span>
        </span>
        <span class="card-company text-muted">{{ item.companyName }}</span>
      </div>

      <!-- All data pills — always visible regardless of groupMode -->
      <div class="card-pills">
        <span
          v-if="hasDividendSupport"
          class="dividend-badge"
          :title="dividendTitle"
          :data-tour="exposeTourAnchors ? 'wl-row-dividend' : null"
        >
          <i class="pi pi-percentage" />
          {{ dividendBadgeText }}
        </span>
        <span
          v-if="insiderNet != null"
          class="insider-badge"
          :class="insiderNet > 0 ? 'insider-buy' : 'insider-sell'"
          :title="insiderTitle"
        >
          <i :class="insiderNet > 0 ? 'pi pi-arrow-up' : 'pi pi-arrow-down'" />
          {{ insiderBadgeText }}
        </span>
        <span
          v-if="netMargin != null"
          class="fundamentals-badge"
          :class="netMargin > 0 ? 'margin-positive' : 'margin-negative'"
          :title="netMarginTitle"
        >
          <i class="pi pi-chart-line" />
          {{ netMarginBadgeText }}
        </span>
      </div>
    </div>

    <!-- Sparkline -->
    <div
      class="card-chart"
      :data-tour="exposeTourAnchors ? 'wl-row-chart' : null"
    >
      <SparklineChart v-if="item.history?.length" :data="item.history" :height="56" />
      <div v-if="item.history?.length" class="chart-range-labels text-muted">
        <span>{{ useTickerCurrency(rangeStartPrice, item.ticker) }}</span>
        <span>{{ useTickerCurrency(rangeEndPrice, item.ticker) }}</span>
      </div>
    </div>

    <!-- Price + change badge -->
    <div class="card-price-row">
      <span
        class="card-price"
        :data-tour="exposeTourAnchors ? 'wl-row-price' : null"
      >{{ useTickerCurrency(item.price, item.ticker) }}</span>
      <div class="card-price-right">
        <span v-if="isStaleQuote" class="badge badge-stale">{{ t('watchlist.noTrade') }}</span>
        <span
          class="badge"
          :class="(rangeChangePercent ?? 0) >= 0 ? 'badge-gain' : 'badge-loss'"
          :data-tour="exposeTourAnchors ? 'wl-row-change' : null"
        >{{ usePercent(rangeChangePercent) }}</span>
      </div>
    </div>

    <!-- Extended hours (pre/post market) -->
    <div v-if="hasVisibleExtended" class="card-ext" :title="activeExtended.label">
      <span class="ext-label text-muted">{{ activeExtended.label }}</span>
      <span
        v-if="activeExtended.price != null"
        class="ext-price"
        :class="activeExtended.label.startsWith('Pre') ? 'gold' : 'purple'"
      >{{ useTickerCurrency(activeExtended.price, item.ticker) }}</span>
      <span
        v-if="activeExtended.percent != null"
        class="ext-pct"
        :class="activeExtended.percent >= 0 ? 'extended-gain' : 'extended-loss'"
      >{{ usePercent(activeExtended.percent) }}</span>
    </div>

    <!-- Day range bar -->
    <div
      v-if="item.dayLow != null && item.dayHigh != null"
      class="card-range-row"
    >
      <span class="range-val text-muted">{{ useTickerCurrency(item.dayLow, item.ticker) }}</span>
      <div class="range-track">
        <div
          v-if="dayRangePct != null"
          class="range-thumb"
          :style="{ left: `${dayRangePct}%` }"
        />
      </div>
      <span class="range-val text-muted">{{ useTickerCurrency(item.dayHigh, item.ticker) }}</span>
    </div>

    <!-- Stats row -->
    <div v-if="volume" class="card-stats text-muted">
      <span>Vol: {{ volume }}</span>
    </div>

    <!-- P/L row — held positions only -->
    <div v-if="highlightHeld && pnl != null" class="card-pnl">
      <span class="pnl-label text-muted">P/L</span>
      <span :class="pnl >= 0 ? 'gain' : 'loss'" class="pnl-amount">
        {{ pnl >= 0 ? '+' : '' }}{{ useTickerCurrency(Math.abs(pnl), item.ticker) }}
      </span>
      <span v-if="pnlPercent != null" :class="pnlPercent >= 0 ? 'gain' : 'loss'" class="pnl-pct">
        {{ usePercent(pnlPercent) }}
      </span>
    </div>

    <!-- Group tags -->
    <div
      v-if="item.groups?.length"
      class="card-tags"
      @click.stop="emit('edit-groups', item)"
    >
      <span v-for="g in item.groups" :key="g" class="group-tag">{{ g }}</span>
    </div>
  </div>
</template>

<style scoped>
.watch-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 0.85rem;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  transition: border-color 0.15s, box-shadow 0.15s;
  min-width: 0;
}

.watch-card:hover {
  border-color: color-mix(in srgb, var(--neon-blue) 40%, var(--border));
  box-shadow: 0 2px 12px color-mix(in srgb, var(--text-primary) 8%, transparent);
}

.card-held {
  border-top: 2px solid var(--neon-blue);
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--neon-blue) 18%, transparent),
    0 2px 12px color-mix(in srgb, var(--neon-blue) 10%, transparent);
}

.card-stale .card-chart,
.card-stale .card-price-row {
  animation: card-pulse 1.2s ease-in-out infinite;
}

@keyframes card-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}

/* Header */
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.5rem;
  min-width: 0;
}

.card-identity {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.card-ticker {
  font-size: 0.88rem;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: 0.02em;
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.card-company {
  font-size: 0.7rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Pills column */
.card-pills {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
  flex-shrink: 0;
}

/* Sparkline */
.card-chart {
  position: relative;
  width: 100%;
  height: 56px;
  margin-bottom: 10px;
}

.chart-range-labels {
  position: absolute;
  inset: auto 0 -12px 0;
  display: flex;
  justify-content: space-between;
  font-size: 0.58rem;
  line-height: 1;
  pointer-events: none;
}

/* Price row */
.card-price-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
}

.card-price {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary);
}

.card-price-right {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

/* Extended hours */
.card-ext {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.72rem;
}

.ext-label {
  font-size: 0.62rem;
  flex-shrink: 0;
}

.ext-price {
  font-weight: 600;
}

.ext-pct {
  font-weight: 700;
}

/* Day range bar */
.card-range-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.range-val {
  font-size: 0.62rem;
  white-space: nowrap;
}

.range-track {
  flex: 1;
  height: 3px;
  background: color-mix(in srgb, var(--border) 90%, transparent);
  border-radius: 2px;
  position: relative;
}

.range-thumb {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--neon-blue);
  box-shadow: 0 0 4px color-mix(in srgb, var(--neon-blue) 60%, transparent);
}

/* Stats */
.card-stats {
  font-size: 0.68rem;
}

/* P/L row */
.card-pnl {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.28rem 0.55rem;
  border-radius: 7px;
  background: color-mix(in srgb, var(--neon-blue) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--neon-blue) 20%, transparent);
}

.pnl-label {
  font-size: 0.62rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  flex: 1;
}

.pnl-amount,
.pnl-pct {
  font-size: 0.78rem;
  font-weight: 700;
}

/* Tags */
.card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  cursor: pointer;
}

/* Reuse badge styles from WatchRow */
.alert-badge {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-left: 4px;
  color: var(--neon-blue);
  vertical-align: middle;
}

.alert-badge i {
  font-size: 0.7rem;
  filter: drop-shadow(0 0 4px var(--neon-blue));
}

.alert-count {
  font-size: 0.62rem;
  font-weight: 700;
  line-height: 1;
}

.earnings-badge {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 0.6rem;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 5px;
  background: rgba(255, 184, 0, 0.14);
  color: #ffb800;
  vertical-align: middle;
  line-height: 1.4;
}

.earnings-badge i { font-size: 0.6rem; }

.dividend-badge {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 0.6rem;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 5px;
  background: color-mix(in srgb, var(--green) 12%, transparent);
  color: var(--green);
  line-height: 1.4;
}

.dividend-badge i { font-size: 0.6rem; }

.insider-badge {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 0.6rem;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 5px;
  line-height: 1.4;
}

.insider-badge i { font-size: 0.6rem; }

.insider-badge.insider-buy {
  background: color-mix(in srgb, var(--neon-green) 12%, transparent);
  color: var(--neon-green);
}

.insider-badge.insider-sell {
  background: color-mix(in srgb, var(--neon-red) 12%, transparent);
  color: var(--neon-red);
}

.fundamentals-badge {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 0.6rem;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 5px;
  line-height: 1.4;
}

.fundamentals-badge i { font-size: 0.6rem; }

.fundamentals-badge.margin-positive {
  background: color-mix(in srgb, var(--neon-green) 12%, transparent);
  color: var(--neon-green);
}

.fundamentals-badge.margin-negative {
  background: color-mix(in srgb, var(--neon-red) 12%, transparent);
  color: var(--neon-red);
}

.badge {
  font-size: 0.75rem;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 5px;
  min-width: 56px;
  text-align: center;
}

.badge-gain { background: var(--green); color: #fff; }
.badge-loss { background: var(--red); color: #fff; }

.badge-stale {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-secondary);
  font-size: 0.62rem;
  font-weight: 500;
  min-width: unset;
}

.extended-gain { color: var(--green); }
.extended-loss { color: var(--red); }
.gold { color: var(--gold); }
.purple { color: var(--purple); }

.gain { color: var(--green); }
.loss { color: var(--red); }

.group-tag {
  font-size: 0.6rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  padding: 1px 7px;
  border-radius: 10px;
  background: rgba(59, 130, 246, 0.12);
  border: 1px solid rgba(59, 130, 246, 0.35);
  color: #93c5fd;
}
</style>
