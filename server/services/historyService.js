const Transaction = require('../models/Transaction')
const {getHistory, getIlsToUsd} = require('./stockService')

const RANGE_DAYS = {'1wk': 7, '1mo': 30, '3mo': 90, '6mo': 180, '1y': 365, all: null}

function dayKey(d) {
    return new Date(d).toISOString().split('T')[0]
}

function isIls(ticker) {
    return ticker.toUpperCase().endsWith('.TA')
}

// Evenly downsample to at most `max` points, always keeping first + last —
// avoids shipping/rendering thousands of daily points for long "All" ranges.
function downsample(arr, max) {
    if (!Array.isArray(arr) || arr.length <= max) return arr
    const step = (arr.length - 1) / (max - 1)
    const out = []
    for (let i = 0; i < max; i++) out.push(arr[Math.round(i * step)])
    return out
}

// Reconstruct total portfolio value (USD) for each calendar day in the range by
// replaying transactions against per-ticker daily close prices. Also tracks the
// invested cost basis (USD) so the client can draw a value-vs-invested baseline.
async function getPortfolioHistory(userId, range = '1mo') {
    const txs = await Transaction.find({user: userId}).sort({date: 1}).lean()
    if (!txs.length) return []

    const days = range in RANGE_DAYS ? RANGE_DAYS[range] : 30
    const firstTxDate = new Date(txs[0].date)

    const tickers = [...new Set(txs.map((t) => t.ticker))]

    // 'all' (days = null) means infinite/unbounded — pull each ticker's full
    // available price history instead of capping at the usual 1y window.
    const histRange = !days ? 'max' : days > 365 ? '1y' : days <= 30 ? '3mo' : days <= 90 ? '6mo' : '1y'
    const [histories, ilsToUsd] = await Promise.all([
        Promise.all(tickers.map((t) => getHistory(t, histRange).catch(() => []))),
        getIlsToUsd(),
    ])

    const priceMap = {} // ticker -> sorted [{ ts, close }]
    tickers.forEach((t, i) => {
        priceMap[t] = (histories[i] || [])
            .filter((r) => r.close != null)
            .map((r) => ({ts: new Date(r.date).getTime(), close: r.close}))
            .sort((a, b) => a.ts - b.ts)
    })

    // Don't anchor the start to the first transaction — the chart should be
    // able to show the period before the user ever bought anything (value/
    // cost both $0 there), with a marker at the first-buy date instead. For a
    // bounded range that's simply "today - days"; for 'all' it's the earliest
    // price data we have for any held ticker.
    let rangeStart
    if (days) {
        rangeStart = new Date()
        rangeStart.setDate(rangeStart.getDate() - days)
    } else {
        const earliestPriceTs = Math.min(
            ...tickers.map((t) => priceMap[t]?.[0]?.ts ?? Infinity)
        )
        rangeStart = Number.isFinite(earliestPriceTs) ? new Date(earliestPriceTs) : firstTxDate
    }
    
    function closeOnOrBefore(ticker, ts) {
        const arr = priceMap[ticker]
        if (!arr || !arr.length) return null
        let result = null
        for (const p of arr) {
            if (p.ts <= ts) result = p.close
            else break
        }
        return result
    }
    
    // Per-ticker running state: shares held and avg cost (in native currency).
    const state = {} // ticker -> { shares, avgCost }
    
    const points = []
    const end = new Date()
    const cursor = new Date(rangeStart)
    cursor.setHours(0, 0, 0, 0)
    let txIdx = 0
    
    while (cursor <= end) {
        const ts = cursor.getTime()
        
        // Apply all transactions up to the end of this day (avg-cost method).
        while (txIdx < txs.length && new Date(txs[txIdx].date).getTime() <= ts + 86399999) {
            const t = txs[txIdx]
            const s = state[t.ticker] || (state[t.ticker] = {shares: 0, avgCost: 0})
            if (t.type === 'buy') {
                const newShares = s.shares + t.shares
                s.avgCost = newShares > 0 ? (s.avgCost * s.shares + t.price * t.shares) / newShares : 0
                s.shares = newShares
            } else {
                s.shares = Math.max(0, s.shares - t.shares)
                if (s.shares === 0) s.avgCost = 0
            }
            txIdx++
        }
        
        // Value the portfolio and sum invested cost at this day's prices.
        let valueUsd = 0
        let costUsd = 0
        for (const [ticker, s] of Object.entries(state)) {
            if (s.shares <= 0) continue
            const fx = isIls(ticker) ? ilsToUsd : 1
            costUsd += s.avgCost * s.shares * fx
            const close = closeOnOrBefore(ticker, ts)
            if (close != null) valueUsd += close * s.shares * fx
        }
        
        points.push({
            date: dayKey(cursor),
            value: Math.round(valueUsd * 100) / 100,
            cost: Math.round(costUsd * 100) / 100,
        })
        cursor.setDate(cursor.getDate() + 1)
    }

    // Tag every point with the first-buy date so the client can draw a
    // marker line there, even if that exact day got dropped by downsampling.
    const firstBuyDate = dayKey(firstTxDate)
    return downsample(points, 500).map((p) => ({...p, firstBuyDate}))
}

module.exports = {getPortfolioHistory}
