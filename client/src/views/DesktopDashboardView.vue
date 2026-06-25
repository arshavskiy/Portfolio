<script setup>
import {computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, ref, watch} from 'vue'
import {storeToRefs} from 'pinia'
import {useStorage} from '@vueuse/core'
import {useRouter} from 'vue-router'
import {useDashboardStore} from '@/stores/dashboard'
import {useWatchlistStore} from '@/stores/watchlist'
import {useAlertsStore} from '@/stores/alerts'
import {useChartRange} from '@/composables/useChartRange'
import {groupItems} from '@/composables/useGrouping'
import {useMomentumStore} from '@/stores/momentum'
import {useDesktopFocusStore} from '@/stores/desktopFocus'
import PositionDetailView from '@/views/PositionDetailView.vue'
import Button from 'primevue/button'
import WatchRow from '@/components/ui/WatchRow.vue'
import WatchlistSearch from '@/components/ui/WatchlistSearch.vue'
import RangeBar from '@/components/ui/RangeBar.vue'
import GroupModeBar from '@/components/ui/GroupModeBar.vue'
import GroupEditModal from '@/components/ui/GroupEditModal.vue'
import AddWatchlistModal from '@/components/ui/AddWatchlistModal.vue'
import ImportModal from '@/components/ui/ImportModal.vue'
import AppLoader from '@/components/ui/AppLoader.vue'

const BreakdownCard = defineAsyncComponent(() => import('@/components/charts/BreakdownCard.vue'))
const PortfolioHistoryChart = defineAsyncComponent(() => import('@/components/charts/PortfolioHistoryChart.vue'))
const PortfolioCompareChart = defineAsyncComponent(() => import('@/components/charts/PortfolioCompareChart.vue'))
const MarketsCard = defineAsyncComponent(() => import('@/components/charts/MarketsCard.vue'))
const WatchlistMoversCard = defineAsyncComponent(() => import('@/components/charts/WatchlistMoversCard.vue'))
const TopMomentumCard = defineAsyncComponent(() => import('@/components/charts/TopMomentumCard.vue'))
const TrendingCard = defineAsyncComponent(() => import('@/components/charts/TrendingCard.vue'))

// ── Dashboard store ──
const dashboard = useDashboardStore()
const {
  ready,
  portfolioPositions,
  portfolioCombinedUsd,
  watchlistMoversItems,
  watchlistMoversLoading,
  showTrending,
  showEmpty,
  history,
  historyLoading,
  historyRange,
} = storeToRefs(dashboard)

const HISTORY_RANGES = [
  {label: '1D', value: '1d'},
  {label: '1W', value: '1wk'},
  {label: '1M', value: '1mo'},
  {label: '3M', value: '3mo'},
  {label: '6M', value: '6mo'},
]

onMounted(async () => {
  try {
    await dashboard.initialize()
  } catch {
  }
  alerts.fetchAlerts()
  watchlist.fetchWatchlist(range.value).finally(() => restoreScrollPosition().catch(() => {
  }))
  marketTimer = setInterval(() => {
    now.value = new Date()
  }, 60000)
})

onUnmounted(() => {
  dashboard.stopClock()
  if (marketTimer) clearInterval(marketTimer)
})

// ── Watchlist store ──
const watchlist = useWatchlistStore()
const alerts = useAlertsStore()
const momentumStore = useMomentumStore()
const router = useRouter()
const range = useChartRange()
const desktopFocus = useDesktopFocusStore()

const searchQuery = ref('')
const groupMode = useStorage('watchlist-group-mode', 'market')
const changeDirection = useStorage('watchlist-change-direction', 'down')
const showModal = ref(false)
const showImportModal = ref(false)
const showGroupModal = ref(false)
const groupItem = ref(null)
const now = ref(new Date())
const rangeLoading = ref(false)
let marketTimer = null
let rangeRequestId = 0
const MIN_RANGE_LOADER_MS = 350
const RANGE_LABELS = {'1d': '1D', '5d': '5D', '1mo': '1M', '6mo': '6M', '1y': '1Y'}
const WATCHLIST_SCROLL_KEY = 'watchlist-scroll-top'
const WATCHLIST_TICKER_KEY = 'watchlist-opened-ticker'
const WATCHLIST_RETURN_KEY = 'watchlist-return-from-position'
const WATCHLIST_NAV_KEY = 'watchlist-filtered-tickers'

const filteredItems = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return watchlist.items
  return watchlist.items.filter((item) =>
      item.ticker.toLowerCase().includes(q) || item.companyName?.toLowerCase().includes(q)
  )
})

const grouped = computed(() => {
  void momentumStore.scores
  return groupItems(filteredItems.value, groupMode.value, now.value, changeDirection.value)
})

const initialLoading = computed(() => watchlist.loading && !watchlist.items.length)
const rangeLabel = computed(() => RANGE_LABELS[range.value] || range.value)

const cacheStatusText = computed(() => {
  const meta = watchlist.cacheMeta
  if (!meta?.savedAt) return ''
  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date(meta.savedAt))
  if (meta.stale) return `Offline cache from ${time}`
  if (meta.cached) return `Cached ${time}`
  return `Updated ${time}`
})

const visibleOrderedItems = computed(() => {
  const seen = new Set()
  const items = []
  for (const section of grouped.value) {
    for (const item of section.items) {
      const key = item.ticker.toUpperCase()
      if (seen.has(key)) continue
      seen.add(key)
      items.push(item)
    }
  }
  return items
})

function scrollContainer() {
  return document.querySelector('.watchlist-col') || document.scrollingElement || document.documentElement
}

function saveScrollPosition() {
  sessionStorage.setItem(WATCHLIST_SCROLL_KEY, String(scrollContainer().scrollTop || 0))
}

async function waitForLayout() {
  await nextTick()
  await new Promise((r) => setTimeout(r, 0))
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
}

async function restoreScrollPosition() {
  const shouldRestoreTicker = sessionStorage.getItem(WATCHLIST_RETURN_KEY) === '1'
  const ticker = sessionStorage.getItem(WATCHLIST_TICKER_KEY)
  const saved = sessionStorage.getItem(WATCHLIST_SCROLL_KEY)
  if ((!shouldRestoreTicker || ticker == null) && saved == null) return
  await waitForLayout()
  if (shouldRestoreTicker && ticker) {
    const row = [...document.querySelectorAll('[data-watchlist-ticker]')].find((el) => el.dataset.watchlistTicker === ticker)
    if (row) {
      const container = scrollContainer()
      const containerRect = container.getBoundingClientRect()
      const header = container.querySelector('.wl-sticky-header')
      const headerClearance = (header?.getBoundingClientRect().height || 0) + 16
      container.scrollTo({top: Math.max(row.getBoundingClientRect().top - containerRect.top + container.scrollTop - headerClearance, 0)})
      return
    }
  }
  scrollContainer().scrollTo({top: Number(saved) || 0})
}

function openStock(item) {
  desktopFocus.focus(item.ticker, item.companyName)
}

function openGroups(item) {
  groupItem.value = item
  showGroupModal.value = true
}

function onImported() {
  watchlist.fetchWatchlist(range.value, {force: true})
}

function onGroupsSaved() {
  watchlist.fetchWatchlist(range.value, {force: true})
}

watch(range, async (r) => {
  const requestId = ++rangeRequestId
  const startedAt = Date.now()
  rangeLoading.value = true
  try {
    await watchlist.fetchWatchlist(r)
  } finally {
    const remaining = MIN_RANGE_LOADER_MS - (Date.now() - startedAt)
    if (remaining > 0) await new Promise((r) => setTimeout(r, remaining))
    if (requestId === rangeRequestId) rangeLoading.value = false
  }
})
</script>

<template>
  <div class="desktop-dashboard">

    <!-- LEFT: Dashboard content -->
    <div class="dashboard-col">
      <div v-if="!ready" class="dash-loader">
        <div v-for="n in 5" :key="n" class="dash-skeleton"/>
      </div>

      <template v-else>
        <MarketsCard/>
        <WatchlistMoversCard :items="watchlistMoversItems" :loading="watchlistMoversLoading"/>
        <TopMomentumCard :items="watchlistMoversItems" :loading="watchlistMoversLoading"/>
        <BreakdownCard :combined-usd="portfolioCombinedUsd" :positions="portfolioPositions"/>
        <TrendingCard v-if="showTrending"/>

        <section v-if="portfolioPositions.length" class="history-card">
          <div class="history-head">
            <h2 class="section-title gradient-title">Portfolio Value</h2>
            <div class="toggle-group">
              <button
                  v-for="opt in HISTORY_RANGES"
                  :key="opt.value"
                  :class="{active: historyRange === opt.value}"
                  class="toggle-btn"
                  @click="dashboard.setHistoryRange(opt.value)"
              >{{ opt.label }}
              </button>
            </div>
          </div>
          <PortfolioHistoryChart
              :key="historyRange"
              :data="history"
              :day-pnl="portfolioCombinedUsd?.dayPnl"
              :loading="historyLoading"
              :range="historyRange"
          />
        </section>

        <PortfolioCompareChart :positions="portfolioPositions" :range="historyRange"/>

        <div v-if="showEmpty" class="empty text-muted">
          No holdings yet. Add a transaction to get started, or explore what's trending.
        </div>
      </template>
    </div>

    <!-- MIDDLE: Full position page rendered inline -->
    <div class="position-col">
      <div v-if="!desktopFocus.ticker" class="position-empty">
        <i class="pi pi-chart-line"/>
        <p>Click a watchlist or holdings item to view its position</p>
      </div>
      <PositionDetailView
          v-else
          :key="desktopFocus.ticker"
          :ticker-override="desktopFocus.ticker"
          :panel-mode="true"
      />
    </div>

    <!-- RIGHT: Watchlist -->
    <div class="watchlist-col">
      <div class="wl-sticky-header">
        <div class="wl-header-row">
          <h2 class="gradient-title wl-title">Watchlist</h2>
          <div class="wl-actions">
            <Button
                v-tooltip.bottom="'Import from file'"
                icon="pi pi-upload"
                size="small"
                text
                @click="showImportModal = true"
            />
            <Button label="Add" outlined size="small" @click="showModal = true"/>
          </div>
        </div>
        <WatchlistSearch v-model="searchQuery"/>
        <RangeBar class="wl-range"/>
        <div v-if="rangeLoading" class="range-loading-indicator">
          <AppLoader/>
          <span>Loading {{ rangeLabel }} data</span>
        </div>
        <GroupModeBar v-model="groupMode" v-model:change-direction="changeDirection" class="wl-group-mode"/>
        <div v-if="cacheStatusText" :class="{stale: watchlist.cacheMeta?.stale}" class="cache-status">
          <i :class="watchlist.cacheMeta?.stale ? 'pi pi-wifi-slash' : (watchlist.cacheMeta?.cached ? 'pi pi-database' : 'pi pi-sync')"/>
          <span>{{ cacheStatusText }}</span>
        </div>
      </div>

      <div v-if="initialLoading" class="page-loader">
        <AppLoader/>
      </div>
      <div v-else-if="!watchlist.items.length" class="empty">
        <i class="pi pi-eye"/>
        <p>Your watchlist is empty</p>
        <Button label="Add Stock" @click="showModal = true"/>
      </div>
      <div v-else-if="!filteredItems.length" class="empty">
        <i class="pi pi-search"/>
        <p>No matches</p>
      </div>
      <div v-else class="watch-list" :class="{loading: rangeLoading}">
        <template v-for="section in grouped" :key="section.group ?? '_all'">
          <div v-if="section.group" class="market-header">{{ section.group }}</div>
          <WatchRow
              v-for="item in section.items"
              :key="`${section.group ?? ''}-${item._id}`"
              :data-watchlist-ticker="item.ticker"
              :item="item"
              @edit-groups="openGroups"
              @open-stock="openStock"
          />
        </template>
      </div>
    </div>

    <AddWatchlistModal v-model:visible="showModal"/>
    <ImportModal v-model:visible="showImportModal" mode="watchlist" @imported="onImported"/>
    <GroupEditModal
        v-model:visible="showGroupModal"
        :item="groupItem"
        mode="watchlist"
        @saved="onGroupsSaved"
    />
  </div>
</template>

<style scoped>
.desktop-dashboard {
  display: flex;
  height: 100%;
  overflow: hidden;
}

/* LEFT column — dashboard */
.dashboard-col {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 1.25rem 1.25rem 2rem;
  border-right: 1px solid var(--border);
}

.position-empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  color: var(--text-secondary);
  font-size: 0.85rem;
  text-align: center;
  padding: 2rem;
}
.position-empty i { font-size: 2.5rem; opacity: 0.2; }

/* MIDDLE column — position panel */
.position-col {
  width: 360px;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* RIGHT column — watchlist */
.watchlist-col {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

@media (min-width: 1024px) {
  .position-col {
    width: calc(100% - 900px);
  }

  .watchlist-col {
    width: 360px;
  }

  .dashboard-col {
    width: 500px;
    flex: none;
  }
}

@media (min-width: 1800px) {
  .watchlist-col {
    width: 400px;
  }
}

.wl-sticky-header {
  position: sticky;
  top: 0;
  z-index: 5;
  background: var(--bg-primary);
  padding: 1rem 1rem 0.5rem;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.wl-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.6rem;
}

.wl-title {
  font-size: 1.15rem;
  margin: 0;
}

.wl-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.wl-range {
  margin-bottom: 0.25rem;
}

.wl-group-mode {
  margin-bottom: 0.25rem;
}

.watch-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 0.75rem;
}

.watch-list.loading {
  opacity: 0.5;
  pointer-events: none;
}

.page-loader {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 3rem 1rem;
  color: var(--text-secondary);
}

.empty i {
  font-size: 2.5rem;
}

.market-header {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: transparent;
  background: linear-gradient(90deg, var(--neon-blue), #7dd3fc 45%, var(--neon-green));
  -webkit-background-clip: text;
  background-clip: text;
  padding: 0.6rem 0.25rem 0.3rem;
  border-bottom: 1px solid rgba(0, 207, 255, 0.18);
  margin-bottom: 0.25rem;
}

.cache-status {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.68rem;
  color: var(--text-secondary);
  padding: 0.2rem 0;
}

.cache-status.stale {
  color: var(--color-warning, #f59e0b);
}

.range-loading-indicator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: var(--text-secondary);
  padding: 0.25rem 0;
}

/* Dashboard left col styles */
.dash-loader {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: 0.5rem;
}

.dash-skeleton {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  height: 120px;
  background: linear-gradient(90deg, var(--bg-card) 25%, rgba(255, 255, 255, 0.04) 50%, var(--bg-card) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}

.dash-skeleton:first-child {
  height: 80px;
}

.dash-skeleton:nth-child(2) {
  height: 160px;
}

.dash-skeleton:nth-child(3) {
  height: 100px;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.history-card {
  margin-bottom: 1.75rem;
}

.history-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
  padding: 0 0.25rem;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.section-title {
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-secondary);
  margin: 0;
}

.toggle-group {
  display: flex;
  gap: 0.25rem;
  flex-wrap: wrap;
}

.toggle-btn {
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}

.toggle-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.empty.text-muted {
  padding: 2rem 0;
  font-size: 0.9rem;
  text-align: center;
}
</style>
