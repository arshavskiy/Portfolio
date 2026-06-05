const { getQuote, getHistory, searchTicker, getMarkets, MARKET_GROUP_NAMES, getTrending, TRENDING_GROUP_NAMES } = require('../services/stockService')

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
