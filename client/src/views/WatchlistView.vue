<script setup>
import {computed, onMounted, ref, watch} from 'vue'
import {useToast} from 'primevue/usetoast'
import {useStorage} from '@vueuse/core'
import {useWatchlistStore} from '@/stores/watchlist'
import {useChartRange} from '@/composables/useChartRange'
import Button from 'primevue/button'
import AddWatchlistModal from '@/components/ui/AddWatchlistModal.vue'
import WatchRow from '@/components/ui/WatchRow.vue'
import PageSettings from '@/components/ui/PageSettings.vue'
import SettingsRow from '@/components/ui/SettingsRow.vue'

const toast = useToast()
const watchlist = useWatchlistStore()
const range = useChartRange()
const showModal = ref(false)
const groupByMarket = useStorage('watchlist-group-market', false)

const RANGE_OPTIONS = [
  {label: '1W', value: '1wk'},
  {label: '1M', value: '1mo'},
]

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
        <Button icon="pi pi-plus" label="Add" size="small" @click="showModal = true"/>
        <PageSettings>
          <SettingsRow icon="pi pi-chart-line" label="Chart range">
            <div class="toggle-group">
              <button
                  v-for="opt in RANGE_OPTIONS"
                  :key="opt.value"
                  :class="{ active: range === opt.value }"
                  class="toggle-btn"
                  @click="range = opt.value"
              >{{ opt.label }}
              </button>
            </div>
          </SettingsRow>
          <SettingsRow icon="pi pi-globe" label="Group by market">
            <button
                :class="{ active: groupByMarket }"
                class="toggle-btn"
                @click="groupByMarket = !groupByMarket"
            >{{ groupByMarket ? 'On' : 'Off' }}
            </button>
          </SettingsRow>
        </PageSettings>
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
        <WatchRow
            v-for="item in group.items"
            :key="item._id"
            :item="item"
            @remove="remove"
        />
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

.market-header {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-secondary);
  padding: 0.6rem 0.25rem 0.3rem;
  border-bottom: 1px solid var(--border);
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 4rem 1rem;
  color: var(--text-secondary);
}
.empty i { font-size: 3rem; }

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

.watch-list {
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--border);
}

.toggle-group {
  display: flex;
  gap: 0.25rem;
}

.toggle-btn {
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}

.toggle-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
</style>
