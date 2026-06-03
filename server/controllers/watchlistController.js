const Watchlist = require('../models/Watchlist')
const { getQuotes } = require('../services/stockService')

exports.getWatchlist = async (req, res) => {
  try {
    const items = await Watchlist.find({ user: req.user._id }).sort({ addedAt: -1 })
    if (!items.length) return res.json([])

    const tickers = items.map((i) => i.ticker)
    const quotes = await getQuotes(tickers)
    const quoteMap = {}
    quotes.forEach((q) => { if (q) quoteMap[q.ticker] = q })

    const enriched = items.map((item) => ({
      _id: item._id,
      ticker: item.ticker,
      companyName: item.companyName,
      addedAt: item.addedAt,
      ...(quoteMap[item.ticker] || {}),
    }))

    res.json(enriched)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

exports.addToWatchlist = async (req, res) => {
  try {
    const { ticker, companyName } = req.body
    if (!ticker) return res.status(400).json({ message: 'Ticker required' })

    const exists = await Watchlist.findOne({ user: req.user._id, ticker: ticker.toUpperCase() })
    if (exists) return res.status(409).json({ message: 'Already in watchlist' })

    const item = await Watchlist.create({
      user: req.user._id, ticker: ticker.toUpperCase(), companyName,
    })
    res.status(201).json(item)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

exports.removeFromWatchlist = async (req, res) => {
  try {
    const item = await Watchlist.findOne({ _id: req.params.id, user: req.user._id })
    if (!item) return res.status(404).json({ message: 'Not found' })
    await item.deleteOne()
    res.json({ message: 'Removed from watchlist' })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}
