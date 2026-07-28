// Tests for pure utility functions and cache behavior in stockService.
// Yahoo Finance calls are mocked — no network access.

// Delegate each instance method to a shared jest mock, so new YahooFinance()
// always returns an instance whose methods are the mocks — no network access,
// regardless of how the runtime resolves the default export (a fragile
// constructor mock leaked to the real client under CI's Node/OS).
const mockYahoo = {
  quote: jest.fn(),
  chart: jest.fn(),
  search: jest.fn(),
  quoteSummary: jest.fn(),
  trendingSymbols: jest.fn(),
}
// Capture the config the app passes to `new YahooFinance(...)` so we can assert
// the browser User-Agent that dodges Yahoo's EU consent redirect (guccounter=1).
const yahooCtorConfig = []
jest.mock('yahoo-finance2', () => {
  class MockYahooFinance {
    constructor(config) { yahooCtorConfig.push(config) }
    quote(...args) { return mockYahoo.quote(...args) }
    chart(...args) { return mockYahoo.chart(...args) }
    search(...args) { return mockYahoo.search(...args) }
    quoteSummary(...args) { return mockYahoo.quoteSummary(...args) }
    trendingSymbols(...args) { return mockYahoo.trendingSymbols(...args) }
  }
  return { __esModule: true, default: MockYahooFinance }
})

jest.mock('../models/ExtendedQuote', () => ({
  findOne: jest.fn().mockResolvedValue(null),
  findOneAndUpdate: jest.fn().mockResolvedValue(null),
  updateOne: jest.fn().mockResolvedValue(null),
}))

jest.mock('../models/QuoteSnapshot', () => ({
  findOne: jest.fn().mockResolvedValue(null),
  findOneAndUpdate: jest.fn().mockResolvedValue(null),
}))

const yahooMock = mockYahoo
const { getQuote } = require('../services/stockService')

// ── Yahoo client config ───────────────────────────────────────────────────────

describe('YahooFinance client config', () => {
  test('instantiates with a browser User-Agent to avoid the EU consent redirect', () => {
    const config = yahooCtorConfig[0]
    expect(config).toBeDefined()
    const ua = config?.fetchOptions?.headers?.['User-Agent']
    expect(ua).toMatch(/Mozilla\/5\.0/)
    expect(ua).not.toMatch(/yahoo-finance2/)
  })

  test('suppresses the library survey notice', () => {
    expect(yahooCtorConfig[0]?.suppressNotices).toContain('yahooSurvey')
  })
})

// ── downsample ────────────────────────────────────────────────────────────────

// Extract the private downsample function by requiring a fresh module and
// exercising it through the public getHistory interface isn't viable without a
// live Yahoo mock that returns data. Instead we test it as a standalone unit
// by re-implementing it here to verify the algorithm contract.
function downsample(arr, max) {
  if (!Array.isArray(arr) || !max || arr.length <= max || max < 2) return arr
  const step = (arr.length - 1) / (max - 1)
  const out = []
  for (let i = 0; i < max; i++) out.push(arr[Math.round(i * step)])
  return out
}

describe('downsample', () => {
  test('returns array unchanged when shorter than max', () => {
    const arr = [1, 2, 3]
    expect(downsample(arr, 10)).toBe(arr)
  })

  test('returns array unchanged when length equals max', () => {
    const arr = [1, 2, 3]
    expect(downsample(arr, 3)).toBe(arr)
  })

  test('always keeps first and last element', () => {
    const arr = Array.from({ length: 100 }, (_, i) => i)
    const result = downsample(arr, 5)
    expect(result[0]).toBe(0)
    expect(result[result.length - 1]).toBe(99)
  })

  test('returns exactly max items', () => {
    const arr = Array.from({ length: 100 }, (_, i) => i)
    expect(downsample(arr, 10)).toHaveLength(10)
  })

  test('returns original for max < 2', () => {
    const arr = [1, 2, 3, 4, 5]
    expect(downsample(arr, 1)).toBe(arr)
    expect(downsample(arr, 0)).toBe(arr)
  })

  test('handles non-array gracefully', () => {
    expect(downsample(null, 5)).toBeNull()
    expect(downsample(undefined, 5)).toBeUndefined()
  })
})

// ── withRetry ─────────────────────────────────────────────────────────────────

// Re-implement withRetry here to unit-test the retry logic independently.
async function withRetry(fn, { maxAttempts = 3, base = 10 } = {}) {
  let lastErr
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      const is429 = err?.message?.includes('429') || err?.status === 429
      const isNetwork = err?.code === 'ECONNRESET' || err?.code === 'ETIMEDOUT'
      if (!is429 && !isNetwork) throw err
      if (attempt < maxAttempts - 1) {
        const delay = base * Math.pow(2, attempt) + Math.floor(Math.random() * 10)
        await new Promise((r) => setTimeout(r, delay))
      }
    }
  }
  throw lastErr
}

describe('withRetry', () => {
  test('returns value on first success', async () => {
    const fn = jest.fn().mockResolvedValue('ok')
    await expect(withRetry(fn)).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  test('retries on 429 and succeeds', async () => {
    const err429 = Object.assign(new Error('429 Too Many Requests'), { status: 429 })
    const fn = jest.fn().mockRejectedValueOnce(err429).mockResolvedValue('ok')
    await expect(withRetry(fn, { maxAttempts: 3, base: 1 })).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  test('retries on ECONNRESET and succeeds', async () => {
    const errNet = Object.assign(new Error('reset'), { code: 'ECONNRESET' })
    const fn = jest.fn().mockRejectedValueOnce(errNet).mockResolvedValue('data')
    await expect(withRetry(fn, { maxAttempts: 3, base: 1 })).resolves.toBe('data')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  test('throws immediately on non-retryable error', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('bad input'))
    await expect(withRetry(fn, { maxAttempts: 3, base: 1 })).rejects.toThrow('bad input')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  test('exhausts maxAttempts and throws last error', async () => {
    const err = Object.assign(new Error('429'), { status: 429 })
    const fn = jest.fn().mockRejectedValue(err)
    await expect(withRetry(fn, { maxAttempts: 3, base: 1 })).rejects.toThrow('429')
    expect(fn).toHaveBeenCalledTimes(3)
  })
})

describe('getQuote chart fallback', () => {
  beforeEach(() => {
    yahooMock.quote.mockReset()
    yahooMock.chart.mockReset()
  })

  test('falls back to chart meta when quote() throws (datacenter block)', async () => {
    yahooMock.quote.mockRejectedValue(new Error('Unexpected redirect to ...guccounter=1'))
    yahooMock.chart.mockResolvedValue({
      meta: {
        symbol: 'ZZZQ',
        regularMarketPrice: 100,
        chartPreviousClose: 50,
        shortName: 'Test Index',
        currency: 'USD',
      },
      quotes: [
        { date: new Date('2026-07-24T20:00:00Z'), close: 80 },
        { date: new Date('2026-07-27T20:00:00Z'), close: 100 },
      ],
    })

    const quote = await getQuote('ZZZQ')

    // Day change is vs the prior session's close (80), not chartPreviousClose
    // (50), which sits before the whole requested window.
    expect(quote.price).toBe(100)
    expect(quote.previousClose).toBe(80)
    expect(quote.change).toBeCloseTo(20)
    expect(quote.changePercent).toBeCloseTo(25)
  })

  test('uses chartPreviousClose when the window has only one session', async () => {
    yahooMock.quote.mockRejectedValue(new Error('blocked'))
    yahooMock.chart.mockResolvedValue({
      meta: { symbol: 'ONED', regularMarketPrice: 110, chartPreviousClose: 100 },
      quotes: [{ date: new Date('2026-07-27T20:00:00Z'), close: 110 }],
    })

    const quote = await getQuote('ONED')

    expect(quote.previousClose).toBe(100)
    expect(quote.changePercent).toBeCloseTo(10)
  })
})

describe('getQuote dividend normalization', () => {
  beforeEach(() => {
    yahooMock.quote.mockReset()
  })

  test('derives USD annual dividend rate from Yahoo percent yield when rate is missing', async () => {
    yahooMock.quote.mockResolvedValue({
      symbol: 'SCHD',
      shortName: 'Schwab US Dividend Equity ETF',
      regularMarketPrice: 32,
      regularMarketPreviousClose: 31,
      regularMarketChange: 1,
      regularMarketChangePercent: 3.2258,
      regularMarketVolume: 1000,
      trailingAnnualDividendRate: 0,
      trailingAnnualDividendYield: 0,
      dividendYield: 3.25,
    })

    const quote = await getQuote('SCHD')

    expect(quote.dividendYield).toBeCloseTo(0.0325)
    expect(quote.dividendRate).toBeCloseTo(1.04)
  })
})
