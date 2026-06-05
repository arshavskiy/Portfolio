const {
  getQuote,
  getHistory,
  searchTicker,
  getMarkets,
  MARKET_GROUP_NAMES,
  getTrending,
  TRENDING_GROUP_NAMES,
  getMarketNews,
  getNewsArticle,
  NEWS_TOPICS,
} = require('../services/stockService')
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
    const data = await getMarketNews(req.query.limit, resolvedTopic, req.query.page, { symbols })
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

exports.getHistory = async (req, res) => {
  try {
    const {range = '3mo', points} = req.query
    const cap = Number(points)
    const pts = Number.isFinite(cap) && cap >= 2 ? Math.floor(cap) : null
    const data = await getHistory(req.params.ticker.toUpperCase(), range, pts)
    res.json(data)
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
