import {defineStore} from 'pinia'
import {reactive} from 'vue'
import api from '@/composables/useApi'
import {cachedFetch, invalidateClientCachePrefix, setClientCacheEntry} from '@/composables/useClientCache'

const CACHE_PREFIX = 'history:'

// Cache key covers only ticker+range — points is applied client-side after fetch
// so multiple callers requesting different point counts share one network request.
function makeKey(ticker, range) {
  return `${ticker.toUpperCase()}?range=${range}`
}

function ttlForRange(range) {
  if (range === '1d') return 2 * 60 * 1000
  if (range === '1wk' || range === '5d') return 10 * 60 * 1000
  if (range === '1mo') return 60 * 60 * 1000
  return 6 * 60 * 60 * 1000
}

function downsample(arr, max) {
  if (!Array.isArray(arr) || !max || arr.length <= max || max < 2) return arr
  const step = (arr.length - 1) / (max - 1)
  const out = []
  for (let i = 0; i < max; i++) out.push(arr[Math.round(i * step)])
  return out
}

export const useHistoryStore = defineStore('history', () => {
  const cache = reactive({})
  const loading = reactive({})

  function getEntry(ticker, range = '1mo', points) {
    const key = makeKey(ticker, range)
    const entry = cache[key]
    if (!entry) return null
    if (entry.expiresAt <= Date.now()) {
      delete cache[key]
      return null
    }
    return downsample(entry.data, points)
  }

  function isLoading(ticker, range = '1mo') {
    return !!loading[makeKey(ticker, range)]
  }

  async function fetchHistory(ticker, range = '1mo', points) {
    const key = makeKey(ticker, range)
    const cached = cache[key]

    if (cached?.data && cached.expiresAt > Date.now()) return downsample(cached.data, points)
    if (cached?.promise) return cached.promise.then(data => downsample(data, points))

    loading[key] = true

    const promise = cachedFetch(
      `${CACHE_PREFIX}${key}`,
      ttlForRange(range),
      () => api.get(`/stocks/history/${encodeURIComponent(ticker)}?range=${encodeURIComponent(range)}`)
    )
      .then((data) => {
        cache[key] = {
          data,
          expiresAt: Date.now() + ttlForRange(range),
        }
        return data
      })
      .catch((error) => {
        delete cache[key]
        throw error
      })
      .finally(() => {
        delete loading[key]
        if (cache[key]?.promise) delete cache[key].promise
      })

    cache[key] = { promise, expiresAt: 0 }
    return promise.then(data => downsample(data, points))
  }

  async function seedHistory(ticker, range = '1mo', points, data, savedAt = Date.now()) {
    if (!ticker || !Array.isArray(data)) return null
    const key = makeKey(ticker, range)
    cache[key] = {
      data,
      expiresAt: savedAt + ttlForRange(range),
    }
    return setClientCacheEntry(`${CACHE_PREFIX}${key}`, data, savedAt)
  }

  function clearHistory() {
    for (const key of Object.keys(cache)) delete cache[key]
    for (const key of Object.keys(loading)) delete loading[key]
    invalidateClientCachePrefix(CACHE_PREFIX).catch(() => {})
  }

  return { fetchHistory, seedHistory, getEntry, isLoading, clearHistory }
})
