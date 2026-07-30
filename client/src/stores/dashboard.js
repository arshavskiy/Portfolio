import {computed, ref, watch} from 'vue'
import {defineStore} from 'pinia'
import {useStorage} from '@vueuse/core'
import api from '@/composables/useApi'
import {cachedFetch} from '@/composables/useClientCache'
import {groupItems} from '@/composables/useGrouping'
import {usePortfolioStore} from '@/stores/portfolio'
import {useHistoryStore} from '@/stores/history'
import {useMarketDataStore} from '@/stores/marketData'

// The dashboard always shows "today" — its watchlist-derived data (movers,
// breakdown %, sparklines) is intentionally NOT tied to the shared
// useChartRange() singleton used by the Watchlist/Holdings pages, so picking
// a range there doesn't silently change what the dashboard shows. It also
// fetches into its OWN state below rather than useWatchlistStore().items,
// since that store is shared app-wide — writing into it here would get
// overwritten by whatever range the Watchlist page last fetched, and vice
// versa, regardless of what range each caller asked for.
const DASHBOARD_RANGE = '1d'
const DASHBOARD_WATCHLIST_TTL_MS = 5 * 60 * 1000

export const useDashboardStore = defineStore('dashboard', () => {
  const portfolio = usePortfolioStore()
  const historyStore = useHistoryStore()
  const marketDataStore = useMarketDataStore()

  const groupMode = useStorage('dashboard-group-mode', 'sector')
  const historyRange = useStorage('dashboard-history-range', '1mo')
  const now = ref(new Date())
  const sparklines = ref({})
  const history = ref([])
  const historyLoading = ref(false)
    const dashboardWatchlistItems = ref([])
    const dashboardWatchlistLoading = ref(false)

  const ready = ref(false)

  let marketTimer = null
  let initialized = false
  let historyRequestId = 0
  let skipNextHistoryWatch = false

  const portfolioPositions = computed(() => portfolio.positions)
  const portfolioTotals = computed(() => portfolio.totals)
  const portfolioCombinedUsd = computed(() => portfolio.combinedUsd)
  const portfolioLoading = computed(() => portfolio.loading)
    const watchlistItems = computed(() => dashboardWatchlistItems.value)
    const watchlistLoading = computed(() => dashboardWatchlistLoading.value)
    const watchlistMoversItems = computed(() => dashboardWatchlistItems.value)
    const watchlistMoversLoading = computed(() => dashboardWatchlistLoading.value)
    const watchlistGainersLosersItems = computed(() => dashboardWatchlistItems.value)
    const watchlistGainersLosersLoading = computed(() => dashboardWatchlistLoading.value)
  const groupedPositions = computed(() => groupItems(portfolio.positions, groupMode.value, now.value))
  const showTrending = computed(() => !portfolio.loading && !portfolio.positions.length)
  const showSkeleton = computed(() => portfolio.loading)
  const showEmpty = computed(() => !portfolio.loading && !portfolio.positions.length)
    
    async function fetchDashboardWatchlist() {
        const hadData = dashboardWatchlistItems.value.length > 0
        if (!hadData) dashboardWatchlistLoading.value = true
        try {
            dashboardWatchlistItems.value = await cachedFetch(
                'watchlist:movers',
                DASHBOARD_WATCHLIST_TTL_MS,
                () => api.get('/watchlist/movers')
            )
        } catch {
            dashboardWatchlistItems.value = []
        } finally {
            if (!hadData) dashboardWatchlistLoading.value = false
        }
    }

  async function fetchHistory() {
    const requestId = ++historyRequestId
    const range = historyRange.value
    history.value = []
    historyLoading.value = true
    try {
      const data = await api.get(`/portfolio/history?range=${encodeURIComponent(range)}`)
      if (requestId === historyRequestId) history.value = data
    } catch {
      if (requestId === historyRequestId) history.value = []
    } finally {
      if (requestId === historyRequestId) historyLoading.value = false
    }
  }

  async function setHistoryRange(range) {
    if (historyRange.value === range) return
    skipNextHistoryWatch = true
    historyRange.value = range
    await fetchHistory()
  }
    
    async function fetchSparklines() {
    const entries = await Promise.all(portfolio.positions.map(async (pos) => {
      try {
          return [pos.ticker, await historyStore.fetchHistory(pos.ticker, DASHBOARD_RANGE, 40)]
      } catch {
        return null
      }
    }))
    sparklines.value = Object.fromEntries(entries.filter(Boolean))
  }

  function startClock() {
    if (marketTimer) return
    marketTimer = setInterval(() => {
      now.value = new Date()
    }, 60000)
  }

  function stopClock() {
    if (!marketTimer) return
    clearInterval(marketTimer)
    marketTimer = null
  }
    
    async function initialize() {
    if (!initialized) {
      watch(historyRange, () => {
        if (skipNextHistoryWatch) {
          skipNextHistoryWatch = false
          return
        }
        fetchHistory()
      })
      watch(() => portfolio.positions.length, fetchHistory)
        watch(() => portfolio.positions, fetchSparklines, {deep: true})
      initialized = true
    }

    // Above-the-fold cards (stats, watchlist movers, breakdown) only need the
    // portfolio + watchlist quotes — flip `ready` as soon as those land instead
    // of waiting on sparklines/portfolio-history/markets/trending too, since
    // those each render their own skeleton/loading state independently.
    await Promise.all([
      portfolio.fetchPortfolio(),
      fetchDashboardWatchlist(),
    ])
    startClock()
    ready.value = true

    Promise.all([
      marketDataStore.fetchMarkets('US').catch(() => {}),
      marketDataStore.fetchTrending('US').catch(() => {}),
      fetchSparklines(),
      fetchHistory(),
    ]).catch(() => {})
  }

  return {
    ready,
    groupMode,
    historyRange,
    now,
    sparklines,
    history,
    historyLoading,
    portfolioPositions,
    portfolioTotals,
    portfolioCombinedUsd,
    portfolioLoading,
    watchlistItems,
    watchlistLoading,
    watchlistMoversItems,
    watchlistMoversLoading,
    watchlistGainersLosersItems,
    watchlistGainersLosersLoading,
    groupedPositions,
    showTrending,
    showSkeleton,
    showEmpty,
    fetchHistory,
    setHistoryRange,
    fetchSparklines,
    initialize,
    startClock,
    stopClock,
  }
})
