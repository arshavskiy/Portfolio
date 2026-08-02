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
  if (start != null && end != null && start !== 0)
    return ((end - start) / start) * 100
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
  if (isRecentSnapshot(props.item[lastTimeKey]) &&
    (props.item[lastPriceKey] != null || props.item[lastChangeKey] != null || props.item[lastPercentKey] != null)) {
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
const dividendBadgeText = computed(() => formatDividendYield(dividendYield.value) || t('watchlist.dividendBadge'))
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
  if (insiderValuePct.value != null)
    return t('watchlist.insiderTooltipPct', { direction, shares, pct: `${insiderValuePct.value.toFixed(2)}%` })
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

function formatCompact(n) {
  if (n == null || !Number.isFinite(n)) return null
  const abs = Math.abs(n)
  if (abs >= 1e12) return `${(n / 1e12).toFixed(2)}T`
  if (abs >= 1e9)  return `${(n / 1e9).toFixed(2)}B`
  if (abs >= 1e6)  return `${(n / 1e6).toFixed(2)}M`
  if (abs >= 1e3)  return `${(n / 1e3).toFixed(1)}K`
  return String(n)
}

const subStats = computed(() => {
  const i = props.item
  const stats = []
  if (i.dayLow != null && i.dayHigh != null)
    stats.push({ label: 'Day', value: `${useTickerCurrency(i.dayLow, i.ticker)} – ${useTickerCurrency(i.dayHigh, i.ticker)}` })
  if (i.week52Low != null && i.week52High != null)
    stats.push({ label: '52W', value: `${useTickerCurrency(i.week52Low, i.ticker)} – ${useTickerCurrency(i.week52High, i.ticker)}` })
  if (i.pe != null)
    stats.push({ label: 'P/E', value: i.pe.toFixed(1) })
  return stats
})
</script>

<template>
  <div
    :class="{ 'watch-row-held': highlightHeld, 'watch-row-stale': item.stale }"
    class="watch-row"
    @click="emit('open-stock', item)"
  >
    <!-- top line -->
    <div class="row-top">
      <div class="row-left">
        <span
          :data-tour="exposeTourAnchors ? 'wl-row-identity' : null"
          class="ticker"
        >
          {{ item.ticker }}
          <span
            v-if="activeAlerts"
            :title="t('watchlist.activeAlerts', { count: activeAlerts, plural: activeAlerts > 1 ? 's' : '' })"
            class="alert-badge"
          >
            <i class="pi pi-bell" />
            <span v-if="activeAlerts > 1" class="alert-count">{{ activeAlerts }}</span>
          </span>
          <span
            v-if="earningsInDays != null"
            :data-tour="exposeTourAnchors ? 'wl-row-earnings' : null"
            :title="earningsTitle"
            class="earnings-badge"
          >
            <i class="pi pi-megaphone" />
            {{ earningsInDays === 0 ? t('watchlist.earningsToday') : `${earningsInDays}${t('watchlist.daysShort')}` }}
          </span>
          <span
            v-if="hasDividendSupport"
            :data-tour="exposeTourAnchors ? 'wl-row-dividend' : null"
            :title="dividendTitle"
            class="dividend-badge"
          >
            <i class="pi pi-percentage" />
            {{ dividendBadgeText }}
          </span>
          <span
            v-if="insiderNet != null"
            :class="insiderNet > 0 ? 'insider-buy' : 'insider-sell'"
            :title="insiderTitle"
            class="insider-badge"
          >
            <i :class="insiderNet > 0 ? 'pi pi-arrow-up' : 'pi pi-arrow-down'" />
            {{ insiderBadgeText }}
          </span>
          <span
            v-if="netMargin != null"
            :class="netMargin > 0 ? 'margin-positive' : 'margin-negative'"
            :title="netMarginTitle"
            class="fundamentals-badge"
          >
            <i class="pi pi-chart-line" />
            {{ netMarginBadgeText }}
          </span>
        </span>
        <span
          :data-tour="exposeTourAnchors ? 'wl-row-company' : null"
          class="company text-muted"
        >{{ item.companyName }}</span>
      </div>

      <div class="row-chart-zone">
        <div
          :data-tour="exposeTourAnchors ? 'wl-row-chart' : null"
          class="row-chart"
        >
          <SparklineChart v-if="item.history?.length" :data="item.history" :height="36" />
          <div v-if="item.history?.length" class="chart-range-labels text-muted">
            <span>{{ useTickerCurrency(rangeStartPrice, item.ticker) }}</span>
            <span>{{ useTickerCurrency(rangeEndPrice, item.ticker) }}</span>
          </div>
        </div>
      </div>

      <div class="row-right">
        <span v-if="isStaleQuote" class="badge badge-stale">{{ t('watchlist.noTrade') }}</span>
        <span class="price-line">
          <span
            v-if="hasVisibleExtended"
            :title="activeExtended.label"
            :class="activeExtended.label.startsWith('Pre') ? 'ext-gold' : 'ext-purple'"
            class="ext-inline"
          >{{ usePercent(activeExtended.percent) }}</span>
          <span
            :data-tour="exposeTourAnchors ? 'wl-row-price' : null"
            class="price"
          >{{ useTickerCurrency(item.price, item.ticker) }}</span>
        </span>
        <span
          :data-tour="exposeTourAnchors ? 'wl-row-change' : null"
          :class="(rangeChangePercent ?? 0) >= 0 ? 'badge-gain' : 'badge-loss'"
          class="badge"
        >{{ usePercent(rangeChangePercent) }}</span>
      </div>
    </div>

    <!-- sub-row: secondary stats + extended + tags -->
    <div
      v-if="subStats.length || hasVisibleExtended || item.groups?.length"
      class="row-sub"
    >
      <span v-for="stat in subStats" :key="stat.label" class="sub-stat">
        <span class="sub-label">{{ stat.label }}</span>
        <span class="sub-value">{{ stat.value }}</span>
      </span>
      <span
        v-if="hasVisibleExtended"
        class="sub-stat"
        :title="activeExtended.label"
      >
        <span class="sub-label">{{ activeExtended.label.startsWith('Pre') ? 'Pre' : 'Post' }}</span>
        <span
          class="sub-value"
          :class="activeExtended.label.startsWith('Pre') ? 'sub-gold' : 'sub-purple'"
        >{{ usePercent(activeExtended.percent) }}</span>
      </span>
      <span
        v-if="item.groups?.length"
        class="sub-tags"
        @click.stop="emit('edit-groups', item)"
      >
        <span v-for="g in item.groups" :key="g" class="group-tag">{{ g }}</span>
      </span>
    </div>
  </div>
</template>

<style scoped>
.watch-row {
  display: flex;
  flex-direction: column;
  padding: 0.6rem 0.25rem 0.4rem;
  border-bottom: none;
  gap: 0;
  cursor: pointer;
  transition: background 0.15s;
}

.watch-row-held {
  border-left: 3px solid var(--neon-blue);
  padding-left: 7px;
  position: relative;
  left: -8px;
}

.watch-row:hover {
  background: rgba(255, 255, 255, 0.04);
}

.watch-row:active {
  background: rgba(255, 255, 255, 0.07);
}

.watch-row-stale .row-chart,
.watch-row-stale .row-right {
  animation: watch-row-pulse 1.2s ease-in-out infinite;
}

@keyframes watch-row-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}

/* ── top line ─────────────────────────────────────────────── */
.row-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  width: 100%;
}

.row-left {
  display: flex;
  flex-direction: column;
  flex: 0 0 260px;
  min-width: 0;
}

.ticker {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: 0.02em;
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 3px;
}

.alert-badge {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  color: var(--neon-blue);
  vertical-align: middle;
}

.alert-badge i { font-size: 0.7rem; filter: drop-shadow(0 0 4px var(--neon-blue)); }
.alert-count { font-size: 0.62rem; font-weight: 700; line-height: 1; }

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
.insider-badge.insider-buy { background: color-mix(in srgb, var(--neon-green) 12%, transparent); color: var(--neon-green); }
.insider-badge.insider-sell { background: color-mix(in srgb, var(--neon-red) 12%, transparent); color: var(--neon-red); }

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
.fundamentals-badge.margin-positive { background: color-mix(in srgb, var(--neon-green) 12%, transparent); color: var(--neon-green); }
.fundamentals-badge.margin-negative { background: color-mix(in srgb, var(--neon-red) 12%, transparent); color: var(--neon-red); }

.company {
  font-size: 0.72rem;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}

.row-chart-zone {
  flex: 1 1 0;
  display: flex;
  justify-content: center;
  align-items: center;
  min-width: 0;
}

.row-chart {
  width: 200px;
  flex-shrink: 0;
}

.chart-range-labels {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.58rem;
  line-height: 1;
  pointer-events: none;
  margin-top: 2px;
}

.row-right {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-end;
  flex: 0 0 auto;
  gap: 8px;
  flex-shrink: 0;
}

.price-line { display: flex; align-items: center; gap: 4px; }

.price {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary);
}

.badge {
  font-size: 0.75rem;
  font-weight: 700;
  padding: 2px 4px;
  border-radius: 5px;
  min-width: 60px;
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

.ext-inline {
  font-size: 0.66rem;
  font-weight: 700;
  margin-right: 6px;
}
.ext-gold { color: var(--gold); }
.ext-purple { color: var(--purple); }
.extended-gain { color: var(--green); }
.extended-loss { color: var(--red); }

/* ── sub-row ──────────────────────────────────────────────── */
.row-sub {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.65rem;
  padding: 0.25rem 0.1rem 0.05rem;
}

.sub-stat {
  display: inline-flex;
  align-items: baseline;
  gap: 3px;
  font-size: 0.68rem;
  white-space: nowrap;
}

.sub-label {
  color: var(--text-muted);
  font-weight: 500;
}

.sub-value {
  color: var(--text-secondary);
  font-weight: 600;
}

.sub-gold { color: var(--gold); }
.sub-purple { color: var(--purple); }

.sub-tags {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  cursor: pointer;
}

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
