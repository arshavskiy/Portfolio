<script setup>
import {computed} from 'vue'
import {useRouter} from 'vue-router'

const props = defineProps({
  items: {type: Array, default: () => []},
  loading: {type: Boolean, default: false},
})

const router = useRouter()

const movers = computed(() => {
  const source = props.items
      .filter((item) => item?.ticker && item.changePercent != null)
      .sort((a, b) => b.changePercent - a.changePercent)

  const gainers = source.filter((item) => item.changePercent >= 0).slice(0, 4)
  const loser = [...source].reverse().find((item) => item.changePercent < 0)
  const merged = loser ? [...gainers, loser] : gainers

  return merged
      .filter((item, index, arr) => arr.findIndex((entry) => entry.ticker === item.ticker) === index)
      .slice(0, 5)
})

const maxAbs = computed(() => Math.max(...movers.value.map((item) => Math.abs(item.changePercent)), 1))

function barStyle(item) {
  const height = `${Math.max(18, (Math.abs(item.changePercent) / maxAbs.value) * 92)}px`
  return {
    height,
    background: item.changePercent >= 0
        ? 'linear-gradient(180deg, rgba(52, 211, 153, 0.95), rgba(16, 185, 129, 0.75))'
        : 'linear-gradient(180deg, rgba(248, 113, 113, 0.95), rgba(239, 68, 68, 0.78))',
    boxShadow: item.changePercent >= 0
        ? '0 0 16px rgba(16, 185, 129, 0.28)'
        : '0 0 16px rgba(239, 68, 68, 0.25)',
  }
}

function pct(value) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
}

function openStock(item) {
  router.push(`/stock/${encodeURIComponent(item.ticker)}`)
}
</script>

<template>
  <section v-if="loading || movers.length" class="movers-card">
    <div class="movers-head">
      <h2 class="card-title">Watchlist Top Movers</h2>
      <span class="text-muted head-note">From your watchlist</span>
    </div>

    <div v-if="loading && !movers.length" class="movers-grid">
      <div v-for="n in 5" :key="n" class="mover-col skeleton"/>
    </div>

    <div v-else class="movers-grid">
      <div class="zero-line"/>
      <button
          v-for="item in movers"
          :key="item.ticker"
          class="mover-col"
          type="button"
          @click="openStock(item)"
      >
        <span :class="item.changePercent >= 0 ? 'pct-up' : 'pct-down'" class="pct-label">
          {{ pct(item.changePercent) }}
        </span>

        <div :class="item.changePercent >= 0 ? 'bar-wrap up' : 'bar-wrap down'" class="bar-wrap">
          <div :style="barStyle(item)" class="bar"/>
        </div>

        <span class="ticker">{{ item.ticker }}</span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.movers-card {
  position: relative;
  overflow: hidden;
  background: radial-gradient(circle at top center, rgba(34, 211, 238, 0.08), transparent 28%),
  linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(15, 23, 42, 0.22)),
  var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 0.9rem 1rem 1rem;
  margin-bottom: 0.75rem;
}

.movers-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.85rem;
}

.card-title {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #e2e8f0;
}

.head-note {
  font-size: 0.72rem;
}

.movers-grid {
  position: relative;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.65rem;
  min-height: 140px;
  align-items: stretch;
}

.zero-line {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 1px;
  background: rgba(148, 163, 184, 0.24);
  pointer-events: none;
}

.mover-col {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  gap: 0.55rem;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  cursor: pointer;
}

.pct-label {
  min-height: 18px;
  font-size: 0.82rem;
  font-weight: 700;
  text-shadow: 0 0 10px rgba(15, 23, 42, 0.6);
}

.pct-up {
  color: #34d399;
}

.pct-down {
  color: #f87171;
}

.bar-wrap {
  position: relative;
  width: 100%;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.bar-wrap.up {
  align-items: flex-end;
}

.bar-wrap.down {
  align-items: flex-start;
}

.bar {
  width: min(18px, 100%);
  border-radius: 4px;
}

.ticker {
  font-size: 0.8rem;
  font-weight: 700;
  color: #f8fafc;
  letter-spacing: 0.02em;
}

.skeleton {
  min-height: 220px;
  border-radius: 12px;
  background: linear-gradient(90deg, var(--bg-card) 25%, #1a1a1a 50%, var(--bg-card) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}

@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}
</style>
