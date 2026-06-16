import {defineStore} from 'pinia'
import {reactive, ref} from 'vue'
import api from '@/composables/useApi'

export const useWatchlistStore = defineStore('watchlist', () => {
  const items = ref([])
  const loading = ref(false)
  const inflightByRange = reactive({})
  let lastRange = '1mo'

  // Always fetches live — no TTL cache, so the dashboard reflects current
  // prices on every load. Concurrent calls for the same range still
  // dedupe onto a single in-flight request instead of double-fetching.
  async function fetchWatchlist(range = '1mo') {
    lastRange = range

    if (inflightByRange[range]) return inflightByRange[range]

    const hadData = items.value.length > 0
    if (!hadData) loading.value = true

    const request = (async () => {
      const data = await api.get(`/watchlist?range=${encodeURIComponent(range)}`)
      if (lastRange === range) items.value = data
      return data
    })()

    inflightByRange[range] = request

    try {
      return await request
    } finally {
      delete inflightByRange[range]
      if (!hadData) loading.value = false
    }
  }

  async function addItem(ticker, companyName) {
    await api.post('/watchlist', {ticker, companyName})
    await fetchWatchlist(lastRange)
  }

  // Bulk-add without re-fetching after each item; caller refreshes once at the end.
  async function addItemRaw(ticker, companyName) {
    return api.post('/watchlist', {ticker, companyName})
  }

  function refresh() {
    return fetchWatchlist(lastRange)
  }

  async function syncHoldings() {
    await api.post('/watchlist/sync-holdings', {})
    await fetchWatchlist(lastRange)
  }

  async function removeItem(id) {
    await api.delete(`/watchlist/${id}`)
    items.value = items.value.filter((i) => i._id !== id)
  }

  return {items, loading, fetchWatchlist, addItem, addItemRaw, refresh, removeItem, syncHoldings}
})
