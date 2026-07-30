const {resolveFindings, fingerprint} = require('../services/xray/resolve')

function concentrationFinding({key, dimension, drivers, value, actionability = 0.5}) {
  return {key, cls: 'concentration', dimension, drivers, value, actionability, status: 'pass', title: key}
}

describe('resolveFindings', () => {
  test('1 holding at 100% collapses all dimensional rules into exactly 1 concentration finding', () => {
    const raw = [
      concentrationFinding({key: 'holding', dimension: 'holding', drivers: ['AAPL'], value: 1, actionability: 0.9}),
      concentrationFinding({key: 'sector', dimension: 'sector', drivers: ['AAPL'], value: 1, actionability: 0.5}),
      concentrationFinding({key: 'market', dimension: 'market', drivers: ['AAPL'], value: 1, actionability: 0.3}),
      concentrationFinding({key: 'currency', dimension: 'currency', drivers: ['AAPL'], value: 1, actionability: 0.2}),
    ]
    const resolved = resolveFindings(raw)
    expect(resolved).toHaveLength(1)
    expect(resolved[0].dimension).toBe('holding')
    expect(resolved[0].consequences).toHaveLength(3)
  })

  test('current portfolio (4 holdings, POLI.TA 57.7%) collapses to 1 concentration + separate alert + coverage findings', () => {
    const raw = [
      concentrationFinding({key: 'holding-concentration', dimension: 'holding', drivers: ['POLI.TA'], value: 0.577, actionability: 0.9}),
      concentrationFinding({key: 'sector-concentration', dimension: 'sector', drivers: ['POLI.TA'], value: 0.577, actionability: 0.5}),
      concentrationFinding({key: 'tase-concentration', dimension: 'market', drivers: ['POLI.TA'], value: 0.577, actionability: 0.3}),
      concentrationFinding({key: 'currency-concentration', dimension: 'currency', drivers: ['POLI.TA'], value: 0.577, actionability: 0.2}),
      {key: 'alert-coverage', cls: 'hygiene', dimension: null, drivers: [], value: null, actionability: 0.9, status: 'warn', title: 'Alert coverage'},
      {key: 'news-coverage', cls: 'coverage', dimension: null, drivers: [], value: null, actionability: 0.1, status: 'warn', title: 'Ticker insight coverage'},
    ]
    const resolved = resolveFindings(raw)
    const concentrationFindings = resolved.filter((f) => f.cls === 'concentration')
    expect(concentrationFindings).toHaveLength(1)
    expect(concentrationFindings[0].consequences).toHaveLength(3)
    expect(resolved).toHaveLength(3) // 1 concentration + 1 hygiene + 1 coverage
  })

  test('3 TASE + 2 US: market concentration separates from holding concentration once drivers diverge', () => {
    const raw = [
      concentrationFinding({key: 'holding-concentration', dimension: 'holding', drivers: ['POLI.TA'], value: 0.3, actionability: 0.9}),
      concentrationFinding({key: 'tase-concentration', dimension: 'market', drivers: ['POLI.TA', 'TEVA.TA', 'LUMI.TA'], value: 0.6, actionability: 0.3}),
    ]
    const resolved = resolveFindings(raw)
    expect(resolved).toHaveLength(2)
    expect(resolved.some((f) => f.dimension === 'holding')).toBe(true)
    expect(resolved.some((f) => f.dimension === 'market')).toBe(true)
  })

  test('10 holdings, max 15% each: no concentration findings pass warn/fail thresholds but still resolve without collapsing incorrectly', () => {
    const raw = Array.from({length: 4}, (_, i) => ({
      key: `dim-${i}`,
      cls: 'concentration',
      dimension: ['holding', 'sector', 'market', 'currency'][i],
      drivers: [`T${i}`],
      value: 0.15,
      actionability: 0.5,
      status: 'pass',
      title: `dim-${i}`,
    }))
    const resolved = resolveFindings(raw)
    // Different drivers per dimension -> different fingerprints -> no collapse.
    expect(resolved).toHaveLength(4)
  })

  test('severity is derived from the primary (most specific) dimension only, never a consequence', () => {
    const raw = [
      concentrationFinding({key: 'holding-concentration', dimension: 'holding', drivers: ['POLI.TA'], value: 0.577, actionability: 0.9}),
      concentrationFinding({key: 'currency-concentration', dimension: 'currency', drivers: ['POLI.TA'], value: 0.577, actionability: 0.2}),
    ]
    const resolved = resolveFindings(raw)
    expect(resolved).toHaveLength(1)
    // holding threshold: [0.25, 0.40] -> 0.577 is 'fail'. currency threshold:
    // [0.60, 0.80] -> 0.577 alone would be 'pass'. Must use holding's verdict.
    expect(resolved[0].status).toBe('fail')
  })

  test('invariant: no two resolved findings ever report the same (drivers, value) fingerprint', () => {
    const raw = [
      concentrationFinding({key: 'a', dimension: 'holding', drivers: ['POLI.TA'], value: 0.577}),
      concentrationFinding({key: 'b', dimension: 'sector', drivers: ['POLI.TA'], value: 0.577}),
      concentrationFinding({key: 'c', dimension: 'market', drivers: ['POLI.TA', 'TEVA.TA'], value: 0.6}),
      {key: 'd', cls: 'hygiene', dimension: null, drivers: [], value: null, status: 'pass', title: 'd'},
    ]
    const resolved = resolveFindings(raw)
    const seen = new Set()
    for (const f of resolved) {
      const fp = fingerprint(f)
      expect(seen.has(fp)).toBe(false)
      seen.add(fp)
    }
  })

  test('non-dimensional findings are never collapsed together even with identical shape', () => {
    const raw = [
      {key: 'fee-drag', cls: 'hygiene', dimension: null, drivers: [], value: null, status: 'pass', title: 'Fee drag'},
      {key: 'losing-positions', cls: 'performance', dimension: null, drivers: [], value: null, status: 'pass', title: 'Losing positions'},
    ]
    const resolved = resolveFindings(raw)
    expect(resolved).toHaveLength(2)
  })
})
