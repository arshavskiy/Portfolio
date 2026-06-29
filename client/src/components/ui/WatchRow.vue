<script setup>
import {computed, toRef} from 'vue'
import {usePercent, useTickerCurrency} from '@/composables/useFormat'
import {useAlertsStore} from '@/stores/alerts'
import {useItemMomentum} from '@/composables/useMomentumScore'
import SparklineChart from '@/components/charts/SparklineChart.vue'

const props = defineProps({
  item: {type: Object, required: true},
})
const emit = defineEmits(['edit-groups', 'open-stock'])
const alerts = useAlertsStore()

// marketState from Yahoo: 'REGULAR' = open, 'PRE' = pre-market, 'POST' = after-hours, 'CLOSED' = closed
const marketDot = computed(() => {
  const state = props.item.marketState
  if (!state) return null
  if (state === 'REGULAR') return {cls: 'dot-open', title: 'Market open — live price'}
  if (state === 'PRE') return {cls: 'dot-ext', title: 'Pre-market'}
  if (state === 'POST') return {cls: 'dot-ext', title: 'After-hours'}
  return {cls: 'dot-closed', title: 'Market closed — last close price'}
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
      label: isPost ? 'After hours' : 'Pre-market',
      price: props.item[priceKey] ?? null,
      percent: props.item[percentKey] ?? calculateExtendedChangePercent(props.item[priceKey], props.item[changeKey]),
    }
  }

  if (
    isRecentSnapshot(props.item[lastTimeKey]) &&
    (props.item[lastPriceKey] != null || props.item[lastChangeKey] != null || props.item[lastPercentKey] != null)
  ) {
    return {
      label: isPost ? 'After hours (last seen)' : 'Pre-market (last seen)',
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
  const nyParts = new Intl.DateTimeFormat('en-US', {timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hour12: false}).formatToParts(new Date())
  const nyH = parseInt(nyParts.find(p => p.type === 'hour').value, 10)
  const nyM = parseInt(nyParts.find(p => p.type === 'minute').value, 10)
  const minutes = nyH * 60 + nyM
  const isPreTime = minutes < 9 * 60 + 30
  return resolveExtendedHours(isPreTime ? 'pre' : 'post') ?? resolveExtendedHours(isPreTime ? 'post' : 'pre') ?? null
})

// ── Signal / momentum ────────────────────────────────────────────────────────

const extPercentRef = computed(() => activeExtended.value?.percent ?? null)
const {combinedScore, signal, tooltipText} = useItemMomentum(toRef(props, 'item'), extPercentRef)
</script>

<template>
  <div class="watch-row" @click="emit('open-stock', item)">
    <div class="row-left">
      <span class="ticker">
        {{ item.ticker }}
        <span v-if="activeAlerts" :title="`${activeAlerts} active alert${activeAlerts > 1 ? 's' : ''}`"
              class="alert-badge">
          <i class="pi pi-bell"/>
          <span v-if="activeAlerts > 1" class="alert-count">{{ activeAlerts }}</span>
        </span>
        <span :class="signal.cls" :title="tooltipText" class="signal-badge">
          {{ signal.icon }}<span class="signal-score">({{ combinedScore > 0 ? '+' : '' }}{{ combinedScore }})</span>
        </span>
      </span>
      <span class="company text-muted">{{ item.companyName }}</span>
      <div class="group-tags compact-tags" @click.stop="emit('edit-groups', item)">
        <span v-for="g in item.groups || []" :key="g" class="group-tag">{{ g }}</span>
        <span class="group-tag add-tag">
          <i class="pi pi-plus"/><span v-if="!item.groups?.length"> Tag</span>
        </span>
      </div>
    </div>

    <div class="row-chart">
      <SparklineChart
          v-if="item.history?.length"
          :data="item.history"
      />
      <div v-if="item.history?.length" class="chart-range-labels text-muted">
        <span>{{ useTickerCurrency(rangeStartPrice, item.ticker) }}</span>
        <span>{{ useTickerCurrency(rangeEndPrice, item.ticker) }}</span>
      </div>
      <div v-if="activeExtended" :title="activeExtended.label" class="extended-combined">
        <span v-if="activeExtended.price" :class="activeExtended.label.startsWith('Pre') ? 'gold' : 'purple'"
              class="ext-price">{{
            useTickerCurrency(activeExtended.price, item.ticker)
          }}</span>
        <span class="ext-bottom">
<!--          <i class="pi pi-sun ext-icon"/>-->
          <span :class="activeExtended.percent >= 0 ? 'extended-gain' : 'extended-loss'"
                class="ext-val">{{ usePercent(activeExtended.percent) }}</span>
        </span>
      </div>
    </div>

    <div class="row-right">
      <span class="price-line">
        <span class="price">{{ useTickerCurrency(item.price, item.ticker) }}</span>
        <span v-if="marketDot" :class="marketDot.cls" :title="marketDot.title" class="market-dot"/>
      </span>
      <span v-if="isStaleQuote" class="badge badge-stale">No trade today</span>
      <span v-else :class="(rangeChangePercent ?? 0) >= 0 ? 'badge-gain' : 'badge-loss'" class="badge">
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

.watch-row:active {
  background: rgba(255, 255, 255, 0.03);
}

.row-left {
  display: flex;
  flex-direction: column;
  flex: 0 0 90px;
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

.company {
  font-size: 0.72rem;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 120px;
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
  padding: 2px 8px;
  border-radius: 5px;
  min-width: 64px;
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
  top: -3px;
  left: 110px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
  line-height: 1;
  border-radius: 5px;
  padding: 2px 5px;
  pointer-events: none;
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
