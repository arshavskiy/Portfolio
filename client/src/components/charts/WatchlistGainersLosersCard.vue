<script setup>
import {computed, ref} from 'vue'
import {useNavigateToPosition} from '@/composables/useNavigateToPosition'
import SparklineChart from '@/components/charts/SparklineChart.vue'
import {usePercent, useTickerCurrency} from '@/composables/useFormat'
import {useI18n} from '@/composables/useI18n'

const props = defineProps({
  items: {type: Array, default: () => []},
  loading: {type: Boolean, default: false},
})

const {openPosition} = useNavigateToPosition()
const {t} = useI18n()
const mode = ref('gainers')

const rankedItems = computed(() => {
  const base = props.items.filter((item) =>
      item?.ticker &&
      typeof item.changePercent === 'number' &&
      Number.isFinite(item.changePercent)
  )
  if (mode.value === 'losers') {
    return [...base]
        .filter((item) => item.changePercent < 0)
        .sort((a, b) => a.changePercent - b.changePercent)
        .slice(0, 5)
  }

  return [...base]
      .filter((item) => item.changePercent >= 0)
      .sort((a, b) => b.changePercent - a.changePercent)
      .slice(0, 5)
})

function openStock(item) {
  openPosition(item.ticker, item.companyName)
}

function openWatchlist() {
  router.push('/watchlist')
}

function rangeStartPrice(item) {
  return item.history?.[0]?.close ?? null
}

function rangeEndPrice(item) {
  return item.history?.[item.history.length - 1]?.close ?? null
}
</script>

<template>
  <section v-if="loading || rankedItems.length" class="movers-card">
    <!--    <div class="movers-head">-->
    <!--      <h2 class="card-title">Top Movers</h2>-->
    <!--    </div>-->

    <div class="mode-tabs">
      <button
          :class="{active: mode === 'gainers'}"
          class="mode-tab"
          type="button"
          @click="mode = 'gainers'"
      >
        {{ t('dashboard.gainers') }}
      </button>
      <button
          :class="{active: mode === 'losers'}"
          class="mode-tab"
          type="button"
          @click="mode = 'losers'"
      >
        {{ t('dashboard.losers') }}
      </button>
    </div>

    <div v-if="loading && !rankedItems.length" class="movers-list">
      <div v-for="n in 5" :key="n" class="mover-row skeleton"/>
    </div>

    <div v-else-if="rankedItems.length" class="movers-list">
      <button
          v-for="item in rankedItems"
          :key="item.ticker"
          class="mover-row"
          type="button"
          @click="openStock(item)"
      >
        <div class="row-left">
          <span class="ticker">{{ item.ticker }}</span>
          <span class="company text-muted">{{ item.companyName || item.ticker }}</span>
        </div>

        <div class="row-chart">
          <SparklineChart v-if="item.history?.length" :data="item.history"/>
          <div class="chart-baseline"/>
          <div v-if="item.history?.length" class="chart-range-labels text-muted">
            <span>{{ useTickerCurrency(rangeStartPrice(item), item.ticker) }}</span>
            <span>{{ useTickerCurrency(rangeEndPrice(item), item.ticker) }}</span>
          </div>
        </div>

        <div class="row-right">
          <span class="price">{{ useTickerCurrency(item.price, item.ticker) }}</span>
          <span :class="item.changePercent >= 0 ? 'badge-gain' : 'badge-loss'" class="badge">
            {{ usePercent(item.changePercent) }}
          </span>
        </div>
        <i class="pi pi-chevron-right row-go"/>
      </button>
    </div>

    <div v-if="rankedItems.length" class="movers-foot">
      <button class="view-more" type="button" @click="openWatchlist">
        View more <i class="pi pi-arrow-right"/>
      </button>
    </div>
  </section>
</template>

<style scoped>
.movers-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 1rem;
  margin-bottom: 0.75rem;
}

.movers-head {
  margin-bottom: 0.9rem;
}

.card-title {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.mode-tabs {
  display: flex;
  gap: 0.55rem;
  margin-bottom: 0.9rem;
}

.mode-tab {
  border: 1px solid var(--border);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  border-radius: 5px;
  padding: 0.3rem;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}

.mode-tab.active {
  background: linear-gradient(180deg, rgba(99, 102, 241, 0.9), rgba(99, 102, 241, 0.65));
  border-color: rgba(129, 140, 248, 0.7);
  color: #f8fafc;
}

.movers-list {
  display: flex;
  flex-direction: column;
}

.mover-row {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(92px, 0.9fr) auto auto;
  gap: 0.75rem;
  align-items: center;
  padding: 0.85rem 0;
  border-top: 1px solid rgba(148, 163, 184, 0.08);
  border-left: none;
  border-right: none;
  border-bottom: none;
  background: none;
  color: inherit;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s;
}

.mover-row:first-child {
  border-top: none;
}

.mover-row:active {
  background: color-mix(in srgb, var(--text-primary) 4%, transparent);
}

.row-go {
  font-size: 0.66rem;
  color: var(--text-secondary);
  opacity: 0.5;
}

.row-left {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.18rem;
}

.ticker {
  font-size: 0.96rem;
  font-weight: 800;
  color: var(--text-primary);
}

.company {
  font-size: 0.74rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-chart {
  position: relative;
  min-width: 0;
  height: 40px;
}

.chart-baseline {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 5px;
  border-top: 2px dashed rgba(148, 163, 184, 0.35);
  pointer-events: none;
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
  gap: 0.3rem;
}

.price {
  font-size: 0.92rem;
  font-weight: 700;
  color: var(--text-primary);
}

.badge {
  min-width: 78px;
  border-radius: 8px;
  padding: 0.35rem 0.55rem;
  text-align: center;
  font-size: 0.8rem;
  font-weight: 800;
}

.badge-gain {
  background: rgba(74, 222, 128, 0.22);
  color: var(--green);
  border: 1px solid rgba(74, 222, 128, 0.34);
}

.badge-loss {
  background: rgba(248, 113, 113, 0.18);
  color: var(--red);
  border: 1px solid rgba(248, 113, 113, 0.28);
}

.movers-foot {
  display: flex;
  justify-content: flex-end;
  padding-top: 1rem;
}

.view-more {
  border: none;
  background: none;
  color: var(--accent);
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.skeleton {
  min-height: 62px;
  border-radius: 12px;
  background: linear-gradient(
      90deg,
      var(--bg-card) 25%,
      color-mix(in srgb, var(--text-primary) 7%, var(--bg-card)) 50%,
      var(--bg-card) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
  border-top: none;
}

@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}
</style>
