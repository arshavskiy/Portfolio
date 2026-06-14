import {computed, ref, watch} from 'vue'
import {defineStore} from 'pinia'
import {useStorage} from '@vueuse/core'
import api from '@/composables/useApi'
import {groupItems} from '@/composables/useGrouping'
import {usePortfolioStore} from '@/stores/portfolio'
import {useHistoryStore} from '@/stores/history'
import {useWatchlistStore} from '@/stores/watchlist'

export const useDashboardStore = defineStore('dashboard', () => {
  const portfolio = usePortfolioStore()
  const historyStore = useHistoryStore()
  const watchlist = useWatchlistStore()

  const groupMode = useStorage('dashboard-group-mode', 'sector')
  const historyRange = useStorage('dashboard-history-range', '1mo')
  const now = ref(new Date())
  const sparklines = ref({})
  const history = ref([])
  const historyLoading = ref(false)

  let marketTimer = null
  let initialized = false

  const portfolioPositions = computed(() => portfolio.positions)
  const portfolioTotals = computed(() => portfolio.totals)
  const portfolioCombinedUsd = computed(() => portfolio.combinedUsd)
  const portfolioLoading = computed(() => portfolio.loading)
  const watchlistItems = computed(() => watchlist.items)
  const watchlistLoading = computed(() => watchlist.loading)
  const watchlistMoversItems = computed(() => watchlist.items)
  const watchlistMoversLoading = computed(() => watchlist.loading)
  const watchlistGainersLosersItems = computed(() => watchlist.items)
  const watchlistGainersLosersLoading = computed(() => watchlist.loading)
  const groupedPositions = computed(() => groupItems(portfolio.positions, groupMode.value, now.value))
  const showTrending = computed(() => !portfolio.loading && !portfolio.positions.length)
  const showSkeleton = computed(() => portfolio.loading)
  const showEmpty = computed(() => !portfolio.loading && !portfolio.positions.length)

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

  async function fetchSparklines(rangeValue = '1mo') {
    const entries = await Promise.all(portfolio.positions.map(async (pos) => {
      try {
        return [pos.ticker, await historyStore.fetchHistory(pos.ticker, rangeValue, 40)]
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

  async function initialize(range) {
    if (!initialized) {
      watch(historyRange, fetchHistory)
      watch(() => portfolio.positions.length, fetchHistory)
      watch(() => portfolio.positions, () => fetchSparklines(range?.value || '1mo'), {deep: true})
      if (range) watch(range, (nextRange) => fetchSparklines(nextRange))
      initialized = true
    }

    await Promise.all([
      portfolio.fetchPortfolio(),
      watchlist.fetchWatchlist(range?.value || '1mo'),
    ])
    await Promise.all([fetchSparklines(range?.value || '1mo'), fetchHistory()])
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
