const Position = require('../models/Position')
const Transaction = require('../models/Transaction')
const FeeProfile = require('../models/FeeProfile')
const Watchlist = require('../models/Watchlist')
const { getQuotes, invalidateCache, getIlsToUsd } = require('../services/stockService')
const { computeTransactionCosts } = require('./feeProfileController')
const {getPortfolioHistory} = require('../services/historyService')

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
        shares: p.shares,
        avgCost: p.avgCost,
        currentPrice,
        value,
        cost,
        pnl,
        pnlPercent,
        change: q.change,
        changePercent: q.changePercent,
        dayPnl,
        valueUsd: value * fxRate,
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
    const { ticker, type, shares, price, date, notes, feeProfileId } = req.body
    if (!ticker || !type || !shares || !price)
      return res.status(400).json({ message: 'ticker, type, shares, price required' })

    const total = shares * price

    let feeProfile = null
    let feeAmount = 0
    let taxAmount = 0
    if (feeProfileId) {
      feeProfile = await FeeProfile.findOne({ _id: feeProfileId, user: req.user._id })
      if (feeProfile) {
        // For sell tax, get current avg cost from position
        const pos = type === 'sell'
          ? await Position.findOne({ user: req.user._id, ticker: ticker.toUpperCase() })
          : null
        const avgCost = pos?.avgCost ?? null
        ;({ feeAmount, taxAmount } = computeTransactionCosts(feeProfile, type, total, shares, price, avgCost))
      }
    }

    invalidateCache(ticker)
    const tx = await Transaction.create({
      user: req.user._id, ticker: ticker.toUpperCase(), type, shares, price, total, date, notes,
      feeProfile: feeProfile?._id || null,
      feeAmount,
      taxAmount,
      totalWithFees: type === 'buy' ? total + feeAmount : total - feeAmount,
      netProceeds: type === 'sell' ? total - feeAmount - taxAmount : undefined,
    })

    let position = await Position.findOne({ user: req.user._id, ticker: ticker.toUpperCase() })

    if (type === 'buy') {
      if (position) {
        const newShares = position.shares + shares
        position.avgCost = (position.avgCost * position.shares + price * shares) / newShares
        position.shares = newShares
        await position.save()
      } else {
        position = await Position.create({
          user: req.user._id, ticker: ticker.toUpperCase(), shares, avgCost: price,
        })
      }
      // Auto-add to watchlist if not already there
      await Watchlist.findOneAndUpdate(
        { user: req.user._id, ticker: ticker.toUpperCase() },
        { $setOnInsert: { user: req.user._id, ticker: ticker.toUpperCase() } },
        { upsert: true, new: true }
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
    let taxAmount = 0
    if (feeProfileId) {
      feeProfile = await FeeProfile.findOne({ _id: feeProfileId, user: req.user._id })
      if (feeProfile) {
        const pos = tx.type === 'sell'
          ? await Position.findOne({ user: req.user._id, ticker: tx.ticker })
          : null
        ;({ feeAmount, taxAmount } = computeTransactionCosts(feeProfile, tx.type, shares * price, shares, price, pos?.avgCost ?? null))
      }
    }

    const total = shares * price
    tx.shares = shares
    tx.price = price
    tx.total = total
    tx.date = date || tx.date
    tx.notes = notes
    tx.feeProfile = feeProfile?._id || null
    tx.feeAmount = feeAmount
    tx.taxAmount = taxAmount
    tx.totalWithFees = tx.type === 'buy' ? total + feeAmount : total - feeAmount
    tx.netProceeds = tx.type === 'sell' ? total - feeAmount - taxAmount : undefined
    await tx.save()

    // Recompute position avg cost from all transactions
    const allTx = await Transaction.find({ user: req.user._id, ticker: tx.ticker }).sort({ date: 1 })
    let totalShares = 0
    let totalCost = 0
    for (const t of allTx) {
      if (t.type === 'buy') {
        totalCost += t.shares * t.price
        totalShares += t.shares
      } else {
        totalCost -= (totalCost / totalShares) * t.shares
        totalShares -= t.shares
      }
    }
    const position = await Position.findOne({ user: req.user._id, ticker: tx.ticker })
    if (position) {
      position.shares = totalShares
      position.avgCost = totalShares > 0 ? totalCost / totalShares : 0
      await position.save()
    }

    invalidateCache(tx.ticker)
    res.json({ transaction: tx })
  } catch (err) {
    res.status(500).json({ message: err.message })
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
