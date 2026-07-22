<script setup>
import {computed, nextTick, onMounted, onUnmounted, ref, watch} from 'vue'
import {useStorage} from '@vueuse/core'
import {onBeforeRouteLeave, useRouter} from 'vue-router'
import {useWatchlistStore} from '@/stores/watchlist'
import {useAlertsStore} from '@/stores/alerts'
import {usePortfolioStore} from '@/stores/portfolio'
import {useChartRange} from '@/composables/useChartRange'
import {groupItems} from '@/composables/useGrouping'
import {useMomentumStore} from '@/stores/momentum'
import {useBreakpoint} from '@/composables/useBreakpoint'
import {useDesktopFocusStore} from '@/stores/desktopFocus'
import {exportWatchlistCsv} from '@/composables/useImport'
import {trackEvent} from '@/composables/useAnalytics'
import {useTour} from '@/composables/useTour'
import Button from 'primevue/button'
import Menu from 'primevue/menu'
import AddWatchlistModal from '@/components/ui/AddWatchlistModal.vue'
import AddTransactionModal from '@/components/ui/AddTransactionModal.vue'
import ImportModal from '@/components/ui/ImportModal.vue'
import WatchRow from '@/components/ui/WatchRow.vue'
import WatchlistSearch from '@/components/ui/WatchlistSearch.vue'
import RangeBar from '@/components/ui/RangeBar.vue'
import GroupModeBar from '@/components/ui/GroupModeBar.vue'
import GroupEditModal from '@/components/ui/GroupEditModal.vue'
import AppLoader from '@/components/ui/AppLoader.vue'
import WatchlistActionsMenu from '@/components/ui/WatchlistActionsMenu.vue'
import {useI18n} from '@/composables/useI18n'

const watchlist = useWatchlistStore()
const alerts = useAlertsStore()
const portfolio = usePortfolioStore()
const momentumStore = useMomentumStore()
const router = useRouter()
const {isDesktop} = useBreakpoint()
const desktopFocus = useDesktopFocusStore()
const range = useChartRange()
const {t} = useI18n()
const {maybeStartWatchlistPhase} = useTour()
const showModal = ref(false)
const showImportModal = ref(false)
const showTxModal = ref(false)
const importMode = ref('watchlist')
const importMenu = ref(null)
const importMenuItems = computed(() => [
  {
    label: t('watchlist.importWatchlist'),
    icon: 'pi pi-eye',
    command: () => {
      importMode.value = 'watchlist'
      showImportModal.value = true
    },
  },
  {
    label: t('watchlist.importHoldings'),
    icon: 'pi pi-briefcase',
    command: () => {
      importMode.value = 'holdings'
      showImportModal.value = true
    },
  },
])
const showGroupModal = ref(false)
const groupItem = ref(null)
const groupMode = useStorage('watchlist-group-mode', 'market')
const changeDirection = useStorage('watchlist-change-direction', 'down')
const searchQuery = ref('')
const heldOnly = useStorage('watchlist-held-only', false)
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
  if (importMode.value === 'holdings') portfolio.fetchPortfolio().catch(() => {})
}

function exportCsv() {
  const tickers = watchlist.items.map((i) => i.ticker).filter(Boolean)
  if (tickers.length) exportWatchlistCsv(tickers)
}

const heldCount = computed(() => {
  const heldTickers = new Set(portfolio.positions.map((position) => String(position.ticker || '').toUpperCase()))
  return watchlist.items.filter((item) => heldTickers.has(String(item.ticker || '').toUpperCase())).length
})

const headerActions = computed(() => [
  {
    key: 'typology-map',
    icon: 'pi pi-th-large',
    label: t('watchlist.typologyMap'),
    onClick: () => router.push('/typology-map'),
  },
  {
    key: 'rebalance',
    visible: portfolio.positions.length > 0,
    icon: 'pi pi-sliders-h',
    label: t('watchlist.rebalance'),
    onClick: () => router.push('/rebalance'),
  },
  {
    key: 'import',
    icon: 'pi pi-upload',
    label: t('watchlist.importFromFile'),
    dataTour: 'wl-import',
    onClick: (event) => importMenu.value?.toggle(event),
    children: [
      {
        key: 'import-watchlist',
        icon: 'pi pi-eye',
        label: t('watchlist.importWatchlist'),
        onClick: () => {
          importMode.value = 'watchlist';
          showImportModal.value = true
        },
      },
      {
        key: 'import-holdings',
        icon: 'pi pi-briefcase',
        label: t('watchlist.importHoldings'),
        onClick: () => {
          importMode.value = 'holdings';
          showImportModal.value = true
        },
      },
    ],
  },
  {
    key: 'export',
    visible: watchlist.items.length > 0,
    icon: 'pi pi-download',
    label: t('watchlist.downloadCsv'),
    onClick: exportCsv,
  },
  {
    key: 'add-transaction',
    icon: 'pi pi-dollar',
    label: t('watchlist.addTransaction'),
    dataTour: 'wl-add-transaction',
    onClick: () => {
      showTxModal.value = true
    },
  },
  {
    key: 'add-watchlist',
    icon: 'pi pi-eye',
    label: t('watchlist.addToWatchlist'),
    dataTour: 'wl-add-watchlist',
    onClick: () => {
      showModal.value = true
    },
  },
])

const filteredItems = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  const heldTickers = new Set(portfolio.positions.map((position) => String(position.ticker || '').toUpperCase()))
  let items = watchlist.items.map((item) => ({
    ...item,
    isHeld: heldTickers.has(String(item.ticker || '').toUpperCase()),
  }))
  if (heldOnly.value) items = items.filter((item) => item.isHeld)
  if (!q) return items
  return items.filter((item) =>
      item.ticker?.toLowerCase().includes(q) || item.companyName?.toLowerCase().includes(q)
  )
})

// Reference momentumStore.scores so grouped re-sorts when wave votes arrive
const grouped = computed(() => {
  void momentumStore.scores
  return groupItems(filteredItems.value, groupMode.value, now.value, changeDirection.value)
})
const initialLoading = computed(() => watchlist.loading && !watchlist.items.length)
// Skeleton rows are visible but quotes are still being fetched.
const quotesLoading = computed(() => watchlist.loading && watchlist.items.length > 0)
const rangeLabel = computed(() => RANGE_LABELS[range.value] || range.value)
const cacheStatusText = computed(() => {
  const meta = watchlist.cacheMeta
  if (!meta?.savedAt) return ''

  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(meta.savedAt))

  if (meta.stale) return t('watchlist.offlineCacheFrom', {time})
  if (meta.cached) return t('watchlist.cached', {time})
  return t('watchlist.updated', {time})
})

const visibleOrderedItems = computed(() => {
  const seen = new Set()
  const items = []
  for (const section of grouped.value) {
    for (const item of section.items) {
      const key = String(item.ticker || '').toUpperCase()
      if (!key || seen.has(key)) continue
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
  trackEvent('select_ticker', {ticker: item.ticker})
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
  if (!portfolio.positions.length && !portfolio.loading) portfolio.fetchPortfolio().catch(() => {})
  watchlist.fetchWatchlist(range.value).finally(() => {
    restoreScrollPosition().catch(() => {
    })
    maybeStartWatchlistPhase()
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

function groupLabel(group) {
  if (group === 'Dividend payers') return t('grouping.dividendPayers')
  if (group === 'No dividend data') return t('grouping.noDividendData')
  if (group === 'Insider buying') return t('grouping.insiderBuying')
  if (group === 'Insider selling') return t('grouping.insiderSelling')
  if (group === 'No insider data') return t('grouping.noInsiderData')
  return group
}

</script>

<template>
  <div class="watchlist safe-bottom">
    <header>
      <div  class="page-header">
        <div class="page-heading">
          <h1 class="gradient-title">
            {{ t('common.watchlist') }}
            <span v-if="watchlist.items.length" class="count-badge">({{ watchlist.items.length }})</span>
          </h1>
          <div v-if="cacheStatusText" :class="{stale: watchlist.cacheMeta?.stale}" class="cache-status">
            <i :class="watchlist.cacheMeta?.stale ? 'pi pi-wifi-slash' : (watchlist.cacheMeta?.cached ? 'pi pi-database' : 'pi pi-sync')"/>

            <span>{{ cacheStatusText }}  </span>

          </div>
        </div>
        <div class="header-actions" data-tour="wl-actions">
          <span v-if="heldCount > 0 && isDesktop" class="tour-action-anchor" data-tour="wl-held-filter">
            <Button
                v-tooltip.bottom="heldOnly ? t('watchlist.showAll') : t('watchlist.showHoldingsOnly')"
                :class="['held-filter-btn', {active: heldOnly}]"
                icon="pi pi-briefcase"
                size="small"
                text
                @click="heldOnly = !heldOnly"
            />
          </span>
          <Teleport v-if="heldCount > 0 && !isDesktop" to="#page-actions-slot">
            <span class="tour-action-anchor mobile-held-filter" data-tour="wl-held-filter">
              <Button
                  aria-haspopup="false"
                  :class="['held-filter-btn', {active: heldOnly}]"
                  icon="pi pi-briefcase"
                  rounded
                  text
                  @click="heldOnly = !heldOnly"
              />
            </span>
          </Teleport>
          <WatchlistActionsMenu :actions="headerActions"/>
          <Menu ref="importMenu" :model="importMenuItems" popup/>
        </div>
      </div>

      <WatchlistSearch v-model="searchQuery"/>

      <div class="watch-list-controls">
        <RangeBar class="page-range" data-tour="wl-range"/>
        <div v-if="rangeLoading || quotesLoading" class="range-loading-indicator">
          <AppLoader/>
          <span>{{ t('common.loadingRangeData', {range: rangeLabel}) }}</span>
        </div>
        <GroupModeBar v-model="groupMode" v-model:change-direction="changeDirection" class="page-group-mode" data-tour="wl-group"/>
      </div>

    </header>
    <div v-if="initialLoading" class="page-loader">
      <AppLoader/>
    </div>

    <div v-else-if="!watchlist.items.length" class="empty">
      <i class="pi pi-eye"/>
      <p>{{ t('watchlist.empty') }}</p>
      <Button :label="t('watchlist.addStock')" @click="showModal = true"/>
    </div>

    <div v-else-if="!filteredItems.length" class="empty">
      <i class="pi pi-search"/>
      <p>{{ t('watchlist.noMatches') }}</p>
    </div>

    <div v-else class="watch-list-shell" :class="{ loading: rangeLoading }">
      <div v-if="rangeLoading" class="watch-list-loader">
        <AppLoader/>
      </div>
      <div class="watch-list">
        <template v-for="(section, sIdx) in grouped" :key="section.group ?? '_all'">
          <div v-if="section.group" class="market-header">{{ groupLabel(section.group) }}</div>
          <WatchRow
              v-for="(item, iIdx) in section.items"
              :key="`${section.group ?? ''}-${item._id}`"
              :data-tour="sIdx === 0 && iIdx === 0 ? 'wl-row' : null"
              :data-watchlist-ticker="item.ticker"
              :highlight-held="item.isHeld"
              :item="item"
              @edit-groups="openGroups"
              @open-stock="openStock"
          />
        </template>
      </div>
    </div>

    <AddWatchlistModal v-model:visible="showModal"/>
    <AddTransactionModal v-model:visible="showTxModal"/>
    <ImportModal v-model:visible="showImportModal" :mode="importMode" @imported="onImported"/>
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
  height: calc(100dvh - 75px - env(safe-area-inset-top, 0px));
  min-height: 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
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
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  background: var(--bg-primary);
  margin: -1rem -1rem 0;
  padding: 1rem 1rem 0;
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
  align-items: flex-start;
  margin-bottom: 1.25rem;
}

.page-heading {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  min-width: 0;
}


.count-badge {
  -webkit-text-fill-color: var(--text-secondary);
  color: var(--text-secondary);
  font-size: 0.65rem;
  font-weight: 600;
  font-variant: small-caps;
  vertical-align: baseline;
}

.header-actions {
  display: flex;
  align-items: center;
}

.tour-action-anchor {
  display: inline-flex;
}

.held-filter-btn :deep(.pi-briefcase) {
  color: #fbbf24;
}

.held-filter-btn.active {
  background: color-mix(in srgb, #fbbf24 18%, transparent);
  border-radius: 8px;
}

.held-filter-btn.active :deep(.pi-briefcase) {
  color: #fbbf24;
  text-shadow: 0 0 8px rgba(251, 191, 36, 0.6);
}

.mobile-held-filter {
  order: -1;
}

.mobile-held-filter :deep(.p-button) {
  width: 40px;
  height: 40px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg-card) 85%, transparent);
}

.mobile-held-filter :deep(.p-button.active) {
  border-color: rgba(251, 191, 36, 0.6);
  background: color-mix(in srgb, #fbbf24 18%, var(--bg-card));
  box-shadow: 0 0 10px rgba(251, 191, 36, 0.3);
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

.empty i {
  font-size: 3rem;
}


.watch-list {
  display: flex;
  flex-direction: column;
}

.watch-list-shell {
  flex: 1;
  position: relative;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior-y: contain;
  -webkit-overflow-scrolling: touch;
  margin: 0 -1rem;
  padding: 0 1rem;
}

@media (min-width: 768px) {
  .watch-list-shell {
    margin: 0 -1.5rem;
    padding: 0 1.5rem;
  }
}

@media (min-width: 1280px) {
  .watch-list-shell {
    margin: 0 -2rem;
    padding: 0 2rem;
  }
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
