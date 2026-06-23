const YahooFinance = require('yahoo-finance2').default
const crypto = require('crypto')
const ExtendedQuote = require('../models/ExtendedQuote')
const yahooFinance = new YahooFinance()

const quoteCache = new Map()
// In-memory mirror of the persisted last-seen extended-hours snapshot per
// ticker, so the synchronous quote path never waits on the DB. Lazily loaded.
const extendedSnapshotCache = new Map()
const profileCache = new Map()
const historyCache = new Map()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes
const HISTORY_CACHE_TTLS = {
  '1d': 2 * 60 * 1000,
  '1wk': 10 * 60 * 1000,
  '5d': 10 * 60 * 1000,
  '1mo': 60 * 60 * 1000,
  '3mo': 6 * 60 * 60 * 1000,
  '6mo': 6 * 60 * 60 * 1000,
  '1y': 6 * 60 * 60 * 1000,
  max: 6 * 60 * 60 * 1000,
}

// TASE (.TA) prices from Yahoo are in agorot (1/100 shekel) — divide by 100
function taFactor(ticker) {
  return ticker.toUpperCase().endsWith('.TA') ? 100 : 1
}

// Evenly downsample to at most `max` items, always keeping first + last.
function downsample(arr, max) {
  if (!Array.isArray(arr) || !max || arr.length <= max || max < 2) return arr
  const step = (arr.length - 1) / (max - 1)
  const out = []
  for (let i = 0; i < max; i++) out.push(arr[Math.round(i * step)])
  return out
}

function cleanProfileValue(value) {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized || null
}

// Cache by ticker+range only — points is applied after fetch so all callers
// with different point counts share one cached Yahoo request.
function historyCacheKey(ticker, range = '3mo') {
  return `${ticker.toUpperCase()}:${range}`
}

function historyCacheTtl(range) {
  return HISTORY_CACHE_TTLS[range] || HISTORY_CACHE_TTLS['3mo']
}

const INTRADAY_MARKETS = {
  us: {
    timezone: 'America/New_York',
    days: [1, 2, 3, 4, 5],
    sessionsByDay: {
      1: [{ start: '09:30', end: '16:00' }],
      2: [{ start: '09:30', end: '16:00' }],
      3: [{ start: '09:30', end: '16:00' }],
      4: [{ start: '09:30', end: '16:00' }],
      5: [{ start: '09:30', end: '16:00' }],
    },
  },
  israel: {
    timezone: 'Asia/Jerusalem',
    days: [1, 2, 3, 4, 5],
    sessionsByDay: {
      1: [{ start: '10:00', end: '17:35' }],
      2: [{ start: '10:00', end: '17:35' }],
      3: [{ start: '10:00', end: '17:35' }],
      4: [{ start: '10:00', end: '17:35' }],
      5: [{ start: '10:00', end: '13:50' }],
    },
  },
  crypto: {
    timezone: 'UTC',
    days: [0, 1, 2, 3, 4, 5, 6],
    sessionsByDay: {
      0: [{ start: '00:00', end: '24:00' }],
      1: [{ start: '00:00', end: '24:00' }],
      2: [{ start: '00:00', end: '24:00' }],
      3: [{ start: '00:00', end: '24:00' }],
      4: [{ start: '00:00', end: '24:00' }],
      5: [{ start: '00:00', end: '24:00' }],
      6: [{ start: '00:00', end: '24:00' }],
    },
  },
}

function inferIntradayMarket(ticker) {
  const symbol = ticker.toUpperCase()
  if (/-USD$/.test(symbol)) return INTRADAY_MARKETS.crypto
  if (/\.TA$/.test(symbol)) return INTRADAY_MARKETS.israel
  return INTRADAY_MARKETS.us
}

function getTimeParts(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const weekdayMap = {Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6}
  return {
    weekday: weekdayMap[map.weekday],
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
  }
}

function intradayDateKey(date, timezone) {
  const parts = getTimeParts(date, timezone)
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

function sessionMinutes(value) {
  const [hour, minute] = value.split(':').map(Number)
  return (hour * 60) + minute
}

function getMarketStateForDate(market, date) {
  const parts = getTimeParts(date, market.timezone)
  const currentMinutes = (parts.hour * 60) + parts.minute
  const sessions = (market.sessionsByDay[parts.weekday] || []).map((session) => ({
    ...session,
    startMinutes: sessionMinutes(session.start),
    endMinutes: sessionMinutes(session.end),
  }))
  const activeSession = sessions.find((session) => currentMinutes >= session.startMinutes && currentMinutes < session.endMinutes)
  const lastSession = sessions[sessions.length - 1] || null
  return {
    ...parts,
    currentMinutes,
    sessions,
    isTradingDay: market.days.includes(parts.weekday),
    activeSession,
    afterClose: Boolean(lastSession) && currentMinutes >= lastSession.endMinutes,
  }
}

function selectIntradayRows(rows, ticker, now = new Date()) {
  if (!rows.length) return rows

  const market = inferIntradayMarket(ticker)
  const state = getMarketStateForDate(market, now)
  const todayKey = intradayDateKey(now, market.timezone)
  const grouped = new Map()

  rows.forEach((row) => {
    const key = intradayDateKey(row.date, market.timezone)
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push(row)
  })

  const sortedKeys = [...grouped.keys()].sort()
  if (!sortedKeys.length) return rows

  if (market === INTRADAY_MARKETS.crypto) {
    return grouped.get(sortedKeys[sortedKeys.length - 1]) || rows
  }

  if (state.activeSession && grouped.has(todayKey)) {
    return grouped.get(todayKey)
  }

  if (state.isTradingDay && state.afterClose && grouped.has(todayKey)) {
    return grouped.get(todayKey)
  }

  const priorKey = [...sortedKeys].reverse().find((key) => key < todayKey)
  if (priorKey) return grouped.get(priorKey)

  return grouped.get(sortedKeys[sortedKeys.length - 1]) || rows
}

// Lazily load the persisted extended-hours snapshot for a ticker into memory.
async function loadExtendedSnapshot(ticker) {
    const key = ticker.toUpperCase()
    if (extendedSnapshotCache.has(key)) return extendedSnapshotCache.get(key)
    let doc = null
    try {
        doc = await ExtendedQuote.findOne({ticker: key}).lean()
    } catch {
        doc = null
    }
    const snapshot = doc
        ? {
            postMarketPrice: doc.postMarketPrice,
            postMarketChange: doc.postMarketChange,
            postMarketChangePercent: doc.postMarketChangePercent,
            postMarketTime: doc.postMarketTime,
            preMarketPrice: doc.preMarketPrice,
            preMarketChange: doc.preMarketChange,
            preMarketChangePercent: doc.preMarketChangePercent,
            preMarketTime: doc.preMarketTime,
        }
        : null
    extendedSnapshotCache.set(key, snapshot)
    return snapshot
}

// Persist the latest non-null extended-hours fields (in-memory + DB, fire-and-forget).
function saveExtendedSnapshot(ticker, fields) {
    const key = ticker.toUpperCase()
    const prev = extendedSnapshotCache.get(key) || {}
    const next = {...prev}
    let changed = false
    for (const [k, v] of Object.entries(fields)) {
        if (v != null && v !== prev[k]) {
            next[k] = v
            changed = true
        }
    }
    if (!changed) return
    extendedSnapshotCache.set(key, next)
    ExtendedQuote.updateOne({ticker: key}, {$set: {ticker: key, ...next}}, {upsert: true})
        .catch((err) => console.error('[stockService] extended snapshot save error:', err.message))
}

async function getQuote(ticker) {
  const key = ticker.toUpperCase()
  const cached = quoteCache.get(key) || quoteCache.get(ticker)
  let result
  try {
    // No TTL here — quotes are always fetched live from Yahoo so the dashboard
    // reflects real-time prices on every load instead of a stale 5-min window.
    result = await yahooFinance.quote(ticker)
  } catch (error) {
    if (cached?.data) return cached.data
    throw error
  }
  const f = taFactor(ticker)
    
    const live = {
        postMarketPrice: result.postMarketPrice != null ? result.postMarketPrice / f : null,
        postMarketChange: result.postMarketChange != null ? result.postMarketChange / f : null,
        postMarketChangePercent: result.postMarketChangePercent ?? null,
        postMarketTime: result.postMarketTime ?? null,
        preMarketPrice: result.preMarketPrice != null ? result.preMarketPrice / f : null,
        preMarketChange: result.preMarketChange != null ? result.preMarketChange / f : null,
        preMarketChangePercent: result.preMarketChangePercent ?? null,
        preMarketTime: result.preMarketTime ?? null,
    }
    
    // Capture any fresh extended-hours values for later, and pull the last-seen
    // snapshot so we can expose it when Yahoo has dropped the live fields.
    saveExtendedSnapshot(ticker, live)
    const snapshot = (await loadExtendedSnapshot(ticker)) || {}

  const data = {
    ticker: result.symbol,
    name: result.shortName,
    price: result.regularMarketPrice / f,
    previousClose: (result.regularMarketPreviousClose ?? result.previousClose) / f,
    change: result.regularMarketChange / f,
    changePercent: result.regularMarketChangePercent,
    volume: result.regularMarketVolume,
    avgVolume: result.averageVolume ?? result.averageDailyVolume3Month ?? null,
    marketCap: result.marketCap != null ? result.marketCap / f : null,
    dayHigh: result.regularMarketDayHigh / f,
    dayLow: result.regularMarketDayLow / f,
    open: result.regularMarketOpen / f,
    week52High: result.fiftyTwoWeekHigh / f,
    week52Low: result.fiftyTwoWeekLow / f,
    pe: result.trailingPE,
    dividendRate: result.trailingAnnualDividendRate ?? result.dividendRate ?? null,
    dividendYield: result.trailingAnnualDividendYield ?? result.dividendYield ?? null,
    marketState: result.marketState || null,
    regularMarketTime: result.regularMarketTime ?? null,
      ...live,
      // Last-seen extended-hours values, retained across regular hours. Falls back
      // to live when present so consumers can always read these.
      lastPostMarketPrice: live.postMarketPrice ?? snapshot.postMarketPrice ?? null,
      lastPostMarketChange: live.postMarketChange ?? snapshot.postMarketChange ?? null,
      lastPostMarketChangePercent: live.postMarketChangePercent ?? snapshot.postMarketChangePercent ?? null,
      lastPostMarketTime: live.postMarketTime ?? snapshot.postMarketTime ?? null,
      lastPreMarketPrice: live.preMarketPrice ?? snapshot.preMarketPrice ?? null,
      lastPreMarketChange: live.preMarketChange ?? snapshot.preMarketChange ?? null,
      lastPreMarketChangePercent: live.preMarketChangePercent ?? snapshot.preMarketChangePercent ?? null,
      lastPreMarketTime: live.preMarketTime ?? snapshot.preMarketTime ?? null,
  }

  quoteCache.set(key, { data, ts: Date.now() })
  return data
}

async function getQuotes(tickers) {
    return Promise.all(tickers.map((t) => getQuote(t).catch(() => null)))
}

async function getHistory(ticker, range = '3mo', points = null) {
  const key = historyCacheKey(ticker, range)
  const cached = historyCache.get(key)
  if (cached && Date.now() - cached.ts < historyCacheTtl(range)) return downsample(cached.data, points)

  const fmt = (d) => d.toISOString().split('T')[0]
  const endDate = new Date()
  const startDate = new Date()

  try {
  // 1d uses chart() with 5m intervals for intraday
  if (range === '1d') {
    startDate.setDate(startDate.getDate() - 7)
    const result = await yahooFinance.chart(ticker, {
      period1: fmt(startDate),
      period2: fmt(new Date(endDate.getTime() + 86400000)),
      interval: '5m',
      includePrePost: true,
    })
    const f = taFactor(ticker)
    const quotes = result?.quotes || []
    const rows = quotes
      .filter((r) => r && r.close != null)
      .map((r) => ({
        date: r.date,
        open: r.open / f,
        high: r.high / f,
        low: r.low / f,
        close: r.close / f,
        volume: r.volume,
      }))
    const full = selectIntradayRows(rows, ticker)
    historyCache.set(key, { data: full, ts: Date.now() })
    return downsample(full, points)
  }

  const f = taFactor(ticker)
  if (range === '5d') {
    startDate.setDate(startDate.getDate() - 7)
    const result = await yahooFinance.chart(ticker, {
      period1: fmt(startDate),
      period2: fmt(new Date(endDate.getTime() + 86400000)),
      interval: '30m',
      includePrePost: false,
    })
    const quotes = result?.quotes || []
    const full = quotes
      .filter((r) => r && r.close != null)
      .map((r) => ({
        date: r.date,
        open: r.open / f,
        high: r.high / f,
        low: r.low / f,
        close: r.close / f,
        volume: r.volume,
      }))
    historyCache.set(key, { data: full, ts: Date.now() })
    return downsample(full, points)
  }

  // 'max' fetches the ticker's entire available history (no day cap) — used
  // for the portfolio's "All" range so it isn't clipped to a fixed window.
  const rangeMap = { '1mo': 30, '3mo': 90, '6mo': 180, '1y': 365, '5y': 365 * 5 }
  const days = range === 'max' ? null : (rangeMap[range] || 90)
  if (days) startDate.setDate(startDate.getDate() - days)
  else startDate.setFullYear(startDate.getFullYear() - 50) // effectively "since listing"

  // historical() is deprecated/removed by Yahoo and throws on split-adjusted
  // tickers with null rows (e.g. NVDA). Use chart() — its supported replacement.
  const result = await yahooFinance.chart(ticker, {
    period1: fmt(startDate),
    period2: fmt(endDate),
    interval: '1d',
  })

  const quotes = result?.quotes || []
  const full = quotes
      .filter((r) => r && r.close != null)
      .map((r) => ({
        date: r.date,
        open: r.open / f,
        high: r.high / f,
        low: r.low / f,
        close: r.close / f,
        volume: r.volume,
      }))
  historyCache.set(key, { data: full, ts: Date.now() })
  return downsample(full, points)
  } catch (error) {
    if (cached?.data) return downsample(cached.data, points)
    throw error
  }
}

async function searchTicker(query) {
  const results = await yahooFinance.search(query)
  return (results.quotes || [])
      .filter((q) => (q.quoteType === 'EQUITY' || q.quoteType === 'CRYPTOCURRENCY') && q.symbol)
    .slice(0, 8)
      .map((q) => ({
        ticker: q.symbol,
        name: q.shortname || q.longname,
        type: q.quoteType === 'CRYPTOCURRENCY' ? 'crypto' : 'equity',
        sector: cleanProfileValue(q.sectorDisp || q.sector),
        industry: cleanProfileValue(q.industryDisp || q.industry),
      }))
}

async function getTickerProfile(ticker, fallbackName = null) {
  const symbol = ticker.toUpperCase()
  const cached = profileCache.get(symbol)
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data
  
  let profile = {
    companyName: cleanProfileValue(fallbackName),
    sector: null,
    industry: null,
  }
  
  try {
    const summary = await yahooFinance.quoteSummary(symbol, {
      modules: ['price', 'assetProfile', 'summaryProfile'],
    })
    profile = {
      companyName: cleanProfileValue(
          summary?.price?.shortName ||
          summary?.price?.longName ||
          fallbackName
      ),
      sector: cleanProfileValue(
          summary?.assetProfile?.sectorDisp ||
          summary?.assetProfile?.sector ||
          summary?.summaryProfile?.sectorDisp ||
          summary?.summaryProfile?.sector
      ),
      industry: cleanProfileValue(
          summary?.assetProfile?.industryDisp ||
          summary?.assetProfile?.industry ||
          summary?.summaryProfile?.industryDisp ||
          summary?.summaryProfile?.industry
      ),
    }
  } catch {
    try {
      const q = await getQuote(symbol)
      profile.companyName = cleanProfileValue(q?.name) || cleanProfileValue(fallbackName)
    } catch {
    }
  }
  
  profileCache.set(symbol, {data: profile, ts: Date.now()})
  return profile
}

function invalidateCache(ticker) {
  const symbol = ticker.toUpperCase()
  quoteCache.delete(symbol)
  profileCache.delete(symbol)
  for (const key of historyCache.keys()) {
    if (key.startsWith(`${symbol}:`)) historyCache.delete(key)
  }
}

// ── Global market indices ──
const MARKET_GROUPS = {
  US: [
    { symbol: '^GSPC', name: 'S&P 500' },
    { symbol: '^DJI', name: 'Dow 30' },
    { symbol: '^IXIC', name: 'Nasdaq' },
    { symbol: '^RUT', name: 'Russell 2000' },
    { symbol: '^VIX', name: 'VIX' },
    { symbol: 'GC=F', name: 'Gold' },
  ],
  Israel: [
    { symbol: '^TA125.TA', name: 'TA-125' },
    { symbol: '^TA35.TA', name: 'TA-35' },
    { symbol: '^TA90.TA', name: 'TA-90' },
    { symbol: 'POLI.TA', name: 'Bank Hapoalim' },
    { symbol: 'LUMI.TA', name: 'Bank Leumi' },
    { symbol: 'DSCT.TA', name: 'Discount Bank' },
    { symbol: 'TEVA.TA', name: 'Teva' },
    { symbol: 'TSEM.TA', name: 'Tower' },
    { symbol: 'ESLT.TA', name: 'Elbit Systems' },
    { symbol: 'NVMI.TA', name: 'Nova' },
    { symbol: 'ENLT.TA', name: 'Enlight' },
  ],
  Europe: [
    { symbol: '^FTSE', name: 'FTSE 100' },
    { symbol: '^GDAXI', name: 'DAX' },
    { symbol: '^FCHI', name: 'CAC 40' },
    { symbol: '^STOXX50E', name: 'Euro Stoxx 50' },
  ],
  Asia: [
    { symbol: '^N225', name: 'Nikkei 225' },
    { symbol: '^HSI', name: 'Hang Seng' },
    { symbol: '000001.SS', name: 'Shanghai' },
  ],
  Crypto: [
    { symbol: 'BTC-USD', name: 'Bitcoin' },
    { symbol: 'ETH-USD', name: 'Ethereum' },
    { symbol: 'SOL-USD', name: 'Solana' },
    { symbol: 'BNB-USD', name: 'BNB' },
  ],
}

let marketsCache = new Map() // group -> { data, ts }
const MARKETS_TTL = 5 * 60 * 1000

async function getMarkets(group = 'US') {
  const list = MARKET_GROUPS[group] || MARKET_GROUPS.US
  const cached = marketsCache.get(group)
  if (cached && Date.now() - cached.ts < MARKETS_TTL) return cached.data

  const symbols = list.map((m) => m.symbol)
  const [quotes, histories] = await Promise.all([
    Promise.all(symbols.map((s) => yahooFinance.quote(s).catch(() => null))),
    Promise.all(symbols.map((s) => getHistory(s, '5d', 30).catch(() => []))),
  ])

  const data = list.map((m, i) => {
    const q = quotes[i]
    return {
      symbol: m.symbol,
      name: m.name,
      price: q?.regularMarketPrice ?? null,
      change: q?.regularMarketChange ?? null,
      changePercent: q?.regularMarketChangePercent ?? null,
      history: (histories[i] || []).map((h) => ({ close: h.close })),
    }
  })

  marketsCache.set(group, { data, ts: Date.now() })
  return data
}

const MARKET_GROUP_NAMES = Object.keys(MARKET_GROUPS)

// ── Trending tickers ──
const TRENDING_GROUP_NAMES = ['US', 'Israel', 'Israel Tech', 'Crypto']
// Yahoo doesn't surface "trending" crypto, so use top coins by activity.
const TRENDING_CRYPTO = ['BTC-USD', 'ETH-USD', 'SOL-USD', 'XRP-USD', 'BNB-USD', 'DOGE-USD', 'ADA-USD', 'AVAX-USD']
const TRENDING_ISRAEL = ['LUMI.TA', 'POLI.TA', 'DSCT.TA', 'TEVA.TA', 'TSEM.TA', 'ESLT.TA', 'NVMI.TA', 'ENLT.TA']
const TRENDING_ISRAEL_TECH = ['CHKP', 'WIX', 'MNDY', 'NICE', 'TSEM', 'NVMI', 'CAMT', 'MBLY']

let trendingCache = new Map() // group -> { data, ts }
const TRENDING_TTL = 10 * 60 * 1000

async function getTrending(group = 'US') {
  const cached = trendingCache.get(group)
  if (cached && Date.now() - cached.ts < TRENDING_TTL) return cached.data

  let symbols = []
  if (group === 'Crypto') {
    symbols = TRENDING_CRYPTO
  } else if (group === 'Israel') {
    symbols = TRENDING_ISRAEL
  } else if (group === 'Israel Tech') {
    symbols = TRENDING_ISRAEL_TECH
  } else {
    try {
      const t = await yahooFinance.trendingSymbols('US', { count: 12 })
      symbols = (t.quotes || []).map((q) => q.symbol).filter(Boolean).slice(0, 8)
    } catch {
      symbols = []
    }
    if (!symbols.length) symbols = ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN', 'META']
  }

  const [quotes, histories] = await Promise.all([
    Promise.all(symbols.map((s) => yahooFinance.quote(s).catch(() => null))),
    Promise.all(symbols.map((s) => getHistory(s, '5d', 30).catch(() => []))),
  ])

  const data = symbols.map((s, i) => {
    const q = quotes[i]
    return {
      symbol: s,
      name: q?.shortName || q?.longName || s,
      price: q?.regularMarketPrice ?? null,
      change: q?.regularMarketChange ?? null,
      changePercent: q?.regularMarketChangePercent ?? null,
      history: (histories[i] || []).map((h) => ({ close: h.close })),
    }
  }).filter((d) => d.price != null)

  trendingCache.set(group, { data, ts: Date.now() })
  return data
}

let newsCache = new Map()
let articleCache = new Map()
const NEWS_TTL = 15 * 60 * 1000

const NEWS_TOPICS = {
  'for-you': { label: 'For You', yahooQuery: 'stock market news' },
  markets: { label: 'Markets', yahooQuery: 'stock market news' },
  tech: { label: 'Tech', industries: 'Technology', yahooQuery: 'technology stocks news' },
  financials: { label: 'Financials', industries: 'Financial', yahooQuery: 'financial stocks bank news' },
  crypto: { label: 'Crypto', symbols: 'BTC,ETH,SOL', yahooQuery: 'crypto market news' },
  energy: { label: 'Energy', industries: 'Energy', yahooQuery: 'energy stocks oil news' },
  israel: { label: 'Israel', countries: 'il', yahooQuery: 'Israel market stocks news' },
  positive: { label: 'Positive', sentiment_gte: '0', yahooQuery: 'positive stock market news' },
}

function getNewsTopic(topic) {
  return NEWS_TOPICS[topic] ? topic : 'markets'
}

function articleId(url) {
  return crypto.createHash('sha1').update(url || '').digest('hex')
}

function topicTag(topicKey) {
  return NEWS_TOPICS[topicKey]?.label || 'Markets'
}

function withArticleIds(articles, provider) {
  return articles.map((article) => ({
    ...article,
    id: article.id || articleId(article.url),
    provider,
  }))
}

function withTopicTags(articles, topicKey) {
  const label = topicTag(topicKey)
  return articles.map((article) => ({
    ...article,
    tags: Array.from(new Set([...(article.tags || []), label])),
  }))
}

function logNews(message, meta = {}) {
  console.log(`[news] ${message}`, meta)
}

function rememberArticles(articles) {
  const now = Date.now()
  articles.forEach((article) => {
    if (article.id) articleCache.set(article.id, { article, ts: now })
  })
}

function getNewsArticle(id) {
  const cached = articleCache.get(id)
  if (!cached || Date.now() - cached.ts > NEWS_TTL) return null
  return cached.article
}

function normalizeYahooArticle(article) {
  const resolutions = article.thumbnail?.resolutions || []
  const image = resolutions[resolutions.length - 1]?.url || article.thumbnail?.url || null
  return {
    title: article.title,
    url: article.link,
    image,
    source: article.publisher,
    summary: article.summary || null,
    symbols: [],
    tags: [],
    publishedAt: article.providerPublishTime
      ? new Date(article.providerPublishTime * 1000).toISOString()
      : null,
  }
}

function normalizeFinnhubArticle(article) {
  return {
    title: article.headline,
    url: article.url,
    image: article.image || null,
    source: article.source,
    summary: article.summary || null,
    symbols: [],
    tags: [],
    publishedAt: article.datetime
      ? new Date(article.datetime * 1000).toISOString()
      : null,
  }
}

function normalizeMarketauxArticle(article) {
  return {
    title: article.title,
    url: article.url,
    image: article.image_url || null,
    source: article.source,
    summary: article.description || article.snippet || null,
    symbols: (article.entities || [])
      .map((entity) => entity.symbol)
      .filter(Boolean)
      .slice(0, 4),
    tags: [],
    publishedAt: article.published_at || null,
  }
}

async function getFinnhubNews(limit, topicKey) {
  if (!process.env.FINNHUB_API_KEY) return { articles: [], provider: null }

  const url = new URL('https://finnhub.io/api/v1/news')
  url.searchParams.set('category', topicKey === 'crypto' ? 'crypto' : 'general')
  url.searchParams.set('token', process.env.FINNHUB_API_KEY)

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Finnhub news request failed (${res.status})`)

  const data = await res.json()
  const articles = (Array.isArray(data) ? data : [])
    .map(normalizeFinnhubArticle)
    .filter((article) => article.title && article.url)
    .slice(0, limit)
  return { articles: withArticleIds(withTopicTags(articles, topicKey), 'finnhub'), provider: 'finnhub' }
}

async function getMarketauxNews(limit, topicKey, page = 1, symbols = []) {
  if (!process.env.MARKETAUX_API_TOKEN) return { articles: [], provider: null }

  const topic = NEWS_TOPICS[topicKey]
  const url = new URL('https://api.marketaux.com/v1/news/all')
  url.searchParams.set('api_token', process.env.MARKETAUX_API_TOKEN)
  url.searchParams.set('language', 'en')
  url.searchParams.set('filter_entities', 'true')
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('page', String(page))
  if (topic.industries) url.searchParams.set('industries', topic.industries)
  if (topic.countries) url.searchParams.set('countries', topic.countries)
  if (symbols.length) url.searchParams.set('symbols', symbols.join(','))
  else if (topic.symbols) url.searchParams.set('symbols', topic.symbols)
  if (topic.sentiment_gte) url.searchParams.set('sentiment_gte', topic.sentiment_gte)

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Marketaux news request failed (${res.status})`)

  const data = await res.json()
  const articles = (Array.isArray(data.data) ? data.data : [])
    .map(normalizeMarketauxArticle)
    .filter((article) => article.title && article.url)
    .slice(0, limit)
  return { articles: withArticleIds(withTopicTags(articles, topicKey), 'marketaux'), provider: 'marketaux' }
}

async function getYahooNews(limit, topicKey) {
  const result = await yahooFinance.search(NEWS_TOPICS[topicKey].yahooQuery)
  const articles = (result.news || [])
    .map(normalizeYahooArticle)
    .filter((article) => article.title && article.url)
    .slice(0, limit)
  return { articles: withArticleIds(withTopicTags(articles, topicKey), 'yahoo'), provider: 'yahoo' }
}

function paginateArticles(articles, pageNumber, pageSize) {
  const start = (pageNumber - 1) * pageSize
  return articles.slice(start, start + pageSize)
}

async function getMarketNews(limit = 4, topic = 'markets', page = 1, options = {}) {
  const cappedLimit = Math.max(1, Math.min(Number(limit) || 4, 24))
  const pageNumber = Math.max(1, Math.floor(Number(page) || 1))
  const topicKey = getNewsTopic(topic)
  const symbols = Array.isArray(options.symbols) ? options.symbols.filter(Boolean).slice(0, 20) : []
  const cacheKey = `${topicKey}:${symbols.join(',')}:${cappedLimit}:${pageNumber}`
  const pooledCacheKey = `${topicKey}:${symbols.join(',')}:pooled`
  const cached = newsCache.get(cacheKey)
  if (cached?.data.length && Date.now() - cached.ts < NEWS_TTL) {
    const articles = cached.data.slice(0, cappedLimit)
    rememberArticles(articles)
    logNews('page cache hit', {
      topicKey,
      pageNumber,
      provider: cached.provider,
      count: articles.length,
      hasMore: Boolean(cached.hasMore),
    })
    return {
      articles,
      page: pageNumber,
      provider: cached.provider,
      hasMore: Boolean(cached.hasMore),
    }
  }

  const pooled = newsCache.get(pooledCacheKey)
  if (pooled?.data?.length && Date.now() - pooled.ts < NEWS_TTL) {
    const articles = paginateArticles(pooled.data, pageNumber, cappedLimit)
    rememberArticles(articles)
    logNews('pooled cache hit', {
      topicKey,
      pageNumber,
      provider: pooled.provider,
      count: articles.length,
      pooledCount: pooled.data.length,
      hasMore: pageNumber * cappedLimit < pooled.data.length,
    })
    return {
      articles,
      page: pageNumber,
      provider: pooled.provider,
      hasMore: pageNumber * cappedLimit < pooled.data.length,
    }
  }

  let data = []
  let provider = null
  try {
    const result = await getMarketauxNews(cappedLimit, topicKey, pageNumber, symbols)
    data = result.articles
    provider = result.provider
    logNews('provider result', {
      provider: result.provider,
      topicKey,
      pageNumber,
      count: data.length,
    })
  } catch {}

  if (!data.length) {
    try {
      const pooledLimit = Math.min(24, Math.max(cappedLimit * 4, cappedLimit))
      const result = await getFinnhubNews(pooledLimit, topicKey)
      if (result.articles.length) {
        newsCache.set(pooledCacheKey, { data: result.articles, provider: result.provider, ts: Date.now() })
        data = paginateArticles(result.articles, pageNumber, cappedLimit)
        provider = result.provider
      }
      logNews('provider result', {
        provider: result.provider,
        topicKey,
        pageNumber,
        count: data.length,
        pooledCount: result.articles.length,
      })
    } catch {}
  }

  if (!data.length) {
    try {
      const pooledLimit = Math.min(24, Math.max(cappedLimit * 4, cappedLimit))
      const result = await getYahooNews(pooledLimit, topicKey)
      if (result.articles.length) {
        newsCache.set(pooledCacheKey, { data: result.articles, provider: result.provider, ts: Date.now() })
        data = paginateArticles(result.articles, pageNumber, cappedLimit)
        provider = result.provider
      }
      logNews('provider result', {
        provider: result.provider,
        topicKey,
        pageNumber,
        count: data.length,
        pooledCount: result.articles.length,
      })
    } catch {}
  }

  const hasMore = provider === 'marketaux'
    ? data.length === cappedLimit
    : pageNumber * cappedLimit < (newsCache.get(pooledCacheKey)?.data?.length || data.length)

  newsCache.set(cacheKey, { data, provider, hasMore, ts: Date.now() })
  rememberArticles(data)
  logNews('response built', {
    topicKey,
    pageNumber,
    provider,
    count: data.length,
    hasMore,
  })
  return {
    articles: data,
    page: pageNumber,
    provider,
    hasMore,
  }
}

let fxCache = { rate: null, ts: 0 }
const FX_TTL = 60 * 60 * 1000 // 1 hour

async function getIlsToUsd() {
  if (fxCache.rate && Date.now() - fxCache.ts < FX_TTL) return fxCache.rate
  try {
    const result = await yahooFinance.quote('ILS=X')
    const rate = result.regularMarketPrice // ILS per 1 USD → invert for ILS→USD
    fxCache = { rate: 1 / rate, ts: Date.now() }
    return fxCache.rate
  } catch {
    return fxCache.rate || 0.27 // fallback ~0.27 USD per ILS
  }
}

function isHistoryCached(ticker, range) {
  const key = historyCacheKey(ticker, range)
  const entry = historyCache.get(key)
  return !!(entry && Date.now() - entry.ts < historyCacheTtl(range))
}

module.exports = {
  getQuote,
  getQuotes,
  getHistory,
  isHistoryCached,
  searchTicker,
  getTickerProfile,
  invalidateCache,
  getIlsToUsd,
  getMarkets,
  MARKET_GROUP_NAMES,
  getTrending,
  TRENDING_GROUP_NAMES,
  getMarketNews,
  getNewsArticle,
  NEWS_TOPICS,
}
