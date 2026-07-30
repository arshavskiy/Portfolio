const {SPECIFICITY} = require('./dimensions')
const {severityFor} = require('./severity')

const SEVERITY_WEIGHT = {fail: 1.0, warn: 0.55, pass: 0.1}

// Same drivers + same value (to 1pp) => same underlying fact. When POLI.TA
// alone accounts for the sector, market, and currency exposure, all those
// findings share drivers=['POLI.TA'] and value=0.577, so they collapse. Add
// two more TASE holdings and the market rule's driver set becomes
// ['POLI.TA','X','Y'] — a different fingerprint, so it separates out on its
// own. No thresholds to retune.
function fingerprint(f) {
  if (f.dimension == null || f.value == null) return `solo:${f.key}`
  const drivers = [...f.drivers].sort().join('|')
  return `${drivers}:${Math.round(f.value * 100)}`
}

function scoreOf(f, severity, nConsequences) {
  const sev = SEVERITY_WEIGHT[severity] ?? SEVERITY_WEIGHT.warn
  // Actionable findings rank above informational ones at equal severity.
  const act = 0.5 + 0.5 * (f.actionability ?? 0.5)
  // A fact with many consequences is structurally important; mild bonus
  // only, so breadth never outranks a genuine risk.
  const breadth = 1 + Math.min(nConsequences, 4) * 0.05
  // Coverage gaps are real but must not crowd out risk.
  const clsWeight = f.cls === 'coverage' ? 0.6 : 1
  return sev * act * breadth * clsWeight
}

// Collapses correlated findings that describe the same underlying fact into
// a single finding with a root-cause + consequences structure. Findings with
// no dimension/value (fee drag, losing positions, alert coverage, etc.) are
// never collapsed — each keeps its own fingerprint.
function resolveFindings(raw) {
  const groups = new Map()
  for (const f of raw) {
    const key = fingerprint(f)
    const bucket = groups.get(key)
    if (bucket) bucket.push(f)
    else groups.set(key, [f])
  }

  const resolved = []

  for (const members of groups.values()) {
    // Most specific dimension becomes the root cause; ties broken by
    // actionability so a rule the user can act on wins over one they can't.
    const sorted = [...members].sort((a, b) => {
      const sa = a.dimension ? SPECIFICITY[a.dimension] : 0
      const sb = b.dimension ? SPECIFICITY[b.dimension] : 0
      if (sb !== sa) return sb - sa
      return (b.actionability ?? 0.5) - (a.actionability ?? 0.5)
    })

    const [primary, ...consequences] = sorted

    // Severity comes from the PRIMARY dimension only. Consequences inherit
    // context, never their own contradictory verdict.
    const severity =
      primary.dimension && primary.value != null
        ? severityFor(primary.dimension, primary.value)
        : primary.status

    resolved.push({
      ...primary,
      status: severity,
      severity: severity === 'fail' ? 3 : severity === 'warn' ? 2 : 1,
      consequences,
      score: scoreOf(primary, severity, consequences.length),
    })
  }

  return resolved.sort((a, b) => b.score - a.score)
}

module.exports = {fingerprint, resolveFindings}
