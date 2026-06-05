const YahooFinance = require('yahoo-finance2').default
const crypto = require('crypto')
const yahooFinance = new YahooFinance()

const quoteCache = new Map()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

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

async function getQuote(ticker) {
  const cached = quoteCache.get(ticker)
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data

  const result = await yahooFinance.quote(ticker)
  const f = taFactor(ticker)

  const data = {
    ticker: result.symbol,
    name: result.shortName,
    price: result.regularMarketPrice / f,
    change: result.regularMarketChange / f,
    changePercent: result.regularMarketChangePercent,
    volume: result.regularMarketVolume,
    marketCap: result.marketCap != null ? result.marketCap / f : null,
    dayHigh: result.regularMarketDayHigh / f,
    dayLow: result.regularMarketDayLow / f,
    open: result.regularMarketOpen / f,
    week52High: result.fiftyTwoWeekHigh / f,
    week52Low: result.fiftyTwoWeekLow / f,
    pe: result.trailingPE,
  }

  quoteCache.set(ticker, { data, ts: Date.now() })
  return data
}

async function getQuotes(tickers) {
  return Promise.all(tickers.map((t) => getQuote(t).catch(() => null)))
}

async function getHistory(ticker, range = '3mo', points = null) {
  const fmt = (d) => d.toISOString().split('T')[0]
  const endDate = new Date()
  const startDate = new Date()

  // 1d uses chart() with 5m intervals for intraday
  if (range === '1d') {
    const result = await yahooFinance.chart(ticker, {
      period1: fmt(startDate),
      period2: fmt(new Date(endDate.getTime() + 86400000)),
      interval: '5m',
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
    return downsample(rows, points)
  }

  const f = taFactor(ticker)
  const rangeMap = { '5d': 5, '1mo': 30, '3mo': 90, '6mo': 180, '1y': 365 }
  const days = rangeMap[range] || 90
  startDate.setDate(startDate.getDate() - days)
  
  // historical() is deprecated/removed by Yahoo and throws on split-adjusted
  // tickers with null rows (e.g. NVDA). Use chart() — its supported replacement.
  const result = await yahooFinance.chart(ticker, {
    period1: fmt(startDate),
    period2: fmt(endDate),
    interval: '1d',
  })
  
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
  return downsample(rows, points)
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
      }))
}

function invalidateCache(ticker) {
  quoteCache.delete(ticker.toUpperCase())
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
    { symbol: '^TA125.TA', name: 'TA-125' },
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
const TRENDING_GROUP_NAMES = ['US', 'Crypto']
// Yahoo doesn't surface "trending" crypto, so use top coins by activity.
const TRENDING_CRYPTO = ['BTC-USD', 'ETH-USD', 'SOL-USD', 'XRP-USD', 'BNB-USD', 'DOGE-USD', 'ADA-USD', 'AVAX-USD']

let trendingCache = new Map() // group -> { data, ts }
const TRENDING_TTL = 10 * 60 * 1000

async function getTrending(group = 'US') {
  const cached = trendingCache.get(group)
  if (cached && Date.now() - cached.ts < TRENDING_TTL) return cached.data

  let symbols = []
  if (group === 'Crypto') {
    symbols = TRENDING_CRYPTO
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

function withArticleIds(articles, provider) {
  return articles.map((article) => ({
    ...article,
    id: article.id || articleId(article.url),
    provider,
  }))
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
    publishedAt: article.published_at || null,
  }
}

async function getFinnhubNews(limit, topicKey, page = 1) {
  if (!process.env.FINNHUB_API_KEY) return { articles: [], provider: null }
  if (page > 1) return { articles: [], provider: null }

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
  return { articles: withArticleIds(articles, 'finnhub'), provider: 'finnhub' }
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
  return { articles: withArticleIds(articles, 'marketaux'), provider: 'marketaux' }
}

async function getYahooNews(limit, topicKey, page = 1) {
  if (page > 1) return { articles: [], provider: null }
  const result = await yahooFinance.search(NEWS_TOPICS[topicKey].yahooQuery)
  const articles = (result.news || [])
    .map(normalizeYahooArticle)
    .filter((article) => article.title && article.url)
    .slice(0, limit)
  return { articles: withArticleIds(articles, 'yahoo'), provider: 'yahoo' }
}

async function getMarketNews(limit = 4, topic = 'markets', page = 1, options = {}) {
  const cappedLimit = Math.max(1, Math.min(Number(limit) || 4, 24))
  const pageNumber = Math.max(1, Math.floor(Number(page) || 1))
  const topicKey = getNewsTopic(topic)
  const symbols = Array.isArray(options.symbols) ? options.symbols.filter(Boolean).slice(0, 20) : []
  const cacheKey = `${topicKey}:${symbols.join(',')}:${cappedLimit}:${pageNumber}`
  const cached = newsCache.get(cacheKey)
  if (cached?.data.length && Date.now() - cached.ts < NEWS_TTL) {
    const articles = cached.data.slice(0, cappedLimit)
    rememberArticles(articles)
    return {
      articles,
      page: pageNumber,
      provider: cached.provider,
      hasMore: cached.provider === 'marketaux' && articles.length > 0,
    }
  }

  let data = []
  let provider = null
  try {
    const result = await getMarketauxNews(cappedLimit, topicKey, pageNumber, symbols)
    data = result.articles
    provider = result.provider
  } catch {}

  if (!data.length) {
    try {
      const result = await getFinnhubNews(cappedLimit, topicKey, pageNumber)
      data = result.articles
      provider = result.provider
    } catch {}
  }

  if (!data.length) {
    try {
      const result = await getYahooNews(cappedLimit, topicKey, pageNumber)
      data = result.articles
      provider = result.provider
    } catch {}
  }

  newsCache.set(cacheKey, { data, provider, ts: Date.now() })
  rememberArticles(data)
  return {
    articles: data,
    page: pageNumber,
    provider,
    hasMore: provider === 'marketaux' && data.length > 0,
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

module.exports = {
  getQuote,
  getQuotes,
  getHistory,
  searchTicker,
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
