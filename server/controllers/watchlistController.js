const Watchlist = require('../models/Watchlist')
const Position = require('../models/Position')
const {getQuotes, getHistory} = require('../services/stockService')

exports.getWatchlist = async (req, res) => {
  try {
      const range = ['1d', '5d', '1mo', '3mo', '6mo', '1y'].includes(req.query.range) ? req.query.range : '1mo'
    const items = await Watchlist.find({ user: req.user._id }).sort({ addedAt: -1 })
    if (!items.length) return res.json([])

    const tickers = items.map((i) => i.ticker)
      const [quotes, histories, positions] = await Promise.all([
          getQuotes(tickers),
          Promise.all(tickers.map((t) => getHistory(t, range).catch(() => []))),
          Position.find({user: req.user._id, ticker: {$in: tickers}}, 'ticker groups'),
      ])
    const quoteMap = {}
    quotes.forEach((q) => { if (q) quoteMap[q.ticker] = q })
      const historyMap = {}
      tickers.forEach((t, i) => {
          historyMap[t] = histories[i]
      })
      // Custom group tags come from the held position (if any).
      const groupsMap = {}
      positions.forEach((p) => {
          groupsMap[p.ticker] = p.groups || []
      })

    const enriched = items.map((item) => ({
      _id: item._id,
      ticker: item.ticker,
      companyName: item.companyName,
      addedAt: item.addedAt,
      ...(quoteMap[item.ticker] || {}),
        history: historyMap[item.ticker] || [],
        groups: groupsMap[item.ticker] || [],
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

exports.syncHoldings = async (req, res) => {
    try {
        const Position = require('../models/Position')
        const positions = await Position.find({user: req.user._id})
        if (!positions.length) return res.json({synced: 0})
        
        await Promise.all(
            positions.map((p) =>
                Watchlist.findOneAndUpdate(
                    {user: req.user._id, ticker: p.ticker},
                    {$setOnInsert: {user: req.user._id, ticker: p.ticker, companyName: p.companyName || p.ticker}},
                    {upsert: true, new: true}
                )
            )
        )
        
        res.json({synced: positions.length})
    } catch (err) {
        res.status(500).json({message: err.message})
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
