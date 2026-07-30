// Severity is a property of (dimension, value) — never of the rule. Without
// this, the same 57.7% could render as both Watch (currency rule) and Pass
// (market rule) on identical input, because each rule owned its own
// threshold. Keeping status names 'pass'/'warn'/'fail' to match the existing
// client contract (statusMeta in PortfolioXRayView.vue).

// [warnAt, failAt] as fractions (0..1) of portfolio value. Thresholds widen
// as dimensions get broader: 58% in one holding is a risk, but 58% in one
// currency is unremarkable for an investor holding a foreign-market position.
const THRESHOLDS = {
  holding: [0.25, 0.40],
  sector: [0.30, 0.50],
  assetClass: [0.40, 0.60],
  market: [0.50, 0.70],
  currency: [0.60, 0.80],
}

function severityFor(dimension, value) {
  const bounds = THRESHOLDS[dimension]
  if (!bounds) return 'warn'
  const [warnAt, failAt] = bounds
  if (value >= failAt) return 'fail'
  if (value >= warnAt) return 'warn'
  return 'pass'
}

module.exports = {THRESHOLDS, severityFor}
