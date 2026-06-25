import {defineStore} from 'pinia'
import {ref} from 'vue'
import api from '@/composables/useApi'
import {cachedFetch, invalidateClientCachePrefix} from '@/composables/useClientCache'
import {seedQuoteCache} from '@/composables/useQuoteCache'
import {useHistoryStore} from '@/stores/history'

export const useWatchlistStore = defineStore('watchlist', () => {
  const items = ref([])
  const loading = ref(false)
  const cacheMeta = ref(null)
  const historyStore = useHistoryStore()
  let lastRange = '1d'
  const CACHE_TTL_MS = 5 * 60 * 1000
  const CACHE_PREFIX = 'watchlist:'

  function detailHistoryPoints(range) {
    return range === '1d' ? 20 : 15
  }

  function seedDetailCaches(data, range, savedAt = Date.now()) {
    data.forEach((item) => {
      const {history, groups, addedAt, companyName, sector, industry, _id, ...quote} = item
      if (!quote.name && companyName) quote.name = companyName
      seedQuoteCache(item.ticker, quote, savedAt).catch(() => {})
      if (Array.isArray(history) && history.length) {
        historyStore.seedHistory(item.ticker, range, detailHistoryPoints(range), history, savedAt).catch(() => {})
      }
    })
  }

  // Cache watchlist responses briefly per chart range, while still allowing
  // mutation flows to force a fresh load. Concurrent calls for the same range
  // dedupe onto a single in-flight request instead of double-fetching.
  async function fetchWatchlist(range = '1d', options = {}) {
    lastRange = range
    const force = Boolean(options.force)

    const hadData = items.value.length > 0
    if (!hadData) loading.value = true

    try {
      let responseSavedAt = Date.now()
      const data = await cachedFetch(
        `${CACHE_PREFIX}${range}`,
        CACHE_TTL_MS,
        () => api.get(`/watchlist?range=${encodeURIComponent(range)}`),
        {
          force,
          onCacheMeta(meta) {
            responseSavedAt = meta.savedAt || responseSavedAt
            if (lastRange === range) cacheMeta.value = {...meta, range}
          },
        }
      )
      if (lastRange === range) items.value = data
      seedDetailCaches(data, range, responseSavedAt)
      return data
    } finally {
      if (!hadData) loading.value = false
    }
  }

  async function addItem(ticker, companyName) {
    await api.post('/watchlist', {ticker, companyName})
    await invalidateClientCachePrefix(CACHE_PREFIX)
    await fetchWatchlist(lastRange, {force: true})
  }

  // Bulk-add without re-fetching after each item; caller refreshes once at the end.
  async function addItemRaw(ticker, companyName) {
    return api.post('/watchlist', {ticker, companyName})
  }

  function refresh(options = {}) {
    return fetchWatchlist(lastRange, {force: true, ...options})
  }

  async function syncHoldings() {
    await api.post('/watchlist/sync-holdings', {})
    await invalidateClientCachePrefix(CACHE_PREFIX)
    await fetchWatchlist(lastRange, {force: true})
  }

  async function removeItem(id) {
    await api.delete(`/watchlist/${id}`)
    await invalidateClientCachePrefix(CACHE_PREFIX)
    items.value = items.value.filter((i) => i._id !== id)
  }

  return {items, loading, cacheMeta, fetchWatchlist, addItem, addItemRaw, refresh, removeItem, syncHoldings}
})
