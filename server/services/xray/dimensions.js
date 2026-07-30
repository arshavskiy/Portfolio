// Higher = more specific = closer to root cause. A single holding explains a
// sector; a currency explains almost nothing on its own because many markets
// share one.
const SPECIFICITY = {
  holding: 100,
  sector: 80,
  assetClass: 60,
  market: 50,
  currency: 30,
}

const DIMENSIONS = Object.keys(SPECIFICITY)

module.exports = {DIMENSIONS, SPECIFICITY}
