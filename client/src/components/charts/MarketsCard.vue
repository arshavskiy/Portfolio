<script setup>
import {computed, onMounted, onUnmounted, ref, watch} from 'vue'
import {storeToRefs} from 'pinia'
import {useRouter} from 'vue-router'
import {useStorage} from '@vueuse/core'
import {getMarketHoursState, MARKET_HOURS_BY_GROUP} from '@/composables/useMarketHours'
import {useMarketDataStore} from '@/stores/marketData'
import SparklineChart from '@/components/charts/SparklineChart.vue'

const router = useRouter()
const marketData = useMarketDataStore()
const {marketGroups, marketsByGroup, marketLoadingByGroup} = storeToRefs(marketData)
const group = useStorage('dashboard-markets-group', 'US')
const now = ref(new Date())
let timer = null

const groups = computed(() => marketGroups.value)
const indices = computed(() => marketsByGroup.value[group.value] || [])
const loading = computed(() => Boolean(marketLoadingByGroup.value[group.value]))

function selectGroup(g) {
  if (g === group.value) return
  group.value = g
}

function openIndex(idx) {
  router.push(`/stock/${encodeURIComponent(idx.symbol)}`)
}

function fmt(n) {
  if (n == null) return '—'
  return n.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})
}

function pct(n) {
  if (n == null) return ''
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}

const activeMarketMeta = computed(() => {
  const market = MARKET_HOURS_BY_GROUP[group.value]
  return market ? getMarketHoursState(market, now.value) : null
})

onMounted(() => {
  marketData.fetchMarkets(group.value).catch(() => {})
  timer = setInterval(() => {
    now.value = new Date()
  }, 60000)
})

watch(group, (nextGroup) => {
  marketData.fetchMarkets(nextGroup).catch(() => {})
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <section class="markets-card">
    <div class="markets-head">
      <div class="markets-topline">
        <div class="market-tabs">
          <button
              v-for="g in groups"
              :key="g"
              :class="{ active: group === g }"
              class="market-tab"
              @click="selectGroup(g)"
          >{{ g }}
          </button>
        </div>
        <div v-if="activeMarketMeta" class="market-meta">
          <span :class="activeMarketMeta.isOpen ? 'meta-open' : 'meta-closed'" class="meta-status">
            {{ activeMarketMeta.isOpen ? 'Open' : 'Closed' }}
          </span>
          <span class="text-muted">{{ activeMarketMeta.nextLabel }}</span>
          <span class="session">{{ activeMarketMeta.sessionLabel }}</span>
        </div>
      </div>
    </div>

    <div v-if="loading && !indices.length" class="markets-grid">
      <div v-for="n in 6" :key="n" class="index-tile skeleton"/>
    </div>

    <div v-else class="markets-grid">
      <div v-for="idx in indices" :key="idx.symbol" class="index-tile" @click="openIndex(idx)">
        <div class="idx-name">{{ idx.name }}</div>
        <div class="idx-spark">
          <SparklineChart
              v-if="idx.history?.length"
              :data="idx.history"
              :pnl-percent="idx.changePercent || 0"
          />
        </div>
        <div class="idx-price">{{ fmt(idx.price) }}</div>
        <div :class="(idx.changePercent ?? 0) >= 0 ? 'up' : 'down'" class="idx-change">
          {{ idx.change >= 0 ? '+' : '' }}{{ fmt(idx.changePercent) }}
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.markets-card {
  background: var(--bg-card);
  padding: 0.9rem 1rem;
  padding-left: 0;
  margin-bottom: 0.75rem;

}
.markets-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.card-title {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-secondary);
  margin: 0;
}

.markets-topline {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  width: 100%;
  flex-wrap: wrap;
}
.market-tabs { display: flex; gap: 2px; }
.market-tab {
  background: none;
  border: none;
  color: var(--text-secondary);
  border-radius: 6px;
  padding: 4px 9px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.market-tab.active { background: var(--accent); color: #fff; }

.market-meta {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  flex-wrap: wrap;
  font-size: 0.68rem;
}

.meta-status {
  font-weight: 700;
}

.meta-open {
  color: var(--neon-green);
}

.meta-closed {
  color: var(--neon-red);
}

.session {
  color: #93c5fd;
}

.markets-grid {
  display: flex;
  overflow-x: scroll;
  scrollbar-width: thin;
  scrollbar-color: rgba(148, 163, 184, 0.35) transparent;
  padding-bottom: 10px;
}

.markets-grid::-webkit-scrollbar {
  height: 3px;
}

.markets-grid::-webkit-scrollbar-track {
  background: transparent;
}

.markets-grid::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.35);
  border-radius: 999px;
}

.index-tile {
  padding: 0.3rem 0.3rem;
  min-width: 90px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  cursor: pointer;
  border-radius: 8px;
  transition: background 0.15s;
}
.index-tile:hover { background: rgba(255, 255, 255, 0.03); }
.index-tile:active { background: rgba(255, 255, 255, 0.06); }
.idx-name { font-size: 0.78rem; font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.idx-price {
  font-size: 0.85rem;
}
.idx-spark { height: 40px; margin: 1px 0; overflow: hidden; }
.idx-change { font-size: 0.72rem; font-weight: 600; }
.idx-change.up { color: var(--neon-green); }
.idx-change.down { color: var(--neon-red); }

.skeleton {
  background: linear-gradient(90deg, var(--bg-card) 25%, #1a1a1a 50%, var(--bg-card) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}
@keyframes shimmer { to { background-position: -200% 0; } }
</style>
