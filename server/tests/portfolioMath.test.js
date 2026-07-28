// Tests for portfolio calculation logic that lives in controllers.
// All DB/service deps are mocked — pure math only.

// ── recomputePosition logic ───────────────────────────────────────────────────
// Mirror of the avg-cost replay loop from portfolioController.recomputePosition.
// Tested standalone so we can assert the math without Mongoose.

function replayTransactions(transactions) {
  let totalShares = 0
  let totalCost = 0
  for (const t of transactions) {
    if (t.type === 'buy') {
      totalCost += t.shares * t.price
      totalShares += t.shares
    } else if (t.type === 'sell') {
      if (totalShares > 0) totalCost -= (totalCost / totalShares) * t.shares
      totalShares -= t.shares
    } else if (t.type === 'dividend' && t.drip && t.shares > 0) {
      totalCost += t.shares * t.price
      totalShares += t.shares
    }
  }
  totalShares = Math.max(0, totalShares)
  return {
    shares: totalShares,
    avgCost: totalShares > 0 ? totalCost / totalShares : 0,
  }
}

describe('replayTransactions (avg-cost method)', () => {
  test('single buy', () => {
    const result = replayTransactions([{ type: 'buy', shares: 10, price: 100 }])
    expect(result.shares).toBe(10)
    expect(result.avgCost).toBe(100)
  })

  test('two buys at different prices — weighted average', () => {
    const result = replayTransactions([
      { type: 'buy', shares: 10, price: 100 },
      { type: 'buy', shares: 10, price: 200 },
    ])
    expect(result.shares).toBe(20)
    expect(result.avgCost).toBe(150)
  })

  test('buy then partial sell — avgCost unchanged', () => {
    const result = replayTransactions([
      { type: 'buy', shares: 10, price: 100 },
      { type: 'sell', shares: 4, price: 150 },
    ])
    expect(result.shares).toBe(6)
    expect(result.avgCost).toBeCloseTo(100)
  })

  test('buy then full sell — zero shares', () => {
    const result = replayTransactions([
      { type: 'buy', shares: 10, price: 100 },
      { type: 'sell', shares: 10, price: 200 },
    ])
    expect(result.shares).toBe(0)
  })

  test('sell more than held clamps to 0 (no negative shares)', () => {
    const result = replayTransactions([
      { type: 'buy', shares: 5, price: 100 },
      { type: 'sell', shares: 10, price: 100 },
    ])
    expect(result.shares).toBe(0)
  })

  test('DRIP dividend adds shares and adjusts cost basis', () => {
    const result = replayTransactions([
      { type: 'buy', shares: 10, price: 100 },
      { type: 'dividend', drip: true, shares: 1, price: 110 },
    ])
    expect(result.shares).toBe(11)
    expect(result.avgCost).toBeCloseTo((10 * 100 + 1 * 110) / 11)
  })

  test('cash dividend (no drip) does not change shares or cost', () => {
    const result = replayTransactions([
      { type: 'buy', shares: 10, price: 100 },
      { type: 'dividend', drip: false, shares: 0, price: 0 },
    ])
    expect(result.shares).toBe(10)
    expect(result.avgCost).toBe(100)
  })

  test('multiple buys and sells — correct running average', () => {
    // Buy 10 @ 100 = avg 100
    // Buy 10 @ 200 = avg 150
    // Sell 5 @ 180  = avg still 150, shares = 15
    // Buy 5 @ 120  = (15*150 + 5*120) / 20 = (2250 + 600) / 20 = 142.5
    const result = replayTransactions([
      { type: 'buy', shares: 10, price: 100 },
      { type: 'buy', shares: 10, price: 200 },
      { type: 'sell', shares: 5, price: 180 },
      { type: 'buy', shares: 5, price: 120 },
    ])
    expect(result.shares).toBe(20)
    expect(result.avgCost).toBeCloseTo(142.5)
  })
})

// ── computeTransactionCosts ───────────────────────────────────────────────────

const { computeTransactionCosts } = require('../controllers/feeProfileController')

function makeProfile(overrides = {}) {
  return {
    buyFee: { type: 'percent', value: 0.001, minFee: 0 },
    sellFee: { type: 'percent', value: 0.001, minFee: 0 },
    capitalGainsTax: 25,
    ...overrides,
  }
}

describe('computeTransactionCosts', () => {
  test('returns zero costs for null profile', () => {
    expect(computeTransactionCosts(null, 'buy', 1000, 10, 100, null))
      .toEqual({ feeAmount: 0, taxAmount: 0 })
  })

  test('buy fee — percent of total', () => {
    const profile = makeProfile({ buyFee: { type: 'percent', value: 0.01 } })
    const { feeAmount, taxAmount } = computeTransactionCosts(profile, 'buy', 1000, 10, 100, null)
    expect(feeAmount).toBeCloseTo(10)
    expect(taxAmount).toBe(0)
  })

  test('buy fee — flat amount', () => {
    const profile = makeProfile({ buyFee: { type: 'flat', value: 5 } })
    const { feeAmount } = computeTransactionCosts(profile, 'buy', 1000, 10, 100, null)
    expect(feeAmount).toBe(5)
  })

  test('buy fee — minFee enforced', () => {
    const profile = makeProfile({ buyFee: { type: 'percent', value: 0.001, minFee: 10 } })
    const { feeAmount } = computeTransactionCosts(profile, 'buy', 100, 1, 100, null)
    expect(feeAmount).toBe(10)
  })

  test('buy fee — per-share with minimum fee', () => {
    const profile = makeProfile({ buyFee: { type: 'perShare', value: 0.01, minFee: 1.5 } })
    expect(computeTransactionCosts(profile, 'buy', 1000, 10, 100, null).feeAmount).toBe(1.5)
    expect(computeTransactionCosts(profile, 'buy', 20000, 200, 100, null).feeAmount).toBe(2)
  })

  test('sell fee — per-share minimum fee is enforced', () => {
    const profile = makeProfile({ sellFee: { type: 'perShare', value: 0.01, minFee: 5 } })
    const { feeAmount } = computeTransactionCosts(profile, 'sell', 1000, 10, 100, 120)
    expect(feeAmount).toBe(5)
  })

  test('sell with capital gain — tax computed', () => {
    const profile = makeProfile({ capitalGainsTax: 25 })
    // avgCost 80, sell price 100, 10 shares → gain = (100-80)*10 = 200 → tax = 50
    const { taxAmount } = computeTransactionCosts(profile, 'sell', 1000, 10, 100, 80)
    expect(taxAmount).toBeCloseTo(50)
  })

  test('sell at a loss — no tax', () => {
    const profile = makeProfile({ capitalGainsTax: 25 })
    const { taxAmount } = computeTransactionCosts(profile, 'sell', 800, 10, 80, 100)
    expect(taxAmount).toBe(0)
  })

  test('sell with no avgCost — no tax', () => {
    const profile = makeProfile({ capitalGainsTax: 25 })
    const { taxAmount } = computeTransactionCosts(profile, 'sell', 1000, 10, 100, null)
    expect(taxAmount).toBe(0)
  })

  test('sell with zero capitalGainsTax — no tax', () => {
    const profile = makeProfile({ capitalGainsTax: 0 })
    const { taxAmount } = computeTransactionCosts(profile, 'sell', 1000, 10, 100, 80)
    expect(taxAmount).toBe(0)
  })
})

// ── normalizeGroups ───────────────────────────────────────────────────────────

function normalizeGroups(groups) {
  if (!Array.isArray(groups)) return []
  const seen = new Set()
  const out = []
  for (const g of groups) {
    if (typeof g !== 'string') continue
    const tag = g.trim().slice(0, 30)
    if (!tag) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(tag)
    if (out.length >= 10) break
  }
  return out
}

describe('normalizeGroups', () => {
  test('returns empty array for non-array input', () => {
    expect(normalizeGroups(null)).toEqual([])
    expect(normalizeGroups('Tech')).toEqual([])
  })

  test('trims whitespace', () => {
    expect(normalizeGroups(['  Tech  '])).toEqual(['Tech'])
  })

  test('drops empty strings', () => {
    expect(normalizeGroups(['', '  ', 'Tech'])).toEqual(['Tech'])
  })

  test('deduplicates case-insensitively, keeps first-seen casing', () => {
    expect(normalizeGroups(['Tech', 'tech', 'TECH'])).toEqual(['Tech'])
  })

  test('truncates tags longer than 30 chars', () => {
    const long = 'A'.repeat(35)
    expect(normalizeGroups([long])[0]).toHaveLength(30)
  })

  test('caps output at 10 tags', () => {
    const input = Array.from({ length: 15 }, (_, i) => `tag${i}`)
    expect(normalizeGroups(input)).toHaveLength(10)
  })
})
