<script setup>
import {computed, onMounted, ref, watch} from 'vue'
import {useRouter} from 'vue-router'
import {useToast} from 'primevue/usetoast'
import {useStorage} from '@vueuse/core'
import {useWatchlistStore} from '@/stores/watchlist'
import {useChartRange} from '@/composables/useChartRange'
import {usePercent, useTickerCurrency} from '@/composables/useFormat'
import Button from 'primevue/button'
import AddWatchlistModal from '@/components/ui/AddWatchlistModal.vue'
import SparklineChart from '@/components/charts/SparklineChart.vue'

const router = useRouter()
const toast = useToast()
const watchlist = useWatchlistStore()
const range = useChartRange()
const showModal = ref(false)
const groupByMarket = useStorage('watchlist-group-market', false)

function marketOf(ticker) {
  return ticker.toUpperCase().endsWith('.TA') ? 'TASE' : 'US'
}

const grouped = computed(() => {
  if (!groupByMarket.value) return [{market: null, items: watchlist.items}]
  const map = {}
  for (const item of watchlist.items) {
    const m = marketOf(item.ticker)
    ;(map[m] ||= []).push(item)
  }
  return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([market, items]) => ({market, items}))
})

onMounted(() => watchlist.fetchWatchlist(range.value))
watch(range, (r) => watchlist.fetchWatchlist(r))

async function remove(item) {
  await watchlist.removeItem(item._id)
  toast.add({ severity: 'success', summary: 'Removed from watchlist', life: 2000 })
}
</script>

<template>
  <div class="watchlist safe-bottom">
    <header class="page-header">
      <h1 class="gradient-title">Watchlist</h1>
      <div class="header-actions">
        <button
            :class="{ active: groupByMarket }"
            class="market-btn"
            title="Group by market"
            @click="groupByMarket = !groupByMarket"
        >
          <i class="pi pi-globe"/>
        </button>
        <Button icon="pi pi-plus" label="Add" size="small" @click="showModal = true"/>
      </div>
    </header>

    <div v-if="watchlist.loading" class="skeleton-list">
      <div v-for="n in 5" :key="n" class="skeleton-row"/>
    </div>

    <div v-else-if="!watchlist.items.length" class="empty">
      <i class="pi pi-eye" />
      <p>Your watchlist is empty</p>
      <Button label="Add Stock" @click="showModal = true" />
    </div>

    <div v-else class="watch-list">
      <template v-for="group in grouped" :key="group.market">
        <div v-if="group.market" class="market-header">{{ group.market }}</div>
        <div
            v-for="item in group.items"
            :key="item._id"
            class="watch-row"
            @click="router.push(`/stock/${item.ticker}`)"
        >
          <!-- Left: ticker + company -->
          <div class="row-left">
            <span class="ticker">{{ item.ticker }}</span>
            <span class="company text-muted">{{ item.companyName }}</span>
          </div>

          <!-- Center: sparkline -->
          <div class="row-chart">
            <SparklineChart
                v-if="item.history?.length"
                :data="item.history"
                :pnlPercent="item.changePercent"
            />
          </div>

          <!-- Right: price + badge -->
          <div class="row-right">
            <span class="price">{{ useTickerCurrency(item.price, item.ticker) }}</span>
            <span
                :class="item.changePercent >= 0 ? 'badge-gain' : 'badge-loss'"
                class="badge"
            >
              {{ usePercent(item.changePercent) }}
            </span>
          </div>

          <!-- Remove button -->
          <button class="remove-btn" @click.stop="remove(item)">
            <i class="pi pi-times"/>
          </button>
        </div>
      </template>
    </div>

    <AddWatchlistModal v-model:visible="showModal" />
  </div>
</template>

<style scoped>
.watchlist { padding: 1rem; }

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.25rem;
}

.page-header h1 {
  font-size: 1.5rem;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.market-btn {
  background: none;
  border: 1px solid var(--border);
  color: var(--text-secondary);
  border-radius: 8px;
  padding: 5px 9px;
  cursor: pointer;
  font-size: 0.85rem;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}

.market-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.market-header {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-secondary);
  padding: 0.6rem 0.25rem 0.3rem;
  border-bottom: 1px solid var(--border);
}

/* ── Empty state ── */
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 4rem 1rem;
  color: var(--text-secondary);
}
.empty i { font-size: 3rem; }

/* ── Skeleton ── */
.skeleton-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.skeleton-row {
  height: 60px;
  background: linear-gradient(90deg, var(--bg-card) 25%, #1a1a1a 50%, var(--bg-card) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
  border-bottom: 1px solid var(--border);
}

@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}

/* ── List ── */
.watch-list {
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--border);
}

/* ── Row ── */
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

/* Left */
.row-left {
  display: flex;
  flex-direction: column;
  min-width: 90px;
  flex: 0 0 90px;
}

.ticker {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: 0.02em;
}

.company {
  font-size: 0.72rem;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 90px;
}

/* Sparkline */
.row-chart {
  flex: 1;
  min-width: 0;
  height: 40px;
}

/* Right */
.row-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  min-width: 76px;
  flex: 0 0 76px;
  gap: 4px;
}

.price {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-primary);
}

/* Badge */
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

/* Remove */
.remove-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 6px;
  margin-left: 2px;
  border-radius: 50%;
  line-height: 1;
  flex-shrink: 0;
  transition: color 0.15s;
}

.remove-btn:active {
  color: var(--red);
}

.remove-btn i {
  font-size: 0.7rem;
}
</style>
