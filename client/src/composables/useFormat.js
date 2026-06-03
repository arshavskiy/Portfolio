export function tickerCurrency(ticker) {
  return ticker && ticker.toUpperCase().endsWith('.TA') ? 'ILS' : 'USD'
}

export function useCurrency(val, currency = 'USD') {
  if (val == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(val)
}

export function useTickerCurrency(val, ticker) {
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
