<script setup>
import {computed, toRef, useAttrs} from 'vue'
import {usePercent, useTickerCurrency} from '@/composables/useFormat'
import {insiderValuePctOf} from '@/composables/useGrouping'
import {useAlertsStore} from '@/stores/alerts'
// import {useItemMomentum} from '@/composables/useMomentumScore'
import {useI18n} from '@/composables/useI18n'
import SparklineChart from '@/components/charts/SparklineChart.vue'

const props = defineProps({
  item: {type: Object, required: true},
  highlightHeld: {type: Boolean, default: false},
})
const emit = defineEmits(['edit-groups', 'open-stock'])
const alerts = useAlertsStore()
const {t} = useI18n()
const attrs = useAttrs()
const exposeTourAnchors = computed(() => attrs['data-tour'] === 'wl-row')

// marketState from Yahoo: 'REGULAR' = open, 'PRE' = pre-market, 'POST' = after-hours, 'CLOSED' = closed
const marketDot = computed(() => {
  const state = props.item.marketState
  if (!state) return null
  if (state === 'REGULAR') return {cls: 'dot-open', title: t('watchlist.marketOpenLive')}
  if (state === 'PRE') return {cls: 'dot-ext', title: t('watchlist.preMarket')}
  if (state === 'POST') return {cls: 'dot-ext', title: t('watchlist.afterHours')}
  return {cls: 'dot-closed', title: t('watchlist.marketClosedLastClose')}
})

// Active price alerts on this ticker → drives the bell indicator.
const activeAlerts = computed(() =>
    alerts.forTicker(props.item.ticker).filter((a) => a.active).length
)

const rangeStartPrice = computed(() => props.item.history?.[0]?.close ?? null)
const rangeEndPrice = computed(() => props.item.history?.[props.item.history.length - 1]?.close ?? null)
const rangeChangePercent = computed(() => {
  const start = rangeStartPrice.value
  const end = rangeEndPrice.value
  if (start != null && end != null && start !== 0) {
    return ((end - start) / start) * 100
  }
  return props.item.changePercent ?? null
})

function calculateExtendedChangePercent(price, change) {
  if (price == null || change == null) return null
  const previous = price - change
  if (!Number.isFinite(previous) || previous === 0) return null
  return (change / previous) * 100
}

// Last-seen snapshots are stale if older than 20 hours — covers overnight
// pre-market (e.g. 04:00 ET today vs 20:00 ET yesterday = 8 hrs) but rejects
// data from a previous trading session (e.g. Friday post seen on Monday).
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

// Quote is stale when CLOSED and last trade was >28 hours ago (weekend/holiday).
const isStaleQuote = computed(() => {
  if (props.item.marketState !== 'CLOSED') return false
  const t = props.item.regularMarketTime
  if (!t) return false
  return Date.now() - new Date(t).getTime() > 28 * 60 * 60 * 1000
})

// During REGULAR hours show today's pre-market snapshot (gap context) but
// never post-market (which would be from a previous session).
// During PRE/POST/CLOSED show the matching session first, fall back to the other.
const activeExtended = computed(() => {
  const ticker = props.item.ticker
  const state = props.item.marketState
  if (/-USD$/u.test(ticker)) return resolveExtendedHours('post') // crypto: no pre-market
  if (state === 'REGULAR') return resolveExtendedHours('pre') // today's gap only, no post
  const ny = new Date(new Date().toLocaleString('en-US', {timeZone: 'America/New_York'}))
  const minutes = ny.getHours() * 60 + ny.getMinutes()
  const isPreTime = minutes < 9 * 60 + 30
  return resolveExtendedHours(isPreTime ? 'pre' : 'post') ?? resolveExtendedHours(isPreTime ? 'post' : 'pre') ?? null
})

// Don't show a Pre/Post block on stale ("No trade today") rows — the extended
// data is from a previous session and would contradict the badge.
const hasVisibleExtended = computed(() =>
    !isStaleQuote.value && activeExtended.value?.percent != null
)

// ── Signal / momentum ────────────────────────────────────────────────────────

const extPercentRef = computed(() => activeExtended.value?.percent ?? null)
// Momentum signal disabled for now — see useMomentumScore.js
// const {combinedScore, signal, tooltipText} = useItemMomentum(toRef(props, 'item'), extPercentRef)

// ── Earnings proximity badge ─────────────────────────────────────────────────
// Days until the next reported earnings date, shown only within a week.
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
  return t('watchlist.earningsOn', {date: when.toLocaleDateString()})
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
  if (yieldText && rateText) return t('watchlist.dividendTooltipFull', {yield: yieldText, rate: rateText})
  if (yieldText) return t('watchlist.dividendTooltipYield', {yield: yieldText})
  if (rateText) return t('watchlist.dividendTooltipRate', {rate: rateText})
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
// % of market cap traded by insiders, net, trailing 3mo — sizes the move
// against the company instead of a raw share count that's meaningless
// compared across mega-caps and micro-caps. Falls back to the raw share
// count only when price/marketCap aren't available to normalize against.
const insiderValuePct = computed(() => insiderNet.value == null ? null : insiderValuePctOf(props.item))
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
    return t('watchlist.insiderTooltipPct', {direction, shares, pct: `${insiderValuePct.value.toFixed(2)}%`})
  }
  return t('watchlist.insiderTooltip', {direction, shares})
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
  return t('watchlist.netMarginTooltip', {pct: `${netMargin.value.toFixed(1)}%`})
})
</script>

<template>
  <div :class="{ 'watch-row-held': highlightHeld, 'watch-row-stale': item.stale }" class="watch-row" @click="emit('open-stock', item)">
    <div class="row-left">
      <span :data-tour="exposeTourAnchors ? 'wl-row-identity' : null" class="ticker">
        {{ item.ticker }}
        <span v-if="activeAlerts"
              :title="t('watchlist.activeAlerts', { count: activeAlerts, plural: activeAlerts > 1 ? 's' : '' })"
              class="alert-badge">
          <i class="pi pi-bell"/>
          <span v-if="activeAlerts > 1" class="alert-count">{{ activeAlerts }}</span>
        </span>
        <!-- Momentum signal disabled for now
        <span :class="signal.cls" :title="tooltipText" class="signal-badge">
          {{ signal.icon }}<span class="signal-score">({{ combinedScore > 0 ? '+' : '' }}{{ combinedScore }})</span>
        </span>
        -->
        <span
            v-if="earningsInDays != null"
            :data-tour="exposeTourAnchors ? 'wl-row-earnings' : null"
            :title="earningsTitle"
            class="earnings-badge">
          <i class="pi pi-megaphone"/>
          {{ earningsInDays === 0 ? t('watchlist.earningsToday') : `${earningsInDays}${t('watchlist.daysShort')}` }}
        </span>
        <span
            v-if="hasDividendSupport"
            :data-tour="exposeTourAnchors ? 'wl-row-dividend' : null"
            :title="dividendTitle"
            class="dividend-badge">
          <i class="pi pi-percentage"/>
          {{ dividendBadgeText }}
        </span>
        <span
            v-if="insiderNet != null"
            :class="insiderNet > 0 ? 'insider-buy' : 'insider-sell'"
            :title="insiderTitle"
            class="insider-badge">
          <i :class="insiderNet > 0 ? 'pi pi-arrow-up' : 'pi pi-arrow-down'"/>
          {{ insiderBadgeText }}
        </span>
        <span
            v-if="netMargin != null"
            :class="netMargin > 0 ? 'margin-positive' : 'margin-negative'"
            :title="netMarginTitle"
            class="fundamentals-badge">
          <i class="pi pi-chart-line"/>
          {{ netMarginBadgeText }}
        </span>
      </span>
      <span :data-tour="exposeTourAnchors ? 'wl-row-company' : null" class="company text-muted">{{ item.companyName }}</span>
      <div class="group-tags compact-tags" @click.stop="emit('edit-groups', item)">
        <span v-for="g in item.groups || []" :key="g" class="group-tag">{{ g }}</span>
        <span class="group-tag add-tag">
          <i class="pi pi-plus"/><span v-if="!item.groups?.length"> {{ t('watchlist.tag') }}</span>
        </span>
      </div>
    </div>

    <div :data-tour="exposeTourAnchors ? 'wl-row-chart' : null" class="row-chart">
      <SparklineChart
          v-if="item.history?.length"
          :data="item.history"
      />
      <div v-if="item.history?.length" class="chart-range-labels text-muted">
        <span>{{ useTickerCurrency(rangeStartPrice, item.ticker) }}</span>
        <span>{{ useTickerCurrency(rangeEndPrice, item.ticker) }}</span>
      </div>
    </div>

    <div class="row-right">
      <div v-if="hasVisibleExtended" :title="activeExtended.label" class="extended-combined">
        <span v-if="activeExtended.price != null" :class="activeExtended.label.startsWith('Pre') ? 'gold' : 'purple'"
              class="ext-price">{{
            useTickerCurrency(activeExtended.price, item.ticker)
          }}</span>
        <span v-if="activeExtended.percent != null" class="ext-bottom">
<!--          <i class="pi pi-sun ext-icon"/>-->
          <span :class="activeExtended.percent >= 0 ? 'extended-gain' : 'extended-loss'"
                class="ext-val">{{ usePercent(activeExtended.percent) }}</span>
        </span>
      </div>
      <span class="price-line">
        <span :data-tour="exposeTourAnchors ? 'wl-row-price' : null" class="price">{{ useTickerCurrency(item.price, item.ticker) }}</span>
        <!--        <span v-if="marketDot" :class="marketDot.cls" :title="marketDot.title" class="market-dot"/>-->
      </span>
      <span v-if="isStaleQuote" class="badge badge-stale">{{ t('watchlist.noTrade') }}</span>
      <span
          :data-tour="exposeTourAnchors ? 'wl-row-change' : null"
          :class="(rangeChangePercent ?? 0) >= 0 ? 'badge-gain' : 'badge-loss'"
          class="badge">
        {{ usePercent(rangeChangePercent) }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.watch-row {
  display: flex;
  align-items: center;
  padding: 0.75rem 0.25rem;
  border-bottom: 1px solid var(--border);
  gap: 0.5rem;
  cursor: pointer;
  transition: background 0.15s;
}

.watch-row-held {
  border-left: 3px solid var(--neon-blue);
  padding-left: 7px;
  position: relative;
  left: -8px;
}

.watch-row:active {
  background: rgba(255, 255, 255, 0.03);
}

/* Stale rows show last-known data while fresh quotes load — pulse the data
   columns (price/chart) to signal they're refreshing; keep ticker crisp. */
.watch-row-stale .row-chart,
.watch-row-stale .row-right {
  animation: watch-row-pulse 1.2s ease-in-out infinite;
}

@keyframes watch-row-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}

.row-left {
  display: flex;
  flex-direction: column;
  flex: 0 0 150px;
}

@media (max-width: 360px) {
  .row-left {
    flex: 0 0 90px;
  }
}

.ticker {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: 0.02em;
}

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

.earnings-badge i {
  font-size: 0.6rem;
}

.dividend-badge {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 0.6rem;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 5px;
  background: rgba(0, 195, 106, 0.12);
  color: #00c36a;
  vertical-align: middle;
  line-height: 1.4;
  margin-left: 4px;
}

.dividend-badge i {
  font-size: 0.6rem;
}

.insider-badge {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 0.6rem;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 5px;
  vertical-align: middle;
  line-height: 1.4;
  margin-left: 4px;
}

.insider-badge i {
  font-size: 0.6rem;
}

.insider-badge.insider-buy {
  background: rgba(0, 255, 136, 0.12);
  color: var(--neon-green, #00ff88);
}

.insider-badge.insider-sell {
  background: rgba(255, 51, 102, 0.12);
  color: var(--neon-red, #ff3366);
}

.fundamentals-badge {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 0.6rem;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 5px;
  vertical-align: middle;
  line-height: 1.4;
  margin-left: 4px;
}

.fundamentals-badge i {
  font-size: 0.6rem;
}

.fundamentals-badge.margin-positive {
  background: rgba(0, 255, 136, 0.12);
  color: var(--neon-green, #00ff88);
}

.fundamentals-badge.margin-negative {
  background: rgba(255, 51, 102, 0.12);
  color: var(--neon-red, #ff3366);
}

.company {
  font-size: 0.72rem;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 110px;
}

.group-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 5px;
  cursor: pointer;
  width: fit-content;
}

.compact-tags .group-tag {
  font-size: 0.55rem;
  padding: 0 5px;
  max-width: 84px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-tag {
  font-size: 0.62rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  padding: 1px 7px;
  border-radius: 10px;
  background: rgba(59, 130, 246, 0.12);
  border: 1px solid rgba(59, 130, 246, 0.35);
  color: #93c5fd;
}

.add-tag {
  background: transparent;
  border: 1px dashed var(--border);
  color: var(--text-secondary);
}

.add-tag i {
  font-size: 0.55rem;
}

.row-chart {
  position: relative;
  flex: 0 0 100px;
  width: 100px;
  height: 40px;
  align-self: flex-end;
}

.chart-range-labels {
  position: absolute;
  inset: auto 0 -12px 0;
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.58rem;
  line-height: 1;
  pointer-events: none;
}

.row-right {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  min-width: 76px;
  flex: 1;
  gap: 4px;
}

.price-line {
  display: flex;
  align-items: center;
  gap: 4px;
}

.price {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-primary);
}

.market-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.dot-open {
  background: #00c36a;
  box-shadow: 0 0 4px #00c36a;
}

.dot-ext {
  background: #c084fc;
  box-shadow: 0 0 4px #c084fc;
}

.dot-closed {
  background: var(--text-secondary);
  opacity: 0.5;
}

.badge {
  font-size: 0.75rem;
  font-weight: 700;
  padding: 2px 4px;
  border-radius: 5px;
  min-width: 60px;
  text-align: center;
}

.badge-gain {
  background: #00c36a;
  color: #fff;
}

.badge-loss {
  background: #e02d4a;
  color: #fff;
}

.badge-stale {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-secondary);
  font-size: 0.62rem;
  font-weight: 500;
  min-width: unset;
}

.extended-combined {
  position: absolute;
  right: 65px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
  line-height: 1;
  border-radius: 5px;
  padding: 2px 5px;
  pointer-events: none;
  background-color: var(--bg-primary);
}

.ext-price {
  font-size: 0.66rem;
  font-weight: 600;
}

.ext-price.purple {
  color: #c084fc;
}

.ext-price.gold {
  color: #fbbf24;
}

.purple {
  color: var(--purple);
}

.gold {
  color: var(--gold);
}

.ext-bottom {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.ext-icon {
  font-size: 0.55rem;
  color: #c084fc;
}

.ext-val {
  font-size: 0.66rem;
  font-weight: 700;
}


.extended-gain {
  color: #00c36a;
}

.extended-loss {
  color: #e02d4a;
}

.signal-badge {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  padding: 1px 4px;
  border-radius: 4px;
  vertical-align: middle;
  margin-left: 4px;
}

.signal-score {
  font-size: 0.52rem;
  font-weight: 600;
  opacity: 0.75;
}

.sig-max-bull {
  background: rgba(0, 195, 106, 0.28);
  color: #00c36a;
  box-shadow: 0 0 8px rgba(0, 195, 106, 0.5);
}

.sig-strong-bull {
  background: rgba(0, 195, 106, 0.18);
  color: #00c36a;
  box-shadow: 0 0 5px rgba(0, 195, 106, 0.3);
}

.sig-bull {
  background: rgba(0, 195, 106, 0.1);
  color: #00c36a;
}

.sig-max-bear {
  background: rgba(224, 45, 74, 0.28);
  color: #e02d4a;
  box-shadow: 0 0 8px rgba(224, 45, 74, 0.5);
}

.sig-strong-bear {
  background: rgba(224, 45, 74, 0.18);
  color: #e02d4a;
  box-shadow: 0 0 5px rgba(224, 45, 74, 0.3);
}

.sig-bear {
  background: rgba(224, 45, 74, 0.1);
  color: #e02d4a;
}

.sig-neutral {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-secondary);
}
</style>
