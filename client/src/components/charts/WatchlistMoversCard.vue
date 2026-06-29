<script setup>
import {computed} from 'vue'
import {useNavigateToPosition} from '@/composables/useNavigateToPosition'

const props = defineProps({
  items: {type: Array, default: () => []},
  loading: {type: Boolean, default: false},
})

const {openPosition} = useNavigateToPosition()

function moverChangePercent(item) {
  return typeof item?.changePercent === 'number' && Number.isFinite(item.changePercent)
      ? item.changePercent
      : null
}

const gainers = computed(() =>
  props.items
    .filter((item) => item?.ticker && moverChangePercent(item) != null && moverChangePercent(item) >= 0)
    .sort((a, b) => moverChangePercent(b) - moverChangePercent(a))
    .slice(0, 5)
)

const losers = computed(() =>
  props.items
    .filter((item) => item?.ticker && moverChangePercent(item) != null && moverChangePercent(item) < 0)
    .sort((a, b) => moverChangePercent(a) - moverChangePercent(b))
    .slice(0, 5)
)

const hasMovers = computed(() => gainers.value.length || losers.value.length)
const moverPairs = computed(() =>
  Array.from({length: 5}, (_, index) => ({
    gainer: gainers.value[index] || null,
    loser: losers.value[index] || null,
  }))
)
const maxGain = computed(() => Math.max(
  ...gainers.value.map((item) => Math.abs(moverChangePercent(item))),
  1
))

const maxLoss = computed(() => Math.max(
  ...losers.value.map((item) => Math.abs(moverChangePercent(item))),
  1
))

function barStyle(item) {
  const changePercent = moverChangePercent(item)
  const scale = changePercent >= 0 ? maxGain.value : maxLoss.value
  const height = `${Math.max(16, (Math.abs(changePercent) / scale) * 86)}px`
  return {
    height,
    background: changePercent >= 0
        ? 'linear-gradient(180deg, rgba(52, 211, 153, 0.95), rgba(16, 185, 129, 0.75))'
        : 'linear-gradient(180deg, rgba(248, 113, 113, 0.95), rgba(239, 68, 68, 0.78))',
    boxShadow: changePercent >= 0
        ? '0 0 16px rgba(16, 185, 129, 0.28)'
        : '0 0 16px rgba(239, 68, 68, 0.25)',
  }
}

function pct(value) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
}

function openStock(item) {
  openPosition(item.ticker, item.companyName)
}
</script>

<template>
  <section v-if="loading || hasMovers" class="movers-card">
    <div class="movers-head">
      <h2 class="card-title">Top Movers</h2>
      <RouterLink :to="{ name: 'Watchlist' }" class="text-muted head-note head-link">From your watchlist</RouterLink>
    </div>

    <div v-if="loading && !hasMovers" class="movers-chart skeleton-chart">
      <div v-for="n in 10" :key="n" class="mover-col skeleton"/>
    </div>

    <div v-else class="movers-chart">
      <div class="zero-line"/>
      <div class="movers-pairs">
        <div v-for="(pair, index) in moverPairs" :key="index" class="mover-pair">
          <button
              v-if="pair.gainer"
              class="mover-half mover-up"
              type="button"
              @click="openStock(pair.gainer)"
          >
            <span class="mover-label label-up">
              <span class="ticker">{{ pair.gainer.ticker }}</span>
              <span class="pct-label pct-up">{{ pct(moverChangePercent(pair.gainer)) }}</span>
            </span>
            <div :style="barStyle(pair.gainer)" class="bar"/>
          </button>
          <div v-else class="mover-half mover-up empty-half"/>

          <button
              v-if="pair.loser"
              class="mover-half mover-down"
              type="button"
              @click="openStock(pair.loser)"
          >
            <div :style="barStyle(pair.loser)" class="bar"/>
            <span class="mover-label label-down">
              <span class="ticker">{{ pair.loser.ticker }}</span>
              <span class="pct-label pct-down">{{ pct(moverChangePercent(pair.loser)) }}</span>
            </span>
          </button>
          <div v-else class="mover-half mover-down empty-half"/>
        </div>
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
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.head-note {
  font-size: 0.72rem;
}

.head-link {
  text-decoration: underline;
  text-underline-offset: 0.18em;
  cursor: pointer;
}

.head-link:hover {
  color: var(--accent);
}

.movers-chart {
  position: relative;
  min-height: 260px;
}

.movers-pairs {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.65rem;
  min-height: 260px;
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

.mover-pair {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 0;
}

.mover-half {
  width: 100%;
  min-height: 130px;
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

.mover-up {
  justify-content: flex-end;
  padding-bottom: 0;
}

.mover-down {
  justify-content: flex-start;
  padding-top: 0;
}

.empty-half {
  cursor: default;
}

.mover-label {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  min-height: 35px;
}

.label-up {
  margin-bottom: 0.15rem;
}

.label-down {
  margin-top: 0.15rem;
}

.pct-label {
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

.bar {
  width: min(10px, 100%);
  border-radius: 1px 1px 0 0;
}

.mover-down .bar {
  border-radius: 0 0 4px 4px;
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
