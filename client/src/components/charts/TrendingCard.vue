<script setup>
import {computed, onMounted, watch} from 'vue'
import {storeToRefs} from 'pinia'
import { useRouter } from 'vue-router'
import { useStorage } from '@vueuse/core'
import {useMarketDataStore} from '@/stores/marketData'
import SparklineChart from '@/components/charts/SparklineChart.vue'

const router = useRouter()
const marketData = useMarketDataStore()
const {trendingGroups, trendingByGroup, trendingLoadingByGroup} = storeToRefs(marketData)
const group = useStorage('dashboard-trending-group', 'US')
const groups = computed(() => trendingGroups.value)
const items = computed(() => trendingByGroup.value[group.value] || [])
const loading = computed(() => Boolean(trendingLoadingByGroup.value[group.value]))

function selectGroup(g) {
  if (g === group.value) return
  group.value = g
}

function openItem(it) {
  router.push(`/position/${encodeURIComponent(it.symbol)}`)
}

function fmt(n) {
  if (n == null) return '—'
  if (Math.abs(n) >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (Math.abs(n) < 1) return n.toLocaleString('en-US', { maximumFractionDigits: 4 })
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function pct(n) {
  if (n == null) return ''
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}

onMounted(() => {
  marketData.fetchTrending(group.value).catch(() => {})
})

watch(group, (nextGroup) => {
  marketData.fetchTrending(nextGroup).catch(() => {})
})
</script>

<template>
  <section v-if="loading || items.length" class="trending-card">
    <div class="trending-head">
      <h2 class="card-title"><i class="pi pi-bolt" /> Trending</h2>
      <div class="trend-tabs">
        <button
          v-for="g in groups"
          :key="g"
          class="trend-tab"
          :class="{ active: group === g }"
          @click="selectGroup(g)"
        >{{ g }}</button>
      </div>
    </div>

    <div v-if="loading && !items.length" class="t-list">
      <div v-for="n in 5" :key="n" class="t-row skeleton" />
    </div>

    <div v-else class="t-list">
      <div v-for="it in items" :key="it.symbol" class="t-row" @click="openItem(it)">
        <div class="t-left">
          <span class="t-symbol">{{ it.symbol }}</span>
          <span class="t-name text-muted">{{ it.name }}</span>
        </div>
        <div class="t-spark">
          <SparklineChart v-if="it.history?.length" :data="it.history" :pnl-percent="it.changePercent || 0" />
        </div>
        <div class="t-right">
          <span class="t-price">{{ fmt(it.price) }}</span>
          <span class="t-change" :class="(it.changePercent ?? 0) >= 0 ? 'up' : 'down'">{{ pct(it.changePercent) }}</span>
        </div>
        <i class="pi pi-chevron-right t-go" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.trending-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 0.9rem 1rem;
  margin-bottom: 0.75rem;
}
.trending-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.6rem;
  gap: 0.5rem;
}
.card-title {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-secondary);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.card-title i { color: var(--accent); font-size: 0.8rem; }

.trend-tabs { display: flex; gap: 2px; }
.trend-tab {
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
.trend-tab.active { background: var(--accent); color: #fff; }

.t-list { display: flex; flex-direction: column; }
.t-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 0.25rem;
  border-top: 1px solid var(--border);
  cursor: pointer;
  transition: background 0.15s;
}
.t-row:first-child { border-top: none; }
.t-row:active { background: rgba(255,255,255,0.03); }

.t-left { display: flex; flex-direction: column; min-width: 84px; flex: 0 0 84px; }
.t-symbol { font-size: 0.85rem; font-weight: 800; color: var(--text-primary); }
.t-name { font-size: 0.65rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 84px; }

.t-spark { flex: 1; min-width: 0; height: 30px; }

.t-right { display: flex; flex-direction: column; align-items: flex-end; min-width: 74px; flex: 0 0 74px; }
.t-price { font-size: 0.85rem; font-weight: 700; }
.t-change { font-size: 0.72rem; font-weight: 600; }
.t-change.up { color: var(--neon-green); }
.t-change.down { color: var(--neon-red); }
.t-go { font-size: 0.62rem; color: var(--text-secondary); opacity: 0.5; flex: 0 0 auto; }

.t-row.skeleton {
  height: 44px;
  background: linear-gradient(90deg, var(--bg-card) 25%, #1a1a1a 50%, var(--bg-card) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}
@keyframes shimmer { to { background-position: -200% 0; } }
</style>
