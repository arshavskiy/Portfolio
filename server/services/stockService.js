const YahooFinance = require('yahoo-finance2').default
const yahooFinance = new YahooFinance()

const quoteCache = new Map()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

// TASE (.TA) prices from Yahoo are in agorot (1/100 shekel) — divide by 100
function taFactor(ticker) {
  return ticker.toUpperCase().endsWith('.TA') ? 100 : 1
}

async function getQuote(ticker) {
  const cached = quoteCache.get(ticker)
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data

  const result = await yahooFinance.quote(ticker)
  const f = taFactor(ticker)

  const data = {
    ticker: result.symbol,
    name: result.shortName,
    price: result.regularMarketPrice / f,
    change: result.regularMarketChange / f,
    changePercent: result.regularMarketChangePercent,
    volume: result.regularMarketVolume,
    marketCap: result.marketCap != null ? result.marketCap / f : null,
    dayHigh: result.regularMarketDayHigh / f,
    dayLow: result.regularMarketDayLow / f,
    open: result.regularMarketOpen / f,
    week52High: result.fiftyTwoWeekHigh / f,
    week52Low: result.fiftyTwoWeekLow / f,
    pe: result.trailingPE,
  }

  quoteCache.set(ticker, { data, ts: Date.now() })
  return data
}

async function getQuotes(tickers) {
  return Promise.all(tickers.map((t) => getQuote(t).catch(() => null)))
}

async function getHistory(ticker, range = '3mo') {
  const fmt = (d) => d.toISOString().split('T')[0]
  const endDate = new Date()
  const startDate = new Date()

  // 1d uses chart() with 5m intervals for intraday
  if (range === '1d') {
    const result = await yahooFinance.chart(ticker, {
      period1: fmt(startDate),
      period2: fmt(new Date(endDate.getTime() + 86400000)),
      interval: '5m',
    })
    const f = taFactor(ticker)
    const quotes = result?.quotes || []
    return quotes
      .filter((r) => r && r.close != null)
      .map((r) => ({
        date: r.date,
        open: r.open / f,
        high: r.high / f,
        low: r.low / f,
        close: r.close / f,
        volume: r.volume,
      }))
  }

  const f = taFactor(ticker)
  const rangeMap = { '5d': 5, '1mo': 30, '3mo': 90, '6mo': 180, '1y': 365 }
  const days = rangeMap[range] || 90
  startDate.setDate(startDate.getDate() - days)

  const result = await yahooFinance.historical(ticker, {
    period1: fmt(startDate),
    period2: fmt(endDate),
    interval: '1d',
  })

  return result.map((row) => ({
    date: row.date,
    open: row.open / f,
    high: row.high / f,
    low: row.low / f,
    close: row.close / f,
    volume: row.volume,
  }))
}

async function searchTicker(query) {
  const results = await yahooFinance.search(query)
  return (results.quotes || [])
      .filter((q) => (q.quoteType === 'EQUITY' || q.quoteType === 'CRYPTOCURRENCY') && q.symbol)
    .slice(0, 8)
      .map((q) => ({
        ticker: q.symbol,
        name: q.shortname || q.longname,
        type: q.quoteType === 'CRYPTOCURRENCY' ? 'crypto' : 'equity',
      }))
}

function invalidateCache(ticker) {
  quoteCache.delete(ticker.toUpperCase())
}

let fxCache = { rate: null, ts: 0 }
const FX_TTL = 60 * 60 * 1000 // 1 hour

async function getIlsToUsd() {
  if (fxCache.rate && Date.now() - fxCache.ts < FX_TTL) return fxCache.rate
  try {
    const result = await yahooFinance.quote('ILS=X')
    const rate = result.regularMarketPrice // ILS per 1 USD → invert for ILS→USD
    fxCache = { rate: 1 / rate, ts: Date.now() }
    return fxCache.rate
  } catch {
    return fxCache.rate || 0.27 // fallback ~0.27 USD per ILS
  }
}

module.exports = { getQuote, getQuotes, getHistory, searchTicker, invalidateCache, getIlsToUsd }
