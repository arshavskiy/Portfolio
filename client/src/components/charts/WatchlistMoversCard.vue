<script setup>
import {computed} from 'vue'
import {useRouter} from 'vue-router'

const props = defineProps({
  items: {type: Array, default: () => []},
  loading: {type: Boolean, default: false},
})

const router = useRouter()

const gainers = computed(() =>
  props.items
    .filter((item) => item?.ticker && item.changePercent != null && item.changePercent >= 0)
    .sort((a, b) => b.changePercent - a.changePercent)
    .slice(0, 5)
)

const losers = computed(() =>
  props.items
    .filter((item) => item?.ticker && item.changePercent != null && item.changePercent < 0)
    .sort((a, b) => a.changePercent - b.changePercent)
    .slice(0, 5)
)

const hasMovers = computed(() => gainers.value.length || losers.value.length)
const maxAbs = computed(() => Math.max(
  ...gainers.value.map((item) => Math.abs(item.changePercent)),
  ...losers.value.map((item) => Math.abs(item.changePercent)),
  1
))

function barStyle(item) {
  const height = `${Math.max(16, (Math.abs(item.changePercent) / maxAbs.value) * 86)}px`
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
  <section v-if="loading || hasMovers" class="movers-card">
    <div class="movers-head">
      <h2 class="card-title">Top Movers</h2>
      <span class="text-muted head-note">From your watchlist</span>
    </div>

    <div v-if="loading && !hasMovers" class="movers-chart skeleton-chart">
      <div v-for="n in 10" :key="n" class="mover-col skeleton"/>
    </div>

    <div v-else class="movers-chart">
      <div class="movers-row gainers-row">
        <button
            v-for="item in gainers"
            :key="item.ticker"
            class="mover-col"
            type="button"
            @click="openStock(item)"
        >
          <span class="pct-label pct-up">{{ pct(item.changePercent) }}</span>
          <div class="bar-wrap up">
            <div :style="barStyle(item)" class="bar"/>
          </div>
          <span class="ticker">{{ item.ticker }}</span>
        </button>
      </div>

      <div class="zero-line"/>

      <div class="movers-row losers-row">
        <button
            v-for="item in losers"
            :key="item.ticker"
            class="mover-col"
            type="button"
            @click="openStock(item)"
        >
          <span class="ticker">{{ item.ticker }}</span>
          <div class="bar-wrap down">
            <div :style="barStyle(item)" class="bar"/>
          </div>
          <span class="pct-label pct-down">{{ pct(item.changePercent) }}</span>
        </button>
      </div>
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

.movers-chart {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-height: 260px;
}

.movers-row {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.65rem;
  min-height: 118px;
}

.gainers-row {
  align-items: end;
}

.losers-row {
  align-items: start;
}

.zero-line {
  width: 100%;
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
  justify-content: flex-end;
  gap: 0.4rem;
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
  min-height: 82px;
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
  min-height: 118px;
  border-radius: 12px;
  background: linear-gradient(90deg, var(--bg-card) 25%, #1a1a1a 50%, var(--bg-card) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}

.skeleton-chart {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.65rem;
}

@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}
</style>
