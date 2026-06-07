import {defineStore} from 'pinia'
import {reactive, ref} from 'vue'
import api from '@/composables/useApi'

const WATCHLIST_CACHE_TTL = 5 * 60 * 1000

export const useWatchlistStore = defineStore('watchlist', () => {
  const items = ref([])
  const loading = ref(false)
  const cacheByRange = reactive({})
  const inflightByRange = reactive({})
  let lastRange = '1mo'

  function hasFreshCache(range) {
    const entry = cacheByRange[range]
    return Boolean(entry?.data && entry.expiresAt > Date.now())
  }

  function getCached(range) {
    return cacheByRange[range]?.data || []
  }

  async function fetchWatchlist(range = '1mo', {force = false} = {}) {
    lastRange = range

    if (!force && hasFreshCache(range)) {
      items.value = getCached(range)
      return items.value
    }

    const staleData = getCached(range)
    if (staleData.length) items.value = staleData
    if (inflightByRange[range]) return inflightByRange[range]

    const shouldShowLoading = !staleData.length
    if (shouldShowLoading) loading.value = true

    const request = (async () => {
      const data = await api.get(`/watchlist?range=${encodeURIComponent(range)}`)
      cacheByRange[range] = {
        data,
        expiresAt: Date.now() + WATCHLIST_CACHE_TTL,
      }
      if (lastRange === range) items.value = data
      return data
    })()

    inflightByRange[range] = request

    try {
      return await request
    } finally {
      delete inflightByRange[range]
      if (shouldShowLoading) loading.value = false
    }
  }

  async function addItem(ticker, companyName) {
    await api.post('/watchlist', {ticker, companyName})
    await fetchWatchlist(lastRange, {force: true})
  }

  // Bulk-add without re-fetching after each item; caller refreshes once at the end.
  async function addItemRaw(ticker, companyName) {
    return api.post('/watchlist', {ticker, companyName})
  }

  function refresh() {
    return fetchWatchlist(lastRange, {force: true})
  }

  async function syncHoldings() {
    await api.post('/watchlist/sync-holdings', {})
    await fetchWatchlist(lastRange, {force: true})
  }

  async function removeItem(id) {
    await api.delete(`/watchlist/${id}`)
    items.value = items.value.filter((i) => i._id !== id)
    Object.keys(cacheByRange).forEach((range) => {
      const entry = cacheByRange[range]
      if (!entry?.data) return
      cacheByRange[range] = {
        ...entry,
        data: entry.data.filter((item) => item._id !== id),
      }
    })
  }

  return {items, loading, fetchWatchlist, addItem, addItemRaw, refresh, removeItem, syncHoldings}
})
