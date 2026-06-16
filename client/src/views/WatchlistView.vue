<script setup>
import {computed, nextTick, onMounted, onUnmounted, ref, watch} from 'vue'
import {useStorage} from '@vueuse/core'
import {onBeforeRouteLeave, useRouter} from 'vue-router'
import {useWatchlistStore} from '@/stores/watchlist'
import {useAlertsStore} from '@/stores/alerts'
import {useChartRange} from '@/composables/useChartRange'
import {groupItems} from '@/composables/useGrouping'
import Button from 'primevue/button'
import AddWatchlistModal from '@/components/ui/AddWatchlistModal.vue'
import ImportModal from '@/components/ui/ImportModal.vue'
import WatchRow from '@/components/ui/WatchRow.vue'
import WatchlistSearch from '@/components/ui/WatchlistSearch.vue'
import RangeBar from '@/components/ui/RangeBar.vue'
import GroupModeBar from '@/components/ui/GroupModeBar.vue'
import GroupEditModal from '@/components/ui/GroupEditModal.vue'

const watchlist = useWatchlistStore()
const alerts = useAlertsStore()
const router = useRouter()
const range = useChartRange()
const showModal = ref(false)
const showImportModal = ref(false)
const showGroupModal = ref(false)
const groupItem = ref(null)
const groupMode = useStorage('watchlist-group-mode', 'sector')
const changeDirection = useStorage('watchlist-change-direction', 'down')
const searchQuery = ref('')
const now = ref(new Date())
let marketTimer = null
const WATCHLIST_SCROLL_KEY = 'watchlist-scroll-top'
const WATCHLIST_TICKER_KEY = 'watchlist-opened-ticker'
const WATCHLIST_RETURN_KEY = 'watchlist-return-from-position'

function onImported() {
  watchlist.fetchWatchlist(range.value)
}

const filteredItems = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return watchlist.items
  return watchlist.items.filter((item) =>
      item.ticker.toLowerCase().includes(q) || item.companyName?.toLowerCase().includes(q)
  )
})

const grouped = computed(() => groupItems(filteredItems.value, groupMode.value, now.value, changeDirection.value))

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
  saveScrollPosition()
  sessionStorage.setItem(WATCHLIST_TICKER_KEY, item.ticker)
  sessionStorage.setItem(WATCHLIST_RETURN_KEY, '1')
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
watch(range, (r) => watchlist.fetchWatchlist(r))
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
  watchlist.fetchWatchlist(range.value)
}

</script>

<template>
  <div class="watchlist safe-bottom">
    <header>
      <div  class="page-header">
        <h1 class="gradient-title">Watchlist</h1>
        <div class="header-actions">
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

      <div>
        <RangeBar class="page-range"/>
        <GroupModeBar v-model="groupMode" v-model:change-direction="changeDirection" class="page-group-mode"/>
      </div>


    </header>
    <div v-if="watchlist.loading" class="skeleton-list">
      <div v-for="n in 5" :key="n" class="skeleton-row"/>
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

    <div v-else class="watch-list">
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

.page-group-mode {
  margin-bottom: 1rem;
}
</style>
