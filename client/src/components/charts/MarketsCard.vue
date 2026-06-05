<script setup>
import {onMounted, ref} from 'vue'
import {useRouter} from 'vue-router'
import {useStorage} from '@vueuse/core'
import api from '@/composables/useApi'
import SparklineChart from '@/components/charts/SparklineChart.vue'

const router = useRouter()
const groups = ref(['US'])
const group = useStorage('dashboard-markets-group', 'US')
const indices = ref([])
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    const data = await api.get(`/stocks/markets?group=${encodeURIComponent(group.value)}`)
    indices.value = data.indices || []
    if (data.groups?.length) groups.value = data.groups
  } catch {
    indices.value = []
  } finally {
    loading.value = false
  }
}

function selectGroup(g) {
  if (g === group.value) return
  group.value = g
  load()
}

function openIndex(idx) {
  router.push(`/stock/${encodeURIComponent(idx.symbol)}`)
}

function fmt(n) {
  if (n == null) return '—'
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function pct(n) {
  if (n == null) return ''
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}

onMounted(load)
</script>

<template>
  <section class="markets-card">
    <div class="markets-head">
      <h2 class="card-title">Global Markets</h2>
      <div class="market-tabs">
        <button
          v-for="g in groups"
          :key="g"
          class="market-tab"
          :class="{ active: group === g }"
          @click="selectGroup(g)"
        >{{ g }}</button>
      </div>
    </div>

    <div v-if="loading && !indices.length" class="markets-grid">
      <div v-for="n in 6" :key="n" class="index-tile skeleton" />
    </div>

    <div v-else class="markets-grid">
      <div v-for="idx in indices" :key="idx.symbol" class="index-tile" @click="openIndex(idx)">
        <div class="idx-name">{{ idx.name }}</div>
        <div class="idx-price">{{ fmt(idx.price) }}</div>
        <div class="idx-spark">
          <SparklineChart
            v-if="idx.history?.length"
            :data="idx.history"
            :pnl-percent="idx.changePercent || 0"
          />
        </div>
        <div class="idx-change" :class="(idx.changePercent ?? 0) >= 0 ? 'up' : 'down'">
          {{ idx.change >= 0 ? '+' : '' }}{{ fmt(idx.change) }} ({{ pct(idx.changePercent) }})
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.markets-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 0.9rem 1rem;
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

.markets-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  /* gap: 0.5rem; */
}
@media (min-width: 640px) {
  .markets-grid { grid-template-columns: repeat(4, 1fr); }
}

.index-tile {
  padding: 0.3rem 0.3rem;
  min-height: 108px;
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
.idx-price { font-size: 0.95rem; font-weight: 600; }
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
