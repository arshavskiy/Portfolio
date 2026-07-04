import api from '@/composables/useApi'
import {cachedFetch, invalidateClientCacheKey, readClientCacheEntry, setClientCacheEntry} from '@/composables/useClientCache'
import {getMarketHoursState, MARKET_HOURS_BY_GROUP} from '@/composables/useMarketHours'

const CACHE_PREFIX = 'quote:'
const OPEN_MARKET_TTL_MS = 30 * 1000
const CLOSED_MARKET_TTL_MS = 5 * 60 * 1000

function quoteCacheKey(ticker) {
  return `${CACHE_PREFIX}${ticker.toUpperCase()}`
}

function marketForTicker(ticker) {
  if (/-USD$/u.test(ticker)) return MARKET_HOURS_BY_GROUP.Crypto
  if (ticker.endsWith('.TA')) return MARKET_HOURS_BY_GROUP.Israel
  return MARKET_HOURS_BY_GROUP.US
}

function ttlForQuote(ticker) {
  const market = marketForTicker(ticker)
  const state = market ? getMarketHoursState(market, new Date()) : null
  return state?.isOpen ? OPEN_MARKET_TTL_MS : CLOSED_MARKET_TTL_MS
}

export function fetchCachedQuote(ticker, options = {}) {
  const normalized = ticker.toUpperCase()
  return cachedFetch(
    quoteCacheKey(normalized),
    ttlForQuote(normalized),
    () => api.get(`/stocks/quote/${encodeURIComponent(normalized)}`),
    options
  )
}

// Last-known quote (ignores TTL) for hydrating skeleton rows on first paint.
export function readCachedQuote(ticker) {
  if (!ticker) return Promise.resolve(null)
  return readClientCacheEntry(quoteCacheKey(ticker.toUpperCase()))
}

export function seedQuoteCache(ticker, quote, savedAt) {
  if (!ticker || !quote?.price) return Promise.resolve(null)
  return setClientCacheEntry(quoteCacheKey(ticker.toUpperCase()), quote, savedAt)
}

export function invalidateQuoteCache(ticker) {
  return invalidateClientCacheKey(quoteCacheKey(ticker))
}
