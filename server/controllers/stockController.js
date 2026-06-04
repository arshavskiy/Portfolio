const { getQuote, getHistory, searchTicker, getMarkets, MARKET_GROUP_NAMES } = require('../services/stockService')

exports.getMarkets = async (req, res) => {
  try {
    const group = req.query.group || 'US'
    const data = await getMarkets(group)
    res.json({ group, groups: MARKET_GROUP_NAMES, indices: data })
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
    const { range = '3mo' } = req.query
    const data = await getHistory(req.params.ticker.toUpperCase(), range)
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
