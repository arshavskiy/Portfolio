import {defineStore} from 'pinia'
import {ref} from 'vue'
import api from '@/composables/useApi'
import {cachedFetch, invalidateClientCachePrefix} from '@/composables/useClientCache'
import {readCachedQuote, seedQuoteCache} from '@/composables/useQuoteCache'
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

  // Hydrate a skeleton row with its last-known cached quote + history so first
  // paint shows real numbers (dimmed with a shimmer) instead of blank rows.
  // `stale: true` flags the row until the fresh enrichment replaces it.
  async function hydrateFromCache(item, range) {
    const points = detailHistoryPoints(range)
    const [quoteEntry, history] = await Promise.all([
      readCachedQuote(item.ticker).catch(() => null),
      historyStore.readCachedHistory(item.ticker, range, points).catch(() => null),
    ])
    const quote = quoteEntry?.data
    if (!quote && !history) return item
    return {
      ...item,
      ...(quote || {}),
      history: history || item.history || [],
      stale: true,
    }
  }

  // First paint: show tickers/company names from the DB immediately while the
  // slow quote+history enrichment loads, hydrating each row with the last-known
  // cached quote/history. Never overwrites enriched data.
  async function fetchSkeleton(range) {
    try {
      const data = await api.get('/watchlist/skeleton')
      const hydrated = await Promise.all(data.map((item) => hydrateFromCache(item, range)))
      if (lastRange === range && !items.value.length && hydrated.length) {
        items.value = hydrated
      }
    } catch {
    }
  }

  // Cache watchlist responses briefly per chart range, while still allowing
  // mutation flows to force a fresh load. Concurrent calls for the same range
  // dedupe onto a single in-flight request instead of double-fetching.
  async function fetchWatchlist(range = '1d', options = {}) {
    lastRange = range
    const force = Boolean(options.force)

    const hadData = items.value.length > 0
    if (!hadData) {
      loading.value = true
      fetchSkeleton(range)
    }

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
    const created = await api.post('/watchlist', {ticker, companyName})
    await invalidateClientCachePrefix(CACHE_PREFIX)
    await fetchWatchlist(lastRange, {force: true})
    return created
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
    // Synthetic held-only rows have no watchlist doc to delete; ignore them.
    if (typeof id === 'string' && id.startsWith('held:')) return
    await api.delete(`/watchlist/${id}`)
    await invalidateClientCachePrefix(CACHE_PREFIX)
    items.value = items.value.filter((i) => i._id !== id)
  }

  return {items, loading, cacheMeta, fetchWatchlist, addItem, addItemRaw, refresh, removeItem, syncHoldings}
})
