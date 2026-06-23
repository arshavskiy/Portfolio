import {computed, ref, watch} from 'vue'
import {useHistoryStore} from '@/stores/history'
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

// Simple RSI-14 on closes array. Returns 0-100 or null if insufficient data.
export function computeRsi(closes, period = 14) {
  if (!closes || closes.length < period + 1) return null
  let gains = 0, losses = 0
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1]
    if (diff > 0) gains += diff
    else losses -= diff
  }
  const avgGain = gains / period
  const avgLoss = losses / period
  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return 100 - 100 / (1 + rs)
}

// Volume ratio: current vs average. Returns null if data missing.
export function volumeRatio(volume, avgVolume) {
  if (!volume || !avgVolume || avgVolume === 0) return null
  return volume / avgVolume
}

// Build a human-readable breakdown of all signal components.
// Returns array of { label, value, score, cls } chips.
export function buildBreakdown({ dayPct, extPct, hist, price, volume, avgVolume, wave }) {
  const chips = []

  // Day change
  const dw = dayWeight(dayPct)
  if (dayPct != null) {
    chips.push({
      label: 'Day',
      value: `${dayPct >= 0 ? '+' : ''}${dayPct.toFixed(2)}%`,
      score: dw,
      cls: dw > 0 ? 'chip-bull' : dw < 0 ? 'chip-bear' : 'chip-neutral',
    })
  }

  // Extended hours
  const ew = extWeight(extPct)
  if (extPct != null) {
    chips.push({
      label: 'Pre/Post',
      value: `${extPct >= 0 ? '+' : ''}${extPct.toFixed(2)}%`,
      score: ew,
      cls: ew > 0 ? 'chip-bull' : ew < 0 ? 'chip-bear' : 'chip-neutral',
    })
  }

  // Sparkline trend
  const closes = Array.isArray(hist) ? hist.map(h => h.close).filter(v => v != null) : []
  if (closes.length >= 2) {
    const first = closes[0], last = closes[closes.length - 1]
    const trendPct = ((last - first) / first) * 100
    const ts = last > first ? 1 : last < first ? -1 : 0
    chips.push({
      label: 'Trend',
      value: `${trendPct >= 0 ? '+' : ''}${trendPct.toFixed(2)}%`,
      score: ts,
      cls: ts > 0 ? 'chip-bull' : ts < 0 ? 'chip-bear' : 'chip-neutral',
    })
  }

  // SMA position
  if (closes.length >= 3 && price != null) {
    const sma = closes.reduce((a, b) => a + b, 0) / closes.length
    const ss = price > sma ? 1 : price < sma ? -1 : 0
    const distPct = ((price - sma) / sma) * 100
    chips.push({
      label: 'vs SMA',
      value: `${distPct >= 0 ? '+' : ''}${distPct.toFixed(2)}%`,
      score: ss,
      cls: ss > 0 ? 'chip-bull' : ss < 0 ? 'chip-bear' : 'chip-neutral',
    })
  }

  // RSI
  if (closes.length >= 15) {
    const rsi = computeRsi(closes)
    if (rsi != null) {
      const rs = rsi > 70 ? -1 : rsi < 30 ? 1 : 0 // overbought=bearish, oversold=bullish
      const label = rsi > 70 ? 'Overbought' : rsi < 30 ? 'Oversold' : 'Neutral'
      chips.push({
        label: 'RSI',
        value: `${rsi.toFixed(0)} · ${label}`,
        score: rs,
        cls: rsi > 70 ? 'chip-bear' : rsi < 30 ? 'chip-bull' : 'chip-neutral',
      })
    }
  }

  // Volume
  const vr = volumeRatio(volume, avgVolume)
  if (vr != null) {
    const vs = vr > 1.5 ? 1 : vr < 0.5 ? -1 : 0
    chips.push({
      label: 'Volume',
      value: `${vr.toFixed(1)}× avg`,
      score: vs,
      cls: vr > 1.5 ? 'chip-bull' : vr < 0.5 ? 'chip-bear' : 'chip-neutral',
    })
  }

  // Wave structure
  if (wave !== 0 && wave != null) {
    chips.push({
      label: 'Wave',
      value: wave > 0 ? 'Higher highs/lows' : 'Lower highs/lows',
      score: wave,
      cls: wave > 0 ? 'chip-bull' : 'chip-bear',
    })
  }

  return chips
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

// Computes momentum + wave for a single item ref/reactive object.
// Publishes combined score to the momentum store so any consumer can read it.
export function useItemMomentum(itemRef, extPercentRef) {
  const historyStore = useHistoryStore()
  const momentumStore = useMomentumStore()

  const momentumScore = computed(() => {
    const item = itemRef.value
    let score = 0

    score += extWeight(extPercentRef?.value ?? null)
    score += dayWeight(item?.changePercent ?? null)

    const hist = item?.history
    if (Array.isArray(hist) && hist.length >= 2) {
      const first = hist[0]?.close
      const last  = hist[hist.length - 1]?.close
      if (first != null && last != null && first !== 0) {
        if (last > first) score += 1
        else if (last < first) score -= 1
      }

      const closes = hist.map(h => h.close).filter(v => v != null)
      if (closes.length >= 3 && item?.price != null) {
        const sma = closes.reduce((a, b) => a + b, 0) / closes.length
        if (item.price > sma) score += 1
        else if (item.price < sma) score -= 1
      }
    }

    return score
  })

  const waveVote = ref(0)
  const monthlyHistory = ref(null)

  watch(momentumScore, async (score) => {
    if (Math.abs(score) < 4) {
      monthlyHistory.value = null
      waveVote.value = 0
      return
    }
    if (monthlyHistory.value) return
    try {
      const data = await historyStore.fetchHistory(itemRef.value?.ticker, '1mo', 30)
      monthlyHistory.value = data
      waveVote.value = detectWave(data)
    } catch {
      waveVote.value = 0
    }
  }, {immediate: true})

  const combinedScore = computed(() => momentumScore.value + waveVote.value)

  watch(combinedScore, (s) => {
    if (itemRef.value?.ticker) momentumStore.setScore(itemRef.value.ticker, s)
  }, {immediate: true})

  const signal = computed(() => signalFromScore(combinedScore.value))

  // Rich breakdown for tooltip / detail view
  const breakdown = computed(() => {
    const item = itemRef.value
    return buildBreakdown({
      dayPct: item?.changePercent ?? null,
      extPct: extPercentRef?.value ?? null,
      hist: item?.history ?? [],
      price: item?.price ?? null,
      volume: item?.volume ?? null,
      avgVolume: item?.avgVolume ?? null,
      wave: waveVote.value,
    })
  })

  // Tooltip text: one line per chip
  const tooltipText = computed(() => {
    const chips = breakdown.value
    if (!chips.length) return signal.value.title
    const lines = chips.map(c => `${c.label}: ${c.value}`)
    return `Score ${combinedScore.value > 0 ? '+' : ''}${combinedScore.value}\n${lines.join('\n')}`
  })

  return {momentumScore, waveVote, combinedScore, signal, breakdown, tooltipText}
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
