const Position = require('../models/Position')
const Transaction = require('../models/Transaction')

// Transaction fee profile input is tri-state:
// undefined applies the default profile, null means explicit no-fee, ObjectId selects one.
// feeAmount stays in profile currency; totalWithFees/netProceeds convert it first.
const Watchlist = require('../models/Watchlist')
const {getQuotes, getTickerProfile, invalidateCache, getIlsToUsd, getDividendCalendar, getDividendFrequency, getTickerDividendHistory} = require('../services/stockService')
const {
  computeTransactionCosts,
  convertFeeToTransactionCurrency,
  feeCurrencyForTransaction,
  resolveFeeProfile,
  tickerCurrency,
} = require('./feeProfileController')
const {getPortfolioHistory} = require('../services/historyService')
const {computeXirr, computeTwr} = require('../services/returnMetrics')
const {getPortfolioAnalytics, getPortfolioXRay} = require('../services/portfolioAnalyticsService')

function activePositionFilter(userId) {
  return { user: userId, archived: { $ne: true } }
}

// Recompute a position's shares + avg cost by replaying all of its transactions
// (avg-cost method). Deletes the position if no shares remain; creates nothing.
async function recomputePosition(userId, ticker) {
  const allTx = await Transaction.find({user: userId, ticker}).sort({date: 1})
  let totalShares = 0
  let totalCost = 0
  for (const t of allTx) {
    if (t.type === 'update') {
      // hard snapshot: override running totals with the recorded values
      totalShares = t.shares
      totalCost = t.shares * t.price
    } else if (t.type === 'buy') {
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

exports.getPortfolio = async (req, res) => {
  try {
    const positions = await Position.find(activePositionFilter(req.user._id))
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

exports.getAnalytics = async (req, res) => {
  try {
    const data = await getPortfolioAnalytics(req.user._id)
    res.json(data)
  } catch (err) {
    res.status(500).json({message: err.message})
  }
}

exports.getXRay = async (req, res) => {
  try {
    const data = await getPortfolioXRay(req.user._id)
    res.json(data)
  } catch (err) {
    res.status(500).json({message: err.message})
  }
}

// Sector allocation + portfolio-weighted beta, with a simple linear
// stress-test projection (projectedValue = value * (1 + beta * shockPct)).
// Positions missing a fetched beta fall back to 1.0 (market-average),
// matching Yahoo's own convention for unavailable betas.
exports.getRiskExposure = async (req, res) => {
    try {
        const positions = await Position.find(activePositionFilter(req.user._id)).lean()
        if (!positions.length) return res.json({sectors: [], weightedBeta: null, totalValueUsd: 0})
        
        const tickers = positions.map((p) => p.ticker)
        const [quotes, ilsToUsd] = await Promise.all([getQuotes(tickers), getIlsToUsd()])
        const quoteMap = Object.fromEntries(quotes.filter(Boolean).map((q) => [q.ticker, q]))
        
        const enriched = positions.map((p) => {
            const fx = p.ticker.toUpperCase().endsWith('.TA') ? ilsToUsd : 1
            const price = quoteMap[p.ticker]?.price || 0
            const valueUsd = price * p.shares * fx
            const beta = typeof p.beta === 'number' && Number.isFinite(p.beta) ? p.beta : 1
            return {ticker: p.ticker, sector: p.sector || 'Unknown', valueUsd, beta}
        })
        
        const totalValueUsd = enriched.reduce((sum, p) => sum + p.valueUsd, 0)
        if (totalValueUsd <= 0) return res.json({sectors: [], weightedBeta: null, totalValueUsd: 0})
        
        const sectorTotals = {}
        for (const p of enriched) {
            sectorTotals[p.sector] = (sectorTotals[p.sector] || 0) + p.valueUsd
        }
        const sectors = Object.entries(sectorTotals)
            .map(([sector, valueUsd]) => ({sector, valueUsd, percent: (valueUsd / totalValueUsd) * 100}))
            .sort((a, b) => b.valueUsd - a.valueUsd)
        
        const weightedBeta = enriched.reduce((sum, p) => sum + p.beta * (p.valueUsd / totalValueUsd), 0)
        
        res.json({sectors, weightedBeta, totalValueUsd})
    } catch (err) {
        res.status(500).json({message: err.message})
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

// Money-weighted (XIRR) and time-weighted (TWR) return, combined across
// currencies in USD. XIRR treats buys/DRIP as outflows, sells and cash
// dividends as inflows, and current portfolio value as a final inflow at
// today's date. TWR chain-links the daily value series from historyService.
exports.getReturnMetrics = async (req, res) => {
    try {
        const range = req.query.range || 'all'
        const [txs, positions, ilsToUsd, dailySeries] = await Promise.all([
            Transaction.find({user: req.user._id}).sort({date: 1}).lean(),
            Position.find(activePositionFilter(req.user._id)).lean(),
            getIlsToUsd(),
            getPortfolioHistory(req.user._id, range),
        ])
        if (!txs.length) return res.json({irr: null, twr: null})
        
        const fx = (ticker) => (ticker.toUpperCase().endsWith('.TA') ? ilsToUsd : 1)
        
        const cashFlows = txs
            .map((t) => {
                const amountNative = t.type === 'sell' ? (t.netProceeds ?? t.total) : -(t.totalWithFees ?? t.total)
                if (t.type === 'dividend' && t.drip) return null // DRIP: no cash movement, shares only
                if (t.type === 'dividend' && !t.drip) return {date: t.date, amount: (t.total || 0) * fx(t.ticker)}
                return {date: t.date, amount: amountNative * fx(t.ticker)}
            })
            .filter(Boolean)
        
        if (positions.length) {
            const tickers = positions.map((p) => p.ticker)
            const quotes = await getQuotes(tickers)
            const quoteMap = Object.fromEntries(quotes.filter(Boolean).map((q) => [q.ticker, q]))
            const currentValueUsd = positions.reduce((sum, p) => {
                const price = quoteMap[p.ticker]?.price || 0
                return sum + price * p.shares * fx(p.ticker)
            }, 0)
            cashFlows.push({date: new Date(), amount: currentValueUsd})
        }
        
        const irr = computeXirr(cashFlows)
        const twr = computeTwr(dailySeries)
        
        res.json({
            irr: irr != null ? irr * 100 : null,
            twr,
        })
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
      if (type !== 'dividend' && type !== 'update' && (!shares || !price))
      return res.status(400).json({ message: 'ticker, type, shares, price required' })
      if (type === 'dividend' && !price)
          return res.status(400).json({message: 'price (dividend per share) required'})
      if (type === 'update' && (shares == null || price == null))
          return res.status(400).json({message: 'shares and price (avg cost) required for update'})

    const normalizedGroups = normalizeGroups(groups)
      
      // For dividends, client computes total = amountPerShare * sharesHeld; use it directly.
      // For update, total = shares * price (cost basis snapshot).
      const total = type === 'dividend' ? (clientTotal || (shares || 0) * (price || 0)) : (shares * price)

    let feeProfile = null
    let feeAmount = 0
    let feeAmountForTotals = 0
    let taxAmount = 0
    if (type !== 'update') feeProfile = await resolveFeeProfile(req.user._id, feeProfileId, tickerCurrency(ticker))

    if (feeProfile) {
      // For sell tax, get current avg cost from position
      const pos = type === 'sell'
        ? await Position.findOne({ user: req.user._id, ticker: ticker.toUpperCase() })
        : null
      const avgCost = pos?.avgCost ?? null
      const transactionCurrency = tickerCurrency(ticker)
      ;({ feeAmount, taxAmount } = computeTransactionCosts(feeProfile, type, total, shares, price, avgCost, transactionCurrency))
      const feeCurrency = feeCurrencyForTransaction(feeProfile, transactionCurrency)
      feeAmountForTotals = await convertFeeToTransactionCurrency(feeAmount, feeCurrency, transactionCurrency)
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
      const profile = (type === 'buy' || type === 'dividend' || (type === 'update' && !position)) ? await getTickerProfile(symbol) : null

    if (type === 'buy') {
      if (position) {
        const newShares = position.shares + shares
        position.avgCost = (position.avgCost * position.shares + price * shares) / newShares
        position.shares = newShares
        position.archived = false
          position.companyName = position.companyName || profile?.companyName || symbol
          position.sector = position.sector || profile?.sector || null
          position.industry = position.industry || profile?.industry || null
          position.beta = position.beta ?? profile?.beta ?? null
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
            beta: profile?.beta ?? null,
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
            position.beta = position.beta ?? profile?.beta ?? null
            await position.save()
        }
        // Cash dividend: no position change; transaction is the record
    } else if (type === 'update') {
      if (position) {
        position.shares = shares
        position.avgCost = price
        if (normalizedGroups.length) {
          position.groups = normalizeGroups([...(position.groups || []), ...normalizedGroups])
        }
        await position.save()
      } else {
        const profile = await getTickerProfile(symbol)
        position = await Position.create({
          user: req.user._id,
          ticker: symbol,
          companyName: profile?.companyName || symbol,
          sector: profile?.sector,
          industry: profile?.industry,
          beta: profile?.beta ?? null,
          shares,
          avgCost: price,
          groups: normalizedGroups,
        })
        await Watchlist.findOneAndUpdate(
          {user: req.user._id, ticker: symbol},
          {$setOnInsert: {user: req.user._id, ticker: symbol, companyName: profile?.companyName || symbol, sector: profile?.sector || null, industry: profile?.industry || null}},
          {upsert: true, returnDocument: 'after'}
        )
      }
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
    feeProfile = await resolveFeeProfile(req.user._id, feeProfileId, tickerCurrency(tx.ticker))

    if (feeProfile) {
      const pos = tx.type === 'sell'
        ? await Position.findOne({ user: req.user._id, ticker: tx.ticker })
        : null
      const transactionCurrency = tickerCurrency(tx.ticker)
      ;({ feeAmount, taxAmount } = computeTransactionCosts(feeProfile, tx.type, shares * price, shares, price, pos?.avgCost ?? null, transactionCurrency))
      const feeCurrency = feeCurrencyForTransaction(feeProfile, transactionCurrency)
      feeAmountForTotals = await convertFeeToTransactionCurrency(feeAmount, feeCurrency, transactionCurrency)
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

exports.archivePositions = async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(Boolean) : []
    if (!ids.length) return res.status(400).json({ message: 'ids required' })
    const result = await Position.updateMany(
      { _id: { $in: ids }, user: req.user._id },
      { $set: { archived: true } },
    )
    res.json({
      message: 'Positions archived',
      matched: result.matchedCount ?? result.n ?? 0,
      modified: result.modifiedCount ?? result.nModified ?? 0,
    })
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

        // Amounts are stored in each position's native currency; convert .TA
        // (ILS) values to USD so year totals aren't mixed-unit sums.
        const ilsToUsd = await getIlsToUsd()
        const fx = (ticker) => String(ticker || '').toUpperCase().endsWith('.TA') ? ilsToUsd : 1

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
                const rate = fx(t)

                sells.push({
                    _id: tx._id,
                    ticker: t,
                    date: tx.date,
                    shares: tx.shares,
                    price: tx.price,
                    proceeds: proceeds * rate,
                    costBasis: costBasis * rate,
                    avgCostAtSale: avgCost * rate,
                    feePaid: feePaid * rate,
                    taxPaid: taxPaid * rate,
                    grossGain: grossGain * rate,
                    netGain: netGain * rate,
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
                const rate = fx(t)
                sells.push({
                    _id: tx._id,
                    ticker: t,
                    date: tx.date,
                    isDividend: true,
                    shares: tx.shares,
                    price: tx.price,
                    grossGain: (tx.total || 0) * rate,
                    netGain: (tx.total || 0) * rate,
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

const PROJECTION_PAST_MONTHS = 6
const PROJECTION_FUTURE_MONTHS = 6
// Quarterly is the most common payout schedule, used when Yahoo's trailing-12mo
// history isn't enough to detect a ticker's real cadence.
const DEFAULT_DIVIDEND_FREQUENCY = 4

function monthKey(date) {
    const d = new Date(date)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Rolling 12-month income view: PROJECTION_PAST_MONTHS of actual realized gains
// and dividends, then PROJECTION_FUTURE_MONTHS of estimates. Past values are
// replayed from transactions; future dividends are placed on each ticker's real
// payout months when known. Future realized gains cannot be predicted, so they
// carry the trailing average forward and the whole future half is flagged
// `estimated` for the client to render differently.
exports.getIncomeProjection = async (req, res) => {
    try {
        const userId = req.user._id
        const ilsToUsd = await getIlsToUsd()
        const fx = (ticker) => String(ticker || '').toUpperCase().endsWith('.TA') ? ilsToUsd : 1

        const now = new Date()
        const windowStart = new Date(now.getFullYear(), now.getMonth() - PROJECTION_PAST_MONTHS + 1, 1)

        const buckets = []
        for (let i = -PROJECTION_PAST_MONTHS + 1; i <= PROJECTION_FUTURE_MONTHS; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
            buckets.push({
                key: monthKey(d),
                label: d.toLocaleDateString('en-US', {month: 'short', year: '2-digit'}),
                realizedGains: 0,
                dividends: 0,
                portfolioValue: 0,
                estimated: i > 0,
            })
        }
        const byKey = Object.fromEntries(buckets.map((b) => [b.key, b]))

        // ── Past: replay transactions for realized gains + dividends ──
        const allTx = await Transaction.find({user: userId, type: {$in: ['buy', 'sell', 'dividend']}})
            .sort({date: 1})
            .lean()

        const state = {}
        for (const tx of allTx) {
            const t = tx.ticker
            if (!state[t]) state[t] = {shares: 0, cost: 0}

            if (tx.type === 'buy') {
                state[t].cost += tx.shares * tx.price
                state[t].shares += tx.shares
                continue
            }

            const rate = fx(t)
            const bucket = byKey[monthKey(tx.date)]

            if (tx.type === 'sell') {
                const avgCost = state[t].shares > 0 ? state[t].cost / state[t].shares : 0
                const costBasis = avgCost * tx.shares
                const proceeds = tx.total || tx.shares * tx.price
                const netGain = proceeds - costBasis - (tx.feeAmount || 0) - (tx.taxAmount || 0)
                // Replay must run over every sell to keep avg cost correct, but
                // only sells inside the window contribute to a bucket.
                if (bucket && new Date(tx.date) >= windowStart) bucket.realizedGains += netGain * rate
                state[t].cost -= costBasis
                state[t].shares -= tx.shares
                if (state[t].shares <= 0) {
                    state[t].shares = 0
                    state[t].cost = 0
                }
            } else if (tx.type === 'dividend' && !tx.drip) {
                if (bucket && new Date(tx.date) >= windowStart) bucket.dividends += (tx.total || 0) * rate
            }
        }

        // ── Future: estimate dividends from live rate × shares, on real payout months ──
        const positions = await Position.find({...activePositionFilter(userId), shares: {$gt: 0}}).lean()
        const futureBuckets = buckets.filter((b) => b.estimated)

        if (positions.length && futureBuckets.length) {
            const tickers = positions.map((p) => p.ticker)
            const [calendar, frequencies] = await Promise.all([
                getDividendCalendar(tickers).catch(() => []),
                getDividendFrequency(tickers).catch(() => ({})),
            ])
            const rateByTicker = Object.fromEntries(
                (calendar || []).map((e) => [String(e.ticker).toUpperCase(), e.dividendRate])
            )

            for (const p of positions) {
                const symbol = String(p.ticker).toUpperCase()
                const annualRate = Number(rateByTicker[symbol]) || 0
                if (annualRate <= 0) continue

                const detected = frequencies?.[symbol]
                const frequency = detected?.frequency || DEFAULT_DIVIDEND_FREQUENCY
                const payoutMonths = detected?.months || null
                const perPayment = (annualRate * p.shares * fx(symbol)) / frequency
                const spacing = Math.max(1, Math.round(12 / frequency))

                futureBuckets.forEach((bucket, index) => {
                    const [y, m] = bucket.key.split('-').map(Number)
                    const paysThisMonth = payoutMonths
                        ? payoutMonths.includes(m - 1) // stored 0-indexed
                        : index % spacing === 0
                    if (paysThisMonth) bucket.dividends += perPayment
                })
            }
        }

        // Realized gains can't be forecast — carry the trailing average forward.
        const pastBuckets = buckets.filter((b) => !b.estimated)
        const avgRealized = pastBuckets.length
            ? pastBuckets.reduce((s, b) => s + b.realizedGains, 0) / pastBuckets.length
            : 0
        for (const b of futureBuckets) b.realizedGains = avgRealized

        // ── Portfolio value: last available history point per month ──
        try {
            const points = await getPortfolioHistory(userId, 'all')
            for (const point of points || []) {
                const bucket = byKey[monthKey(point.date)]
                if (bucket) bucket.portfolioValue = point.value
            }
        } catch { /* value line is optional — bars still render without it */ }

        // History is downsampled, so a month can have no point. Carry the last
        // known value forward rather than dropping the line to zero.
        let lastValue = 0
        for (const b of buckets) {
            if (b.portfolioValue > 0) lastValue = b.portfolioValue
            else b.portfolioValue = lastValue
        }

        const round = (n) => Math.round((Number(n) || 0) * 100) / 100
        const months = buckets.map((b) => ({
            ...b,
            realizedGains: round(b.realizedGains),
            dividends: round(b.dividends),
            portfolioValue: round(b.portfolioValue),
        }))

        res.json({
            months,
            currency: 'USD',
            ilsToUsd,
            totals: {
                trailingIncome: round(
                    months.filter((m) => !m.estimated).reduce((s, m) => s + m.realizedGains + m.dividends, 0)
                ),
                projectedIncome: round(
                    months.filter((m) => m.estimated).reduce((s, m) => s + m.realizedGains + m.dividends, 0)
                ),
            },
        })
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
        const positions = await Position.find(activePositionFilter(req.user._id))
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

// Upcoming ex-dividend / payment dates for held tickers, with an estimated
// payout based on the last per-share dividend × shares held.
exports.getDividendCalendar = async (req, res) => {
    try {
        const positions = await Position.find({ ...activePositionFilter(req.user._id), shares: {$gt: 0} }).lean()
        if (!positions.length) return res.json({events: []})

        const entries = await getDividendCalendar(positions.map((p) => p.ticker))
        const sharesByTicker = Object.fromEntries(positions.map((p) => [p.ticker, p.shares]))
        const nameByTicker = Object.fromEntries(positions.map((p) => [p.ticker, p.companyName || null]))

        const now = Date.now()
        const cutoff = now - 3 * 86400000
        const events = entries
            .map((e) => {
                const shares = sharesByTicker[e.ticker] ?? 0
                const estimatedPayout = e.lastDividendValue != null && shares > 0
                    ? Math.round(e.lastDividendValue * shares * 100) / 100
                    : null
                return {...e, shares, companyName: nameByTicker[e.ticker], estimatedPayout}
            })
            .filter((e) => {
                const exMs = e.exDividendDate ? new Date(e.exDividendDate).getTime() : 0
                const payMs = e.dividendDate ? new Date(e.dividendDate).getTime() : 0
                // Keep if pay date is still future, or either date is within the 3-day lookback
                return payMs > now || Math.max(exMs, payMs) >= cutoff
            })
            .sort((a, b) =>
                new Date(a.exDividendDate || a.dividendDate) - new Date(b.exDividendDate || b.dividendDate)
            )
        res.json({events})
    } catch (err) {
        res.status(500).json({message: err.message})
    }
}

// Real payout frequency per held dividend-paying ticker (1/2/4/12 times a
// year, or null if it can't be determined), so the Insights income forecast
// can place estimated payments in the right months instead of spreading the
// annualized rate evenly across all 12.
exports.getDividendFrequencies = async (req, res) => {
    try {
        const positions = await Position.find({ ...activePositionFilter(req.user._id), shares: {$gt: 0} }).lean()
        if (!positions.length) return res.json({frequencies: {}})
        const frequencies = await getDividendFrequency(positions.map((p) => p.ticker))
        res.json({frequencies})
    } catch (err) {
        res.status(500).json({message: err.message})
    }
}

exports.getDividendPaymentHistory = async (req, res) => {
    try {
        const positions = await Position.find({ ...activePositionFilter(req.user._id), shares: {$gt: 0} }).lean()
        if (!positions.length) return res.json({payments: []})

        // Get earliest buy date per ticker from transactions
        const tickers = positions.map((p) => p.ticker)
        const txs = await Transaction.find({
            user: req.user._id,
            ticker: {$in: tickers},
            type: 'buy',
        }).select('ticker date shares').lean()

        const firstBuyByTicker = {}
        for (const tx of txs) {
            const t = tx.ticker
            if (!firstBuyByTicker[t] || tx.date < firstBuyByTicker[t].date) {
                firstBuyByTicker[t] = tx
            }
        }

        const sharesByTicker = Object.fromEntries(positions.map((p) => [p.ticker, p.shares]))
        const nameByTicker = Object.fromEntries(positions.map((p) => [p.ticker, p.companyName || null]))

        const results = await Promise.all(
            tickers.map(async (ticker) => {
                const since = firstBuyByTicker[ticker]?.date ?? null
                const history = await getTickerDividendHistory(ticker, since)
                if (!history.length) return null
                const shares = sharesByTicker[ticker] ?? 0
                return {
                    ticker,
                    companyName: nameByTicker[ticker],
                    shares,
                    payments: history.map((d) => ({
                        date: d.date,
                        amount: d.amount,
                        total: shares > 0 && d.amount ? Math.round(shares * d.amount * 100) / 100 : null,
                    })),
                }
            })
        )

        const payments = results
            .filter(Boolean)
            .sort((a, b) => a.ticker.localeCompare(b.ticker))

        res.json({payments})
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

// Save the position's journal notes (investment thesis). Keyed by ticker so the
// position page doesn't need the Position _id up front.
exports.updatePositionNotes = async (req, res) => {
  try {
    const ticker = String(req.params.ticker || '').toUpperCase()
    const notes = String(req.body.notes ?? '').slice(0, 5000)
    const position = await Position.findOneAndUpdate(
        {user: req.user._id, ticker},
        {notes},
        {new: true}
    )
    if (!position) return res.status(404).json({message: 'Position not found'})
    res.json({_id: position._id, ticker: position.ticker, notes: position.notes})
  } catch (err) {
    res.status(500).json({message: err.message})
  }
}

// ── Rebalance targets (saved allocation + drift alert config) ──
const RebalanceTarget = require('../models/RebalanceTarget')

exports.getRebalanceTargets = async (req, res) => {
  try {
    const doc = await RebalanceTarget.findOne({user: req.user._id}).lean()
    res.json(doc || {targets: [], threshold: 5, enabled: false})
  } catch (err) {
    res.status(500).json({message: err.message})
  }
}

exports.saveRebalanceTargets = async (req, res) => {
  try {
    const targets = (Array.isArray(req.body.targets) ? req.body.targets : [])
        .filter((t) => t?.ticker && Number.isFinite(Number(t.percent)))
        .map((t) => ({ticker: String(t.ticker).toUpperCase(), percent: Number(t.percent)}))
    const sum = targets.reduce((s, t) => s + t.percent, 0)
    if (targets.length && Math.abs(sum - 100) > 0.5) {
      return res.status(400).json({message: 'Targets must sum to 100%'})
    }
    const threshold = Math.min(50, Math.max(1, Number(req.body.threshold) || 5))
    const enabled = req.body.enabled !== false && targets.length > 0
    const doc = await RebalanceTarget.findOneAndUpdate(
        {user: req.user._id},
        {targets, threshold, enabled},
        {new: true, upsert: true}
    )
    res.json(doc)
  } catch (err) {
    res.status(500).json({message: err.message})
  }
}

// Fetch a single position's journal notes.
exports.getPositionNotes = async (req, res) => {
  try {
    const ticker = String(req.params.ticker || '').toUpperCase()
    const position = await Position.findOne({user: req.user._id, ticker}).lean()
    res.json({ticker, notes: position?.notes || ''})
  } catch (err) {
    res.status(500).json({message: err.message})
  }
}
