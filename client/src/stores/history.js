import {defineStore} from 'pinia'
import {reactive} from 'vue'
import api from '@/composables/useApi'

const HISTORY_CACHE_TTL = 5 * 60 * 1000

function makeKey(ticker, range, points) {
    return `${ticker.toUpperCase()}?range=${range}${points ? `&points=${points}` : ''}`
}

export const useHistoryStore = defineStore('history', () => {
  const cache = reactive({})
  const loading = reactive({})
    
    function getEntry(ticker, range = '1mo', points) {
        const key = makeKey(ticker, range, points)
    const entry = cache[key]
    if (!entry) return null
    if (entry.expiresAt <= Date.now()) {
      delete cache[key]
      return null
    }
    return entry.data
  }
    
    function isLoading(ticker, range = '1mo', points) {
        return !!loading[makeKey(ticker, range, points)]
  }
    
    async function fetchHistory(ticker, range = '1mo', points) {
        const key = makeKey(ticker, range, points)
    const cached = cache[key]

    if (cached?.data && cached.expiresAt > Date.now()) return cached.data
    if (cached?.promise) return cached.promise

    loading[key] = true
        
        const pointsParam = points ? `&points=${encodeURIComponent(points)}` : ''
        const promise = api.get(`/stocks/history/${encodeURIComponent(ticker)}?range=${encodeURIComponent(range)}${pointsParam}`)
      .then((data) => {
        cache[key] = {
          data,
          expiresAt: Date.now() + HISTORY_CACHE_TTL,
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
    return promise
  }

  function clearHistory() {
    for (const key of Object.keys(cache)) delete cache[key]
    for (const key of Object.keys(loading)) delete loading[key]
  }

  return { fetchHistory, getEntry, isLoading, clearHistory }
})
