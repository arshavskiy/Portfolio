// Crypto on Yahoo uses a -USD (or -EUR…) suffix, e.g. BTC-USD.
export function isCrypto(ticker) {
    return !!ticker && /-USD$/i.test(ticker)
}

export function tickerCurrency(ticker) {
    if (!ticker) return 'USD'
    if (ticker.toUpperCase().endsWith('.TA')) return 'ILS'
    return 'USD' // US stocks + crypto are USD-priced
}

// Coerce to a finite number, or null if the value can't be a valid number.
// Guards the formatters below against strings/NaN in malformed quote data,
// which would otherwise throw and crash a whole list render.
function toFiniteNumber(val) {
    if (val == null) return null
    const n = typeof val === 'number' ? val : Number(val)
    return Number.isFinite(n) ? n : null
}

export function useCurrency(val, currency = 'USD') {
    const n = toFiniteNumber(val)
    if (n == null) return '—'
    try {
        return new Intl.NumberFormat('en-US', {style: 'currency', currency, minimumFractionDigits: 2}).format(n)
    } catch {
        return '—'
    }
}

export function useTickerCurrency(val, ticker) {
    const n = toFiniteNumber(val)
    if (n == null) return '—'
    // Crypto: adaptive precision — small coins need more decimals than $0.00.
    if (isCrypto(ticker)) {
        const abs = Math.abs(n)
        const maxFrac = abs >= 1 ? 2 : abs >= 0.01 ? 4 : 8
        try {
            return new Intl.NumberFormat('en-US', {
                style: 'currency', currency: 'USD',
                minimumFractionDigits: 2, maximumFractionDigits: maxFrac,
            }).format(n)
        } catch {
            return '—'
        }
    }
    return useCurrency(n, tickerCurrency(ticker))
}

export function usePercent(val) {
    const n = toFiniteNumber(val)
    if (n == null) return '—'
    const sign = n >= 0 ? '+' : ''
    return `${sign}${n.toFixed(2)}%`
}

export function useLargeNumber(val, ticker) {
    const n = toFiniteNumber(val)
    if (n == null) return '—'
  const currency = tickerCurrency(ticker)
  const symbol = currency === 'ILS' ? '₪' : '$'
    if (n >= 1e12) return `${symbol}${(n / 1e12).toFixed(2)}T`
    if (n >= 1e9) return `${symbol}${(n / 1e9).toFixed(2)}B`
    if (n >= 1e6) return `${symbol}${(n / 1e6).toFixed(2)}M`
    return useCurrency(n, currency)
}

export function gainLossClass(val) {
  if (val == null) return ''
  return val >= 0 ? 'gain' : 'loss'
}
