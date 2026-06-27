<script setup>
import {computed, nextTick, onMounted, onUnmounted, ref, watch} from 'vue'
import {useStorage} from '@vueuse/core'
import {onBeforeRouteLeave, useRouter} from 'vue-router'
import {useWatchlistStore} from '@/stores/watchlist'
import {useAlertsStore} from '@/stores/alerts'
import {useChartRange} from '@/composables/useChartRange'
import {groupItems} from '@/composables/useGrouping'
import {useMomentumStore} from '@/stores/momentum'
import {useBreakpoint} from '@/composables/useBreakpoint'
import {useDesktopFocusStore} from '@/stores/desktopFocus'
import {exportWatchlistCsv} from '@/composables/useImport'
import Button from 'primevue/button'
import AddWatchlistModal from '@/components/ui/AddWatchlistModal.vue'
import ImportModal from '@/components/ui/ImportModal.vue'
import WatchRow from '@/components/ui/WatchRow.vue'
import WatchlistSearch from '@/components/ui/WatchlistSearch.vue'
import RangeBar from '@/components/ui/RangeBar.vue'
import GroupModeBar from '@/components/ui/GroupModeBar.vue'
import GroupEditModal from '@/components/ui/GroupEditModal.vue'
import AppLoader from '@/components/ui/AppLoader.vue'

const watchlist = useWatchlistStore()
const alerts = useAlertsStore()
const momentumStore = useMomentumStore()
const router = useRouter()
const {isDesktop} = useBreakpoint()
const desktopFocus = useDesktopFocusStore()
const range = useChartRange()
const showModal = ref(false)
const showImportModal = ref(false)
const showGroupModal = ref(false)
const groupItem = ref(null)
const groupMode = useStorage('watchlist-group-mode', 'market')
const changeDirection = useStorage('watchlist-change-direction', 'down')
const searchQuery = ref('')
const now = ref(new Date())
const rangeLoading = ref(false)
let marketTimer = null
let rangeRequestId = 0
const WATCHLIST_SCROLL_KEY = 'watchlist-scroll-top'
const WATCHLIST_TICKER_KEY = 'watchlist-opened-ticker'
const WATCHLIST_RETURN_KEY = 'watchlist-return-from-position'
const WATCHLIST_NAV_KEY = 'watchlist-filtered-tickers'
const MIN_RANGE_LOADER_MS = 350
const RANGE_LABELS = {
  '1d': '1D',
  '5d': '5D',
  '1mo': '1M',
  '6mo': '6M',
  '1y': '1Y',
}

function onImported() {
  watchlist.fetchWatchlist(range.value, {force: true})
}

function exportCsv() {
  const tickers = watchlist.items.map((i) => i.ticker).filter(Boolean)
  if (tickers.length) exportWatchlistCsv(tickers)
}

const filteredItems = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return watchlist.items
  return watchlist.items.filter((item) =>
      item.ticker.toLowerCase().includes(q) || item.companyName?.toLowerCase().includes(q)
  )
})

// Reference momentumStore.scores so grouped re-sorts when wave votes arrive
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
    hour12: false,
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
  return document.querySelector('.main-content') || document.scrollingElement || document.documentElement
}

function saveScrollPosition() {
  sessionStorage.setItem(WATCHLIST_SCROLL_KEY, String(scrollContainer().scrollTop || 0))
}

function scrollToTop(top) {
  scrollContainer().scrollTo({top, behavior: 'auto'})
}

async function waitForLayout() {
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
}

async function restoreScrollPosition() {
  const shouldRestoreTicker = sessionStorage.getItem(WATCHLIST_RETURN_KEY) === '1'
  const ticker = sessionStorage.getItem(WATCHLIST_TICKER_KEY)
  const saved = sessionStorage.getItem(WATCHLIST_SCROLL_KEY)
  if ((!shouldRestoreTicker || ticker == null) && saved == null) return
  await waitForLayout()

  if (shouldRestoreTicker && ticker) {
    const row = [...document.querySelectorAll('[data-watchlist-ticker]')]
        .find((el) => el.dataset.watchlistTicker === ticker)
    if (row) {
      const container = scrollContainer()
      const containerRect = container.getBoundingClientRect()
      // Clear the sticky header (it now overlays scrolled content) plus a
      // little breathing room, instead of a fixed guess at its height.
      const header = container.querySelector('.watchlist > header')
      const headerClearance = (header?.getBoundingClientRect().height || 0) + 16
      const top = Math.max(row.getBoundingClientRect().top - containerRect.top + container.scrollTop - headerClearance, 0)
      scrollToTop(top)
      return
    }
  }

  scrollToTop(Number(saved) || 0)
}

function openStock(item) {
  if (isDesktop.value) {
    desktopFocus.focus(item.ticker, item.companyName)
    return
  }
  saveScrollPosition()
  sessionStorage.setItem(WATCHLIST_TICKER_KEY, item.ticker)
  sessionStorage.setItem(WATCHLIST_RETURN_KEY, '1')
  sessionStorage.setItem(WATCHLIST_NAV_KEY, JSON.stringify(visibleOrderedItems.value.map((it) => it.ticker)))
  router.push(`/position/${encodeURIComponent(item.ticker)}`)
}

onMounted(() => {
  alerts.fetchAlerts()
  watchlist.fetchWatchlist(range.value).finally(() => {
    restoreScrollPosition().catch(() => {
    })
  })
  marketTimer = setInterval(() => {
    now.value = new Date()
  }, 60000)
})
watch(range, async (r) => {
  const requestId = ++rangeRequestId
  const startedAt = Date.now()
  rangeLoading.value = true
  try {
    await watchlist.fetchWatchlist(r)
  } finally {
    const remaining = MIN_RANGE_LOADER_MS - (Date.now() - startedAt)
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining))
    if (requestId === rangeRequestId) rangeLoading.value = false
  }
})
watch(() => watchlist.loading, (loading) => {
  if (!loading && watchlist.items.length) restoreScrollPosition().catch(() => {
  })
})

onUnmounted(() => {
  if (marketTimer) clearInterval(marketTimer)
})

onBeforeRouteLeave((to) => {
  saveScrollPosition()
  if (to.name !== 'PositionDetail') {
    sessionStorage.removeItem(WATCHLIST_RETURN_KEY)
  }
})

function openGroups(item) {
  groupItem.value = item
  showGroupModal.value = true
}

function onGroupsSaved() {
  watchlist.fetchWatchlist(range.value, {force: true})
}

</script>

<template>
  <div class="watchlist safe-bottom">
    <header>
      <div  class="page-header">
        <h1 class="gradient-title">
          Watchlist
          <span v-if="watchlist.items.length" class="count-badge">({{ watchlist.items.length }})</span>
        </h1>
        <div class="header-actions">
          <Button
              v-tooltip.bottom="'Import from file'"
              icon="pi pi-upload"
              size="small"
              text
              @click="showImportModal = true"
          />
          <Button
              v-if="watchlist.items.length"
              v-tooltip.bottom="'Download watchlist (CSV)'"
              icon="pi pi-download"
              size="small"
              text
              @click="exportCsv"
          />
          <Button label="Add" outlined size="small" @click="showModal = true"/>
        </div>
      </div>

      <WatchlistSearch v-model="searchQuery"/>

      <div>
        <RangeBar class="page-range"/>
        <div v-if="rangeLoading" class="range-loading-indicator">
          <AppLoader/>
          <span>Loading {{ rangeLabel }} data</span>
        </div>
        <GroupModeBar v-model="groupMode" v-model:change-direction="changeDirection" class="page-group-mode"/>
        <div v-if="cacheStatusText" :class="{stale: watchlist.cacheMeta?.stale}" class="cache-status">
          <i :class="watchlist.cacheMeta?.stale ? 'pi pi-wifi-slash' : (watchlist.cacheMeta?.cached ? 'pi pi-database' : 'pi pi-sync')"/>
          <span>{{ cacheStatusText }}</span>
        </div>
      </div>


    </header>
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
      <p>No matches in your watchlist</p>
    </div>

    <div v-else class="watch-list-shell" :class="{ loading: rangeLoading }">
      <div v-if="rangeLoading" class="watch-list-loader">
        <AppLoader/>
      </div>
      <div class="watch-list">
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
.watchlist {
  padding: 1rem;
}

@media (min-width: 768px) {
  .watchlist {
    padding: 1.5rem;
  }
}

@media (min-width: 1280px) {
  .watchlist {
    padding: 2rem;
  }
}

header {
  position: sticky;
  top: 0;
  z-index: 5;
  background: var(--bg-primary);
  margin: -1rem -1rem 0;
  padding: 1rem 1rem 0.75rem;
}

@media (min-width: 768px) {
  header {
    margin: -1.5rem -1.5rem 0;
    padding: 1.5rem 1.5rem 0.75rem;
  }
}

@media (min-width: 1280px) {
  header {
    margin: -2rem -2rem 0;
    padding: 2rem 2rem 0.75rem;
  }
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.25rem;
}

.page-header h1 {
  font-size: 1.5rem;
}

.count-badge {
  -webkit-text-fill-color: var(--text-secondary);
  color: var(--text-secondary);
  font-size: 0.65rem;
  font-weight: 600;
  font-variant: small-caps;
  margin-left: 0.35rem;
  vertical-align: middle;
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
  color: transparent;
  background: linear-gradient(90deg, var(--neon-blue), #7dd3fc 45%, var(--neon-green));
  -webkit-background-clip: text;
  background-clip: text;
  padding: 0.6rem 0.25rem 0.3rem;
  border-bottom: 1px solid rgba(0, 207, 255, 0.18);
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 4rem 1rem;
  color: var(--text-secondary);
}

.empty i {
  font-size: 3rem;
}

.page-loader {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 180px;
}

.watch-list {
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--border);
}

.watch-list-shell {
  position: relative;
  min-height: 180px;
}

.watch-list-shell.loading .watch-list {
  opacity: 0.45;
  pointer-events: none;
}

.watch-list-loader {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 3rem;
  background: color-mix(in srgb, var(--bg-primary) 60%, transparent);
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

.page-group-mode {
  margin-bottom: 1rem;
}

.range-loading-indicator {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin: -0.45rem 0 0.75rem;
  color: var(--text-secondary);
  font-size: 0.72rem;
  font-weight: 700;
}

.range-loading-indicator :deep(.app-loader) {
  width: 16px;
  height: 16px;
}

.cache-status {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin-top: -0.5rem;
  margin-bottom: 0.85rem;
  padding: 0 0.1rem;
  color: var(--text-secondary);
  font-size: 0.72rem;
  font-weight: 600;
}

.cache-status i {
  font-size: 0.72rem;
}

.cache-status.stale {
  color: #fbbf24;
}
</style>
