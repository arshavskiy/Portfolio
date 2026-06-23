import {computed, watch} from 'vue'
import {useMomentumStore} from '@/stores/momentum'

export function extWeight(pct) {
  if (pct == null) return 0
  const abs = Math.abs(pct)
  const sign = pct > 0 ? 1 : -1
  if (abs > 5)   return sign * 3
  if (abs > 2)   return sign * 2
  if (abs > 0.5) return sign * 1
  return 0
}

export function dayWeight(pct) {
  if (pct == null) return 0
  if (pct > 3)  return 2
  if (pct > 0)  return 1
  if (pct < -3) return -2
  if (pct < 0)  return -1
  return 0
}

export function detectWave(data) {
  const closes = (data || []).map(d => d.close).filter(v => v != null)
  if (closes.length < 6) return 0

  const highs = []
  const lows  = []
  for (let i = 1; i < closes.length - 1; i++) {
    if (closes[i] > closes[i - 1] && closes[i] > closes[i + 1]) highs.push(closes[i])
    if (closes[i] < closes[i - 1] && closes[i] < closes[i + 1]) lows.push(closes[i])
  }

  if (highs.length < 2 || lows.length < 2) return 0

  const higherHighs = highs[highs.length - 1] > highs[0]
  const higherLows  = lows[lows.length - 1]  > lows[0]
  const lowerHighs  = highs[highs.length - 1] < highs[0]
  const lowerLows   = lows[lows.length - 1]  < lows[0]

  if (higherHighs && higherLows) return 1
  if (lowerHighs  && lowerLows)  return -1
  return 0
}

export function signalFromScore(s) {
  const sign = s > 0 ? '+' : ''
  if (s >= 6)  return {icon: '▲▲▲', cls: 'sig-max-bull',    title: `Very strong bullish signal (${sign}${s})` }
  if (s >= 4)  return {icon: '▲▲',  cls: 'sig-strong-bull', title: `Strong bullish signal (${sign}${s})` }
  if (s >= 2)  return {icon: '▲',   cls: 'sig-bull',        title: `Bullish signal (${sign}${s})` }
  if (s <= -6) return {icon: '▼▼▼', cls: 'sig-max-bear',    title: `Very strong bearish signal (${s})` }
  if (s <= -4) return {icon: '▼▼',  cls: 'sig-strong-bear', title: `Strong bearish signal (${s})` }
  if (s <= -2) return {icon: '▼',   cls: 'sig-bear',        title: `Bearish signal (${s})` }
  return {icon: '→', cls: 'sig-neutral', title: `No clear signal (${sign}${s})` }
}

// Computes momentum score for a single item. No wave fetch — avoids extra API
// requests per watchlist row. Publishes to store so consumers (TopMomentumCard,
// PositionDetailView) can read scores without re-computing.
export function useItemMomentum(itemRef, extPercentRef) {
  const momentumStore = useMomentumStore()

  const score = computed(() => {
    const item = itemRef.value
    let s = 0

    s += extWeight(extPercentRef?.value ?? null)
    s += dayWeight(item?.changePercent ?? null)

    const hist = item?.history
    if (Array.isArray(hist) && hist.length >= 2) {
      const first = hist[0]?.close
      const last  = hist[hist.length - 1]?.close
      if (first != null && last != null && first !== 0) {
        if (last > first) s += 1
        else if (last < first) s -= 1
      }

      const closes = hist.map(h => h.close).filter(v => v != null)
      if (closes.length >= 3 && item?.price != null) {
        const sma = closes.reduce((a, b) => a + b, 0) / closes.length
        if (item.price > sma) s += 1
        else if (item.price < sma) s -= 1
      }
    }

    return s
  })

  watch(score, (s) => {
    if (itemRef.value?.ticker) momentumStore.setScore(itemRef.value.ticker, s)
  }, {immediate: true})

  const signal = computed(() => signalFromScore(score.value))

  return {score, signal}
}

// Eagerly computes and publishes scores for a list of items (no wave — fast path).
// Used by TopMomentumCard so scores exist even without WatchRow instances.
export function useListMomentumScores(itemsRef) {
  const historyStore = useHistoryStore()
  const momentumStore = useMomentumStore()

  watch(itemsRef, async (items) => {
    if (!Array.isArray(items)) return

    for (const item of items) {
      if (!item?.ticker) continue

      // Skip if already published (WatchRow or previous run)
      if (momentumStore.getScore(item.ticker) != null) continue

      let score = 0

      // Time-aware ext pick
      const nowNy = new Date().toLocaleString('en-US', {timeZone: 'America/New_York'})
      const d = new Date(nowNy)
      const minutes = d.getHours() * 60 + d.getMinutes()
      const isPreTime = minutes < 9 * 60 + 30
      const extPct = isPreTime
        ? (item.preMarketChangePercent ?? item.lastPreMarketChangePercent ?? item.postMarketChangePercent ?? item.lastPostMarketChangePercent ?? null)
        : (item.postMarketChangePercent ?? item.lastPostMarketChangePercent ?? item.preMarketChangePercent ?? item.lastPreMarketChangePercent ?? null)

      score += extWeight(extPct)
      score += dayWeight(item.changePercent ?? null)

      const hist = Array.isArray(item.history) ? item.history : []
      if (hist.length >= 2) {
        const first = hist[0]?.close
        const last  = hist[hist.length - 1]?.close
        if (first != null && last != null && first !== 0) {
          if (last > first) score += 1
          else if (last < first) score -= 1
        }
        const closes = hist.map(h => h.close).filter(v => v != null)
        if (closes.length >= 3 && item.price != null) {
          const sma = closes.reduce((a, b) => a + b, 0) / closes.length
          if (item.price > sma) score += 1
          else if (item.price < sma) score -= 1
        }
      }

      // Publish base score immediately
      momentumStore.setScore(item.ticker, score)

      // Fetch wave for strong signals
      if (Math.abs(score) >= 4) {
        historyStore.fetchHistory(item.ticker, '1mo', 30).then(data => {
          const wave = detectWave(data)
          if (wave !== 0) momentumStore.setScore(item.ticker, score + wave)
        }).catch(() => {})
      }
    }
  }, {immediate: true})
}
