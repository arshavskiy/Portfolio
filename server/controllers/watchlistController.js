const Watchlist = require('../models/Watchlist')
const Position = require('../models/Position')
const {getQuotes, getHistory, getTickerProfile} = require('../services/stockService')

function normalizeGroups(groups) {
  if (!Array.isArray(groups)) return []
  const seen = new Set()
  const out = []
  for (const g of groups) {
    if (typeof g !== 'string') continue
    const tag = g.trim().slice(0, 30)
    if (!tag) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(tag)
    if (out.length >= 10) break
  }
  return out
}

exports.getWatchlist = async (req, res) => {
  try {
      const range = ['1d', '5d', '1mo', '3mo', '6mo', '1y'].includes(req.query.range) ? req.query.range : '1mo'
      const detailPoints = range === '1d' ? 20 : 15
    const items = await Watchlist.find({ user: req.user._id }).sort({ addedAt: -1 })
    if (!items.length) return res.json([])

    const tickers = items.map((i) => i.ticker)
      const [quotes, histories] = await Promise.all([
          getQuotes(tickers),
          Promise.all(tickers.map((t) => getHistory(t, range, detailPoints).catch(() => []))),
      ])
    const quoteMap = {}
    quotes.forEach((q) => { if (q) quoteMap[q.ticker] = q })
      const historyMap = {}
      tickers.forEach((t, i) => {
          historyMap[t] = histories[i]
      })
    const enriched = items.map((item) => ({
      _id: item._id,
      ticker: item.ticker,
      companyName: item.companyName,
      sector: item.sector || null,
      industry: item.industry || null,
      addedAt: item.addedAt,
      ...(quoteMap[item.ticker] || {}),
      history: historyMap[item.ticker] || [],
      groups: normalizeGroups(item.groups || []),
    }))

    res.json(enriched)
  } catch (err) {
      res.status(500).json({message: err.message})
  }
}

exports.getWatchlistItem = async (req, res) => {
    try {
        const ticker = req.params.ticker.toUpperCase()
        const item = await Watchlist.findOne({user: req.user._id, ticker}).lean()
        res.json({
            item: item
                ? {
                    _id: item._id,
                    ticker: item.ticker,
                    companyName: item.companyName,
                    sector: item.sector || null,
                    industry: item.industry || null,
                    addedAt: item.addedAt,
                    groups: normalizeGroups(item.groups || []),
                }
                : null,
        })
  } catch (err) {
        res.status(500).json({message: err.message})
  }
}

exports.addToWatchlist = async (req, res) => {
  try {
    const { ticker, companyName } = req.body
    if (!ticker) return res.status(400).json({ message: 'Ticker required' })
      const symbol = ticker.toUpperCase()
      
      const exists = await Watchlist.findOne({user: req.user._id, ticker: symbol})
    if (exists) return res.status(409).json({ message: 'Already in watchlist' })
      
      const profile = await getTickerProfile(symbol, companyName)

    const item = await Watchlist.create({
      user: req.user._id,
      ticker: symbol,
      companyName: profile.companyName || companyName || symbol,
      sector: profile.sector,
      industry: profile.industry,
      groups: [],
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
                    {
                        $setOnInsert: {
                            user: req.user._id,
                            ticker: p.ticker,
                            companyName: p.companyName || p.ticker,
                            sector: p.sector || null,
                            industry: p.industry || null,
                            groups: p.groups || [],
                        },
                    },
                    {upsert: true, returnDocument: 'after'}
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

exports.updateWatchlistGroups = async (req, res) => {
  try {
    const item = await Watchlist.findOne({ _id: req.params.id, user: req.user._id })
    if (!item) return res.status(404).json({ message: 'Watchlist item not found' })
    item.groups = normalizeGroups(req.body.groups)
    await item.save()
    res.json({ _id: item._id, ticker: item.ticker, groups: item.groups })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}
