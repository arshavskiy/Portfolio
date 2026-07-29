// Source-priority quote resolver, used as an extra fallback tier after
// getQuoteViaChart() when Yahoo's quote() is blocked but chart-meta alone
// didn't carry day-high/low, volume, etc. (chart-meta sometimes omits them
// too, depending on the symbol). Order: Finnhub (real quote) -> Yahoo
// chart-meta -> Stooq CSV. Each source returns a quote object or null,
// meaning "can't serve this symbol, try next".
const UA = 'Mozilla/5.0'

async function fetchJson(url) {
  const res = await fetch(url, {headers: {'User-Agent': UA}})
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

// Finnhub free tier doesn't serve futures (CL=F), Tel Aviv (.TA), or *-USD crypto.
async function fromFinnhub(symbol) {
  const token = process.env.FINNHUB_API_KEY
  if (!token) return null
  if (/[=.]|-USD$/.test(symbol)) return null
  const d = await fetchJson(
    `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${token}`
  )
  // c === 0 is Finnhub's signal for an unknown/unsupported symbol.
  if (!d || typeof d.c !== 'number' || d.c === 0) return null
  return {
    symbol,
    price: d.c,
    previousClose: d.pc,
    change: d.d,
    changePercent: d.dp,
    dayHigh: d.h ?? null,
    dayLow: d.l ?? null,
    volume: null, // /quote doesn't return volume
    currency: 'USD',
    time: d.t ?? null,
    source: 'finnhub',
  }
}

// Broad coverage, not behind Yahoo's crumb/consent wall.
async function fromYahooChart(symbol) {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?interval=1d&range=1d`
  const meta = (await fetchJson(url))?.chart?.result?.[0]?.meta
  if (!meta || typeof meta.regularMarketPrice !== 'number') return null
  const prev = meta.chartPreviousClose ?? meta.previousClose ?? meta.regularMarketPrice
  return {
    symbol: meta.symbol ?? symbol,
    price: meta.regularMarketPrice,
    previousClose: prev,
    change: meta.regularMarketPrice - prev,
    changePercent: prev ? ((meta.regularMarketPrice - prev) / prev) * 100 : 0,
    dayHigh: meta.regularMarketDayHigh ?? null,
    dayLow: meta.regularMarketDayLow ?? null,
    volume: meta.regularMarketVolume ?? null,
    currency: meta.currency ?? null,
    time: meta.regularMarketTime ?? null,
    source: 'yahoo',
  }
}

// Last-resort for equities/indices.
async function fromStooq(symbol) {
  const s = toStooqSymbol(symbol)
  if (!s) return null
  const res = await fetch(`https://stooq.com/q/l/?s=${s}&f=sd2t2ohlcv&h&e=csv`, {
    headers: {'User-Agent': UA},
  })
  if (!res.ok) return null
  const rows = (await res.text()).trim().split('\n')
  const row = rows[1] // rows[0] is the header
  if (!row) return null
  // Columns: Symbol,Date,Time,Open,High,Low,Close,Volume
  const [, , , open, high, low, close, volume] = row.split(',')
  const price = Number(close)
  if (!Number.isFinite(price) || price === 0) return null // "N/D" rows fall through
  const prev = Number(open) // Stooq light-quote has no prevClose; open is the closest proxy
  return {
    symbol,
    price,
    previousClose: prev,
    change: price - prev,
    changePercent: prev ? ((price - prev) / prev) * 100 : 0,
    dayHigh: Number(high) || null,
    dayLow: Number(low) || null,
    volume: Number(volume) || null,
    currency: null,
    time: null,
    source: 'stooq',
  }
}

function toStooqSymbol(symbol) {
  if (/-USD$/.test(symbol)) return null // no crypto
  if (/=/.test(symbol)) return null // no futures
  if (/\.TA$/.test(symbol)) return null // Stooq TA coverage is unreliable
  return `${symbol}.us`.toLowerCase() // default: assume US listing
}

const SOURCES = [fromFinnhub, fromYahooChart, fromStooq]

// Resolve one symbol through the source chain. Returns null if all fail
// (caller already has its own fallback/error handling upstream).
async function resolveQuote(symbol) {
  for (const source of SOURCES) {
    try {
      const q = await source(symbol)
      if (q) return q
    } catch {
      // try next source
    }
  }
  return null
}

module.exports = {resolveQuote}
