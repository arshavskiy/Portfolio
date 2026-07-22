const Watchlist = require('../models/Watchlist')
const Position = require('../models/Position')
const {getQuotes, getHistory, getTickerProfile, mapWithConcurrency} = require('../services/stockService')
const {getInsiderSnapshots} = require('../services/stockfolioInsightsService')

// Yahoo's chart() endpoint is the slowest call we make per-ticker (intraday
// especially); firing 100+ of them via Promise.all floods the connection
// pool and ends up throttled anyway, so cap how many run at once.
const HISTORY_CONCURRENCY = 12

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

// Any held position that has no matching Watchlist doc is surfaced as a
// synthetic held row so holdings can never go invisible on the watchlist page.
// `synthetic: true` flags these to the client (no doc to remove, position drives it).
async function heldOnlyRows(userId, watchedTickers) {
  const positions = await Position.find({user: userId}).lean()
  const seen = new Set(watchedTickers.map((t) => String(t).toUpperCase()))
  return positions
    .filter((p) => !seen.has(String(p.ticker).toUpperCase()))
    .map((p) => ({
      _id: `held:${p._id}`,
      ticker: p.ticker,
      companyName: p.companyName || p.ticker,
      sector: p.sector || null,
      industry: p.industry || null,
      addedAt: p.createdAt || p.updatedAt || null,
      groups: normalizeGroups(p.groups || []),
      synthetic: true,
    }))
}

exports.getWatchlist = async (req, res) => {
  try {
      const range = ['1d', '5d', '1mo', '3mo', '6mo', '1y'].includes(req.query.range) ? req.query.range : '1mo'
      const detailPoints = range === '1d' ? 60 : 50
    const watched = await Watchlist.find({ user: req.user._id }).sort({ addedAt: -1 })
    const held = await heldOnlyRows(req.user._id, watched.map((i) => i.ticker))
    const items = [
      ...watched.map((i) => ({
        _id: i._id,
        ticker: i.ticker,
        companyName: i.companyName,
        sector: i.sector || null,
        industry: i.industry || null,
        addedAt: i.addedAt,
        groups: normalizeGroups(i.groups || []),
      })),
      ...held,
    ]
    if (!items.length) return res.json([])

    const tickers = items.map((i) => i.ticker)
      const [quotes, histories, insiderMap] = await Promise.all([
          getQuotes(tickers),
          mapWithConcurrency(tickers, HISTORY_CONCURRENCY, (t) => getHistory(t, range, detailPoints).catch(() => [])),
          getInsiderSnapshots(tickers).catch(() => ({})),
      ])
    const quoteMap = {}
    quotes.forEach((q) => { if (q) quoteMap[q.ticker] = q })
      const historyMap = {}
      tickers.forEach((t, i) => {
          historyMap[t] = histories[i]
      })
    const enriched = items.map((item) => ({
      ...item,
      ...(quoteMap[item.ticker] || {}),
      history: historyMap[item.ticker] || [],
      insiderNet3m: insiderMap[item.ticker.toUpperCase()]?.insiderNet3m ?? null,
      insiderSignal: insiderMap[item.ticker.toUpperCase()]?.insiderSignal ?? null,
    }))

    res.json(enriched)
  } catch (err) {
      res.status(500).json({message: err.message})
  }
}

exports.getWatchlistSkeleton = async (req, res) => {
  try {
    const watched = await Watchlist.find({user: req.user._id}).sort({addedAt: -1}).lean()
    const held = await heldOnlyRows(req.user._id, watched.map((i) => i.ticker))
    const rows = [
      ...watched.map((item) => ({
        _id: item._id,
        ticker: item.ticker,
        companyName: item.companyName,
        sector: item.sector || null,
        industry: item.industry || null,
        addedAt: item.addedAt,
        groups: normalizeGroups(item.groups || []),
      })),
      ...held,
    ].map((item) => ({...item, history: []}))
    res.json(rows)
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
