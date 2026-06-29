const Position = require('../models/Position')
const Transaction = require('../models/Transaction')
const FeeProfile = require('../models/FeeProfile')

// Transaction fee profile input is tri-state:
// undefined applies the default profile, null means explicit no-fee, ObjectId selects one.
// feeAmount stays in profile currency; totalWithFees/netProceeds convert it first.
const Watchlist = require('../models/Watchlist')
const {getQuotes, getTickerProfile, invalidateCache, getIlsToUsd} = require('../services/stockService')
const { computeTransactionCosts, getBuiltInFeeProfile } = require('./feeProfileController')
const {getPortfolioHistory} = require('../services/historyService')

// Recompute a position's shares + avg cost by replaying all of its transactions
// (avg-cost method). Deletes the position if no shares remain; creates nothing.
async function recomputePosition(userId, ticker) {
  const allTx = await Transaction.find({user: userId, ticker}).sort({date: 1})
  let totalShares = 0
  let totalCost = 0
  for (const t of allTx) {
    if (t.type === 'buy') {
      totalCost += t.shares * t.price
      totalShares += t.shares
    } else if (t.type === 'sell') {
      if (totalShares > 0) totalCost -= (totalCost / totalShares) * t.shares
      totalShares -= t.shares
    } else if (t.type === 'dividend' && t.drip && t.shares > 0) {
        // DRIP: shares added at the dividend price
        totalCost += t.shares * t.price
        totalShares += t.shares
    }
      // cash dividend: no position change
  }
  totalShares = Math.max(0, totalShares)
  
  const position = await Position.findOne({user: userId, ticker})
  if (!position) return
  if (totalShares <= 0) {
    await position.deleteOne()
  } else {
    position.shares = totalShares
    position.avgCost = totalCost / totalShares
    await position.save()
  }
}

// Normalize a list of group tags: trim, drop empties, cap length, dedupe
// case-insensitively (keeping first-seen casing), limit count.
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

function tickerCurrency(ticker) {
  return ticker?.toUpperCase().endsWith('.TA') ? 'ILS' : 'USD'
}

async function convertFeeToTransactionCurrency(amount, feeCurrency, transactionCurrency) {
  if (!amount || feeCurrency === transactionCurrency) return amount || 0
  const ilsToUsd = await getIlsToUsd()
  if (feeCurrency === 'ILS' && transactionCurrency === 'USD' && ilsToUsd > 0) return amount * ilsToUsd
  if (feeCurrency === 'USD' && transactionCurrency === 'ILS' && ilsToUsd > 0) return amount / ilsToUsd
  return amount || 0
}

async function findDefaultFeeProfile(userId, transactionCurrency) {
  async function preferredProfile(currency) {
    const profiles = await FeeProfile.find({ user: userId, currency }).sort({ isDefault: -1, createdAt: 1 })
    return profiles.find((p) => p.isDefault) || (profiles.length === 1 ? profiles[0] : null)
  }

  const exact = await preferredProfile(transactionCurrency)
  if (exact) return exact
  if (transactionCurrency === 'USD') {
    return preferredProfile('ILS')
  }
  return null
}

exports.getPortfolio = async (req, res) => {
  try {
    const positions = await Position.find({ user: req.user._id })
    if (!positions.length) return res.json({ positions: [], totals: [] })

    const tickers = positions.map((p) => p.ticker)
    const [quotes, ilsToUsd] = await Promise.all([getQuotes(tickers), getIlsToUsd()])
    const quoteMap = {}
    quotes.forEach((q) => { if (q) quoteMap[q.ticker] = q })

    const totals = {}
    let combinedValueUsd = 0
    let combinedCostUsd = 0
    let combinedDayPnlUsd = 0

    const enriched = positions.map((p) => {
      const q = quoteMap[p.ticker] || {}
      const currency = p.ticker.toUpperCase().endsWith('.TA') ? 'ILS' : 'USD'
      const fxRate = currency === 'ILS' ? ilsToUsd : 1
      const currentPrice = q.price || 0
      const value = currentPrice * p.shares
      const cost = p.avgCost * p.shares
      const pnl = value - cost
      const pnlPercent = cost > 0 ? (pnl / cost) * 100 : 0
      const dayPnl = (q.change || 0) * p.shares

      if (!totals[currency]) totals[currency] = { value: 0, cost: 0, dayPnl: 0 }
      totals[currency].value += value
      totals[currency].cost += cost
      totals[currency].dayPnl += dayPnl

      combinedValueUsd += value * fxRate
      combinedCostUsd += cost * fxRate
      combinedDayPnlUsd += dayPnl * fxRate

      return {
        _id: p._id,
        ticker: p.ticker,
        currency,
        companyName: q.name || p.companyName,
          sector: p.sector || null,
          industry: p.industry || null,
        shares: p.shares,
        avgCost: p.avgCost,
        currentPrice,
        value,
        cost,
        pnl,
        pnlPercent,
        change: q.change,
        changePercent: q.changePercent,
        marketState: q.marketState,
        postMarketPrice: q.postMarketPrice,
        postMarketChange: q.postMarketChange,
        postMarketChangePercent: q.postMarketChangePercent,
        preMarketPrice: q.preMarketPrice,
        preMarketChange: q.preMarketChange,
        preMarketChangePercent: q.preMarketChangePercent,
        lastPostMarketPrice: q.lastPostMarketPrice,
        lastPostMarketChange: q.lastPostMarketChange,
        lastPostMarketChangePercent: q.lastPostMarketChangePercent,
        lastPostMarketTime: q.lastPostMarketTime,
        lastPreMarketPrice: q.lastPreMarketPrice,
        lastPreMarketChange: q.lastPreMarketChange,
        lastPreMarketChangePercent: q.lastPreMarketChangePercent,
        lastPreMarketTime: q.lastPreMarketTime,
        dayPnl,
        valueUsd: value * fxRate,
        groups: p.groups || [],
        dividendRate: q.dividendRate ?? null,
        dividendYield: q.dividendYield ?? null,
      }
    })

    const totalsArray = Object.entries(totals).map(([currency, t]) => ({
      currency,
      value: t.value,
      cost: t.cost,
      pnl: t.value - t.cost,
      pnlPercent: t.cost > 0 ? ((t.value - t.cost) / t.cost) * 100 : 0,
      dayPnl: t.dayPnl,
      dayPnlPercent: t.value > 0 ? (t.dayPnl / (t.value - t.dayPnl)) * 100 : 0,
    }))

    const combinedUsd = {
      currency: 'USD',
      value: combinedValueUsd,
      cost: combinedCostUsd,
      pnl: combinedValueUsd - combinedCostUsd,
      pnlPercent: combinedCostUsd > 0 ? ((combinedValueUsd - combinedCostUsd) / combinedCostUsd) * 100 : 0,
      dayPnl: combinedDayPnlUsd,
      dayPnlPercent: combinedValueUsd > 0 ? (combinedDayPnlUsd / (combinedValueUsd - combinedDayPnlUsd)) * 100 : 0,
      ilsToUsd,
    }

    res.json({ positions: enriched, totals: totalsArray, combinedUsd })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

exports.getHistory = async (req, res) => {
    try {
        const range = req.query.range || '1mo'
        const points = await getPortfolioHistory(req.user._id, range)
        res.json(points)
    } catch (err) {
        res.status(500).json({message: err.message})
    }
}

exports.addTransaction = async (req, res) => {
  try {
      const {ticker, type, shares, price, date, notes, feeProfileId, groups, drip, total: clientTotal} = req.body
      if (!ticker || !type)
          return res.status(400).json({message: 'ticker and type required'})
      // Dividends: price = per-share dividend amount, shares = DRIP shares (or 0 for cash)
      if (type !== 'dividend' && (!shares || !price))
      return res.status(400).json({ message: 'ticker, type, shares, price required' })
      if (type === 'dividend' && !price)
          return res.status(400).json({message: 'price (dividend per share) required'})

    const normalizedGroups = normalizeGroups(groups)
      
      // For dividends, client computes total = amountPerShare * sharesHeld; use it directly.
      const total = type === 'dividend' ? (clientTotal || (shares || 0) * (price || 0)) : (shares * price)

    let feeProfile = null
    let feeAmount = 0
    let feeAmountForTotals = 0
    let taxAmount = 0
    if (feeProfileId) {
      feeProfile = getBuiltInFeeProfile(feeProfileId) ||
        await FeeProfile.findOne({ _id: feeProfileId, user: req.user._id })
    } else if (feeProfileId === undefined) {
      feeProfile = await findDefaultFeeProfile(req.user._id, tickerCurrency(ticker))
    }

    if (feeProfile) {
      // For sell tax, get current avg cost from position
      const pos = type === 'sell'
        ? await Position.findOne({ user: req.user._id, ticker: ticker.toUpperCase() })
        : null
      const avgCost = pos?.avgCost ?? null
      ;({ feeAmount, taxAmount } = computeTransactionCosts(feeProfile, type, total, shares, price, avgCost))
      feeAmountForTotals = await convertFeeToTransactionCurrency(feeAmount, feeProfile.currency || 'USD', tickerCurrency(ticker))
    }

    invalidateCache(ticker)
    const tx = await Transaction.create({
        user: req.user._id,
        ticker: ticker.toUpperCase(),
        type,
        shares: shares || 0,
        price: price || 0,
        total,
        date,
        notes,
        drip: type === 'dividend' ? Boolean(drip) : undefined,
        feeProfile: feeProfile?.builtin ? null : feeProfile?._id || null,
      feeAmount,
      taxAmount,
        totalWithFees: type === 'buy' ? total + feeAmountForTotals : (type === 'sell' ? total - feeAmountForTotals : total),
      netProceeds: type === 'sell' ? total - feeAmountForTotals - taxAmount : undefined,
    })

    let position = await Position.findOne({ user: req.user._id, ticker: ticker.toUpperCase() })
      const symbol = ticker.toUpperCase()
      const profile = (type === 'buy' || type === 'dividend') ? await getTickerProfile(symbol) : null

    if (type === 'buy') {
      if (position) {
        const newShares = position.shares + shares
        position.avgCost = (position.avgCost * position.shares + price * shares) / newShares
        position.shares = newShares
          position.companyName = position.companyName || profile?.companyName || symbol
          position.sector = position.sector || profile?.sector || null
          position.industry = position.industry || profile?.industry || null
        // Merge any newly provided tags into the existing position (union).
        if (normalizedGroups.length) {
          position.groups = normalizeGroups([...(position.groups || []), ...normalizedGroups])
        }
        await position.save()
      } else {
        position = await Position.create({
            user: req.user._id,
            ticker: symbol,
            companyName: profile?.companyName || symbol,
            sector: profile?.sector,
            industry: profile?.industry,
            shares,
            avgCost: price,
          groups: normalizedGroups,
        })
      }
      // Auto-add to watchlist if not already there
      await Watchlist.findOneAndUpdate(
          {user: req.user._id, ticker: symbol},
          {
              $setOnInsert: {
                  user: req.user._id,
                  ticker: symbol,
                  companyName: profile?.companyName || symbol,
                  sector: profile?.sector || null,
                  industry: profile?.industry || null,
              },
          },
        { upsert: true, returnDocument: 'after' }
      )
    } else if (type === 'sell') {
      if (!position || position.shares < shares)
        return res.status(400).json({ message: 'Insufficient shares' })
      position.shares -= shares
      if (position.shares === 0) {
        await position.deleteOne()
      } else {
        await position.save()
      }
    } else if (type === 'dividend') {
        if (drip && shares > 0 && position) {
            // DRIP: reinvest dividend as additional shares at the given price
            const newShares = position.shares + shares
            position.avgCost = (position.avgCost * position.shares + price * shares) / newShares
            position.shares = newShares
            position.companyName = position.companyName || profile?.companyName || symbol
            position.sector = position.sector || profile?.sector || null
            position.industry = position.industry || profile?.industry || null
            await position.save()
        }
        // Cash dividend: no position change; transaction is the record
    }

    res.status(201).json({ transaction: tx })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

exports.getTransactions = async (req, res) => {
  try {
    const { ticker, type, limit = 50, page = 1 } = req.query
    const filter = { user: req.user._id }
    if (ticker) filter.ticker = ticker.toUpperCase()
    if (type) filter.type = type

    const transactions = await Transaction.find(filter)
      .populate('feeProfile', 'name buyFee sellFee capitalGainsTax currency')
      .sort({ date: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))

    const total = await Transaction.countDocuments(filter)
    res.json({ transactions, total, page: Number(page), pages: Math.ceil(total / limit) })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

exports.updateTransaction = async (req, res) => {
  try {
    const tx = await Transaction.findOne({ _id: req.params.id, user: req.user._id })
    if (!tx) return res.status(404).json({ message: 'Transaction not found' })

    const { shares, price, date, notes, feeProfileId } = req.body

    let feeProfile = null
    let feeAmount = 0
    let feeAmountForTotals = 0
    let taxAmount = 0
    if (feeProfileId) {
      feeProfile = getBuiltInFeeProfile(feeProfileId) ||
        await FeeProfile.findOne({ _id: feeProfileId, user: req.user._id })
    } else if (feeProfileId === undefined) {
      feeProfile = await findDefaultFeeProfile(req.user._id, tickerCurrency(tx.ticker))
    }

    if (feeProfile) {
      const pos = tx.type === 'sell'
        ? await Position.findOne({ user: req.user._id, ticker: tx.ticker })
        : null
      ;({ feeAmount, taxAmount } = computeTransactionCosts(feeProfile, tx.type, shares * price, shares, price, pos?.avgCost ?? null))
      feeAmountForTotals = await convertFeeToTransactionCurrency(feeAmount, feeProfile.currency || 'USD', tickerCurrency(tx.ticker))
    }

    const total = shares * price
    tx.shares = shares
    tx.price = price
    tx.total = total
    tx.date = date || tx.date
    tx.notes = notes
    tx.feeProfile = feeProfile?.builtin ? null : feeProfile?._id || null
    tx.feeAmount = feeAmount
    tx.taxAmount = taxAmount
    tx.totalWithFees = tx.type === 'buy' ? total + feeAmountForTotals : total - feeAmountForTotals
    tx.netProceeds = tx.type === 'sell' ? total - feeAmountForTotals - taxAmount : undefined
    await tx.save()
    
    await recomputePosition(req.user._id, tx.ticker)
    invalidateCache(tx.ticker)
    res.json({ transaction: tx })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

exports.deleteTransaction = async (req, res) => {
  try {
    const tx = await Transaction.findOne({_id: req.params.id, user: req.user._id})
    if (!tx) return res.status(404).json({message: 'Transaction not found'})
    
    const ticker = tx.ticker
    await tx.deleteOne()
    await recomputePosition(req.user._id, ticker)
    invalidateCache(ticker)
    res.json({message: 'Transaction deleted'})
  } catch (err) {
    res.status(500).json({message: err.message})
  }
}

exports.deletePosition = async (req, res) => {
  try {
    const position = await Position.findOne({ _id: req.params.id, user: req.user._id })
    if (!position) return res.status(404).json({ message: 'Position not found' })
    await position.deleteOne()
    res.json({ message: 'Position removed' })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

// Distinct group tags across the user's positions (for the tag picker).
exports.getGroups = async (req, res) => {
  try {
    const [positionTags, watchlistTags] = await Promise.all([
      Position.distinct('groups', {user: req.user._id}),
      Watchlist.distinct('groups', {user: req.user._id}),
    ])
    const tags = [...new Set([...positionTags, ...watchlistTags].filter(Boolean))]
    res.json(tags.sort((a, b) => a.localeCompare(b)))
  } catch (err) {
    res.status(500).json({message: err.message})
  }
}

// Realized capital gains: replay all buys/sells per ticker (avg-cost method)
// to compute gain/loss on each sell, then group by year.
// Also includes dividends received per year for a complete income picture.
exports.getRealizedGains = async (req, res) => {
    try {
        const yearFilter = req.query.year ? Number(req.query.year) : null
        const allTx = await Transaction.find({user: req.user._id, type: {$in: ['buy', 'sell', 'dividend']}})
            .populate('feeProfile', 'name currency capitalGainsTax')
            .sort({date: 1})
        
        // Per-ticker running state: shares held + total cost basis
        const state = {}
        // Results: per sell event
        const sells = []
        
        for (const tx of allTx) {
            const t = tx.ticker
            if (!state[t]) state[t] = {shares: 0, cost: 0}
            
            if (tx.type === 'buy') {
                state[t].cost += tx.shares * tx.price
                state[t].shares += tx.shares
            } else if (tx.type === 'sell') {
                const avgCost = state[t].shares > 0 ? state[t].cost / state[t].shares : 0
                const costBasis = avgCost * tx.shares
                const proceeds = tx.total || tx.shares * tx.price
                const feePaid = tx.feeAmount || 0
                const taxPaid = tx.taxAmount || 0
                const grossGain = proceeds - costBasis
                const netGain = grossGain - feePaid - taxPaid
                
                sells.push({
                    _id: tx._id,
                    ticker: t,
                    date: tx.date,
                    shares: tx.shares,
                    price: tx.price,
                    proceeds,
                    costBasis,
                    avgCostAtSale: avgCost,
                    feePaid,
                    taxPaid,
                    grossGain,
                    netGain,
                    notes: tx.notes,
                })
                
                // Update running state
                state[t].cost -= costBasis
                state[t].shares -= tx.shares
                if (state[t].shares <= 0) {
                    state[t].shares = 0;
                    state[t].cost = 0
                }
            } else if (tx.type === 'dividend' && !tx.drip) {
                sells.push({
                    _id: tx._id,
                    ticker: t,
                    date: tx.date,
                    isDividend: true,
                    grossGain: tx.total || 0,
                    netGain: tx.total || 0,
                    notes: tx.notes,
                })
            }
        }
        
        // Group by year, then by ticker
        const byYear = {}
        for (const s of sells) {
            const year = new Date(s.date).getFullYear()
            if (yearFilter && year !== yearFilter) continue
            if (!byYear[year]) byYear[year] = {
                year,
                sells: [],
                dividends: [],
                totalGross: 0,
                totalNet: 0,
                totalDividends: 0
            }
            if (s.isDividend) {
                byYear[year].dividends.push(s)
                byYear[year].totalDividends += s.grossGain
            } else {
                byYear[year].sells.push(s)
                byYear[year].totalGross += s.grossGain
                byYear[year].totalNet += s.netGain
            }
        }
        
        // Sort years descending, events within each year descending by date
        const years = Object.values(byYear)
            .sort((a, b) => b.year - a.year)
            .map((y) => ({
                ...y,
                sells: y.sells.sort((a, b) => new Date(b.date) - new Date(a.date)),
                dividends: y.dividends.sort((a, b) => new Date(b.date) - new Date(a.date)),
            }))
        
        const availableYears = Object.keys(byYear).map(Number).sort((a, b) => b - a)
        res.json({years, availableYears})
    } catch (err) {
        res.status(500).json({message: err.message})
    }
}

// Dividend summary: total received per ticker + grand total, with DRIP flag.
exports.getDividendSummary = async (req, res) => {
    try {
        const dividends = await Transaction.find({user: req.user._id, type: 'dividend'}).sort({date: -1})
        const byTicker = {}
        for (const d of dividends) {
            const t = d.ticker
            if (!byTicker[t]) byTicker[t] = {ticker: t, total: 0, count: 0, drip: false, transactions: []}
            byTicker[t].total += d.total || 0
            byTicker[t].count++
            if (d.drip) byTicker[t].drip = true
            byTicker[t].transactions.push(d)
        }
        const positions = await Position.find({user: req.user._id})
        const posMap = Object.fromEntries(positions.map((p) => [p.ticker, p]))
        const summary = Object.values(byTicker).map((row) => ({
            ...row,
            shares: posMap[row.ticker]?.shares ?? null,
            avgCost: posMap[row.ticker]?.avgCost ?? null,
        }))
        const grandTotal = summary.reduce((s, r) => s + r.total, 0)
        res.json({summary, grandTotal})
    } catch (err) {
        res.status(500).json({message: err.message})
    }
}

// Replace a position's group tags.
exports.updatePositionGroups = async (req, res) => {
  try {
    const position = await Position.findOne({_id: req.params.id, user: req.user._id})
    if (!position) return res.status(404).json({message: 'Position not found'})
    position.groups = normalizeGroups(req.body.groups)
    await position.save()
    res.json({_id: position._id, ticker: position.ticker, groups: position.groups})
  } catch (err) {
    res.status(500).json({message: err.message})
  }
}
