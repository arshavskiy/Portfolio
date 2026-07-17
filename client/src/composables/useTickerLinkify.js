import {computed} from 'vue'
import {usePortfolioStore} from '@/stores/portfolio'
import {useWatchlistStore} from '@/stores/watchlist'

// Tickers the user actually tracks — only these get linkified in AI text,
// so we never turn a stray capitalized word (e.g. "OK", "IT") into a link.
export function useTickerLinkify() {
  const portfolio = usePortfolioStore()
  const watchlist = useWatchlistStore()

  const knownTickers = computed(() => {
    const map = new Map()
    for (const p of portfolio.positions) {
      if (p.ticker) map.set(p.ticker.toUpperCase(), p.ticker.toUpperCase())
    }
    for (const w of watchlist.items) {
      if (w.ticker) map.set(w.ticker.toUpperCase(), w.ticker.toUpperCase())
    }
    return map
  })

  // Splits text into {text} / {ticker} segments so the template can render
  // known tickers as links to their position page and everything else as
  // plain text. Matches whole-word uppercase-ish symbols only (1-8 chars,
  // optional leading ^ for indices) to avoid false hits inside normal words.
  function splitTickers(text) {
    if (!knownTickers.value.size) return [{text}]
    const pattern = /(^|[^A-Za-z0-9.^&-])(\^?[A-Z0-9]{1,8}(?:[.-][A-Z0-9]{1,5})?)(?![A-Za-z0-9.&-])/g
    const segments = []
    let lastIndex = 0
    let match
    while ((match = pattern.exec(text))) {
      const prefix = match[1]
      const label = match[2]
      const tickerStart = match.index + prefix.length
      const candidate = label.toUpperCase()
      const ticker = knownTickers.value.get(candidate)
      if (!ticker) continue
      if (tickerStart > lastIndex) segments.push({text: text.slice(lastIndex, tickerStart)})
      segments.push({ticker, label})
      lastIndex = tickerStart + label.length
    }
    if (lastIndex < text.length) segments.push({text: text.slice(lastIndex)})
    return segments.length ? segments : [{text}]
  }

  return {knownTickers, splitTickers}
}
