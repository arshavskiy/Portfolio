// Crypto on Yahoo uses a -USD (or -EUR…) suffix, e.g. BTC-USD.
export function isCrypto(ticker) {
    return !!ticker && /-USD$/i.test(ticker)
}

export function tickerCurrency(ticker) {
    if (!ticker) return 'USD'
    if (ticker.toUpperCase().endsWith('.TA')) return 'ILS'
    return 'USD' // US stocks + crypto are USD-priced
}

export function useCurrency(val, currency = 'USD') {
  if (val == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(val)
}

export function useTickerCurrency(val, ticker) {
    if (val == null) return '—'
    // Crypto: adaptive precision — small coins need more decimals than $0.00.
    if (isCrypto(ticker)) {
        const abs = Math.abs(val)
        const maxFrac = abs >= 1 ? 2 : abs >= 0.01 ? 4 : 8
        return new Intl.NumberFormat('en-US', {
            style: 'currency', currency: 'USD',
            minimumFractionDigits: 2, maximumFractionDigits: maxFrac,
        }).format(val)
    }
  return useCurrency(val, tickerCurrency(ticker))
}

export function usePercent(val) {
  if (val == null) return '—'
  const sign = val >= 0 ? '+' : ''
  return `${sign}${val.toFixed(2)}%`
}

export function useLargeNumber(val, ticker) {
  if (val == null) return '—'
  const currency = tickerCurrency(ticker)
  const symbol = currency === 'ILS' ? '₪' : '$'
  if (val >= 1e12) return `${symbol}${(val / 1e12).toFixed(2)}T`
  if (val >= 1e9) return `${symbol}${(val / 1e9).toFixed(2)}B`
  if (val >= 1e6) return `${symbol}${(val / 1e6).toFixed(2)}M`
  return useCurrency(val, currency)
}

export function gainLossClass(val) {
  if (val == null) return ''
  return val >= 0 ? 'gain' : 'loss'
}
