import {computed, ref, watch} from 'vue'
import {defineStore} from 'pinia'
import {useStorage} from '@vueuse/core'
import api from '@/composables/useApi'
import {groupItems} from '@/composables/useGrouping'
import {usePortfolioStore} from '@/stores/portfolio'
import {useHistoryStore} from '@/stores/history'

// The dashboard always shows "today" — its watchlist-derived data (movers,
// breakdown %, sparklines) is intentionally NOT tied to the shared
// useChartRange() singleton used by the Watchlist/Holdings pages, so picking
// a range there doesn't silently change what the dashboard shows. It also
// fetches into its OWN state below rather than useWatchlistStore().items,
// since that store is shared app-wide — writing into it here would get
// overwritten by whatever range the Watchlist page last fetched, and vice
// versa, regardless of what range each caller asked for.
const DASHBOARD_RANGE = '1d'

export const useDashboardStore = defineStore('dashboard', () => {
  const portfolio = usePortfolioStore()
  const historyStore = useHistoryStore()

  const groupMode = useStorage('dashboard-group-mode', 'sector')
  const historyRange = useStorage('dashboard-history-range', '1mo')
  const now = ref(new Date())
  const sparklines = ref({})
  const history = ref([])
  const historyLoading = ref(false)
    const dashboardWatchlistItems = ref([])
    const dashboardWatchlistLoading = ref(false)

  let marketTimer = null
  let initialized = false

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
            dashboardWatchlistItems.value = await api.get(`/watchlist?range=${DASHBOARD_RANGE}`)
        } catch {
            dashboardWatchlistItems.value = []
        } finally {
            if (!hadData) dashboardWatchlistLoading.value = false
        }
    }

  async function fetchHistory() {
    historyLoading.value = true
    try {
      history.value = await api.get(`/portfolio/history?range=${encodeURIComponent(historyRange.value)}`)
    } catch {
      history.value = []
    } finally {
      historyLoading.value = false
    }
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
      watch(historyRange, fetchHistory)
      watch(() => portfolio.positions.length, fetchHistory)
        watch(() => portfolio.positions, fetchSparklines, {deep: true})
      initialized = true
    }

    await Promise.all([
      portfolio.fetchPortfolio(),
        fetchDashboardWatchlist(),
    ])
        await Promise.all([fetchSparklines(), fetchHistory()])
    startClock()
  }

  return {
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
    fetchSparklines,
    initialize,
    startClock,
    stopClock,
  }
})
