const {
  getQuote,
  getQuotes,
  getHistory,
  isHistoryCached,
  searchTicker,
  getMarkets,
  MARKET_GROUP_NAMES,
  getTrending,
  TRENDING_GROUP_NAMES,
  getMarketNews,
  getNewsArticle,
  NEWS_TOPICS,
  getIlsToUsd,
} = require('../services/stockService')

const HISTORY_TTL_SECONDS = {
  '1d': 120,
  '5d': 600,
  '1wk': 600,
  '1mo': 3600,
  '3mo': 21600,
  '6mo': 21600,
  '1y': 21600,
  'max': 21600,
}
const Watchlist = require('../models/Watchlist')

exports.getMarkets = async (req, res) => {
  try {
    const group = req.query.group || 'US'
    const data = await getMarkets(group)
    res.json({ group, groups: MARKET_GROUP_NAMES, indices: data })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

exports.getTrending = async (req, res) => {
  try {
    const group = req.query.group || 'US'
    const data = await getTrending(group)
    res.json({ group, groups: TRENDING_GROUP_NAMES, items: data })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

exports.getMarketNews = async (req, res) => {
  try {
    const topic = NEWS_TOPICS[req.query.topic] ? req.query.topic : 'markets'
    let symbols = []
    let resolvedTopic = topic
    if (topic === 'for-you') {
      const watchlist = await Watchlist.find({ user: req.user._id }).sort({ addedAt: -1 }).limit(20)
      symbols = watchlist.map((item) => item.ticker).filter(Boolean)
      if (!symbols.length) resolvedTopic = 'markets'
    }
    console.log('[news] request', {
      topic,
      resolvedTopic,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || null,
      symbolCount: symbols.length,
    })
    const data = await getMarketNews(req.query.limit, resolvedTopic, req.query.page, { symbols, lang: req.query.lang })
    const articles = Array.isArray(data) ? data : data.articles || []
    const topics = Object.entries(NEWS_TOPICS).map(([value, config]) => ({
      value,
      label: config.label,
    }))
    console.log('[news] controller response', {
      topic,
      resolvedTopic,
      page: Array.isArray(data) ? Number(req.query.page) || 1 : data.page,
      provider: Array.isArray(data) ? null : data.provider,
      count: articles.length,
      hasMore: Array.isArray(data) ? false : Boolean(data.hasMore),
    })
    res.json({
      topic,
      resolvedTopic,
      topics,
      articles,
      page: Array.isArray(data) ? Number(req.query.page) || 1 : data.page,
      provider: Array.isArray(data) ? null : data.provider,
      hasMore: Array.isArray(data) ? false : Boolean(data.hasMore),
    })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

exports.getNewsArticle = async (req, res) => {
  try {
    const article = getNewsArticle(req.params.id)
    if (!article) return res.status(404).json({ message: 'Article not found in news cache' })
    res.json({ article })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

exports.getQuote = async (req, res) => {
  try {
    const data = await getQuote(req.params.ticker.toUpperCase())
    res.json(data)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

// Batch-validate tickers against Yahoo. Returns the set of symbols that
// actually resolve to a quote, so the importer can flag unknown ones.
exports.validateTickers = async (req, res) => {
  try {
    const raw = Array.isArray(req.body?.tickers) ? req.body.tickers : []
    const tickers = [...new Set(raw.map((t) => String(t || '').trim().toUpperCase()).filter(Boolean))]
    if (!tickers.length) return res.json({ valid: [] })

    // getQuotes returns an array of quote data (or null) aligned to `tickers`.
    const quotes = await getQuotes(tickers).catch(() => [])
    const valid = []
    quotes.forEach((data, i) => {
      if (data && data.price != null) valid.push(tickers[i].toUpperCase())
    })

    res.json({ valid: [...new Set(valid)] })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

// Default point caps per range — applied when the caller doesn't pass ?points.
// Keeps payloads reasonable without requiring every client to specify it.
const DEFAULT_POINTS = {
  '1d':  195,  // 5m bars, ~6.5h session
  '5d':  65,   // 30m bars, 5 sessions × 13 bars
  '1mo': 30,
  '3mo': 90,
  '6mo': 120,
  '1y':  252,
  'max': 500,
}

exports.getHistory = async (req, res) => {
  try {
    const {range = '1mo', points} = req.query
    const cap = Number(points)
    const pts = Number.isFinite(cap) && cap >= 2 ? Math.floor(cap) : (DEFAULT_POINTS[range] ?? 120)
    const ticker = req.params.ticker.toUpperCase()
    const hit = isHistoryCached(ticker, range)
    const ttl = HISTORY_TTL_SECONDS[range] ?? 21600
    const data = await getHistory(ticker, range, pts)
    res.set('X-Cache', hit ? 'HIT' : 'MISS')
    res.set('Cache-Control', `private, max-age=${ttl}`)
    res.json(data)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

exports.getIlsFx = async (req, res) => {
  try {
    const ilsToUsd = await getIlsToUsd()
    res.json({ ilsToUsd })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

exports.search = async (req, res) => {
  try {
    const { q } = req.query
    if (!q) return res.json([])
    const results = await searchTicker(q)
    res.json(results)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}
