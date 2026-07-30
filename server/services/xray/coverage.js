// Coverage is not Pass. A momentum of 0.00 / rating of NEUTRAL for a ticker
// with no analyzed articles is missing data, not an assessment — rendering
// it identically to a genuinely neutral rated ticker overstates how much of
// the portfolio has actually been evaluated.

function signalState(momentum, lastSeenAt, maxAgeDays = 7) {
  if (momentum == null || lastSeenAt == null) return 'unrated'
  const ageDays = (Date.now() - new Date(lastSeenAt).getTime()) / 86_400_000
  return ageDays > maxAgeDays ? 'stale' : 'rated'
}

const MATERIALITY_FLOOR = 0.05 // 5% of portfolio

// A position under the materiality floor can't move the portfolio — showing
// it as SUPPORTIVE/WATCH overstates its relevance regardless of signal.
function positionStatus(allocation, signal, state) {
  if (state === 'unrated') return 'NO COVERAGE'
  if (allocation < MATERIALITY_FLOOR) return 'IMMATERIAL'
  if (signal === 'bearish') return 'WATCH'
  if (signal === 'bullish') return 'SUPPORTIVE'
  return 'NEUTRAL'
}

module.exports = {signalState, positionStatus, MATERIALITY_FLOOR}
