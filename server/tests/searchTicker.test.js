jest.mock('yahoo-finance2', () => {
  const mockSearch = jest.fn()
  return { default: jest.fn(() => ({ search: mockSearch })), __mockSearch: mockSearch }
})
jest.mock('../models/ExtendedQuote', () => ({ findOne: jest.fn(), updateOne: jest.fn() }))
jest.mock('../models/QuoteSnapshot', () => ({ findOneAndUpdate: jest.fn(), findOne: jest.fn() }))

const yf = require('yahoo-finance2')
const mockSearch = yf.__mockSearch

// Load after mocks are set up
const { searchTicker } = require('../services/stockService')

function makeQuote(symbol, quoteType, name = 'Test Corp') {
  return { symbol, quoteType, shortname: name, longname: name }
}

describe('searchTicker', () => {
  beforeEach(() => mockSearch.mockReset())

  test('returns EQUITY results', async () => {
    mockSearch.mockResolvedValue({ quotes: [makeQuote('AAPL', 'EQUITY', 'Apple Inc.')] })
    const results = await searchTicker('AAPL')
    expect(results).toHaveLength(1)
    expect(results[0].ticker).toBe('AAPL')
  })

  test('returns CRYPTOCURRENCY results', async () => {
    mockSearch.mockResolvedValue({ quotes: [makeQuote('BTC-USD', 'CRYPTOCURRENCY', 'Bitcoin')] })
    const results = await searchTicker('BTC')
    expect(results).toHaveLength(1)
    expect(results[0].ticker).toBe('BTC-USD')
    expect(results[0].type).toBe('crypto')
  })

  test('returns ETF results (e.g. MSTY, QQQ)', async () => {
    mockSearch.mockResolvedValue({
      quotes: [
        makeQuote('MSTY', 'ETF', 'YieldMax MSTR Option Income Strategy ETF'),
        makeQuote('QQQ', 'ETF', 'Invesco QQQ Trust'),
      ],
    })
    const results = await searchTicker('MSTY')
    expect(results).toHaveLength(2)
    expect(results.map((r) => r.ticker)).toEqual(['MSTY', 'QQQ'])
  })

  test('returns MUTUALFUND results', async () => {
    mockSearch.mockResolvedValue({ quotes: [makeQuote('VTSAX', 'MUTUALFUND', 'Vanguard Total Stock Market')] })
    const results = await searchTicker('VTSAX')
    expect(results).toHaveLength(1)
    expect(results[0].ticker).toBe('VTSAX')
  })

  test('returns INDEX results', async () => {
    mockSearch.mockResolvedValue({ quotes: [makeQuote('^GSPC', 'INDEX', 'S&P 500')] })
    const results = await searchTicker('SP500')
    expect(results).toHaveLength(1)
    expect(results[0].ticker).toBe('^GSPC')
  })

  test('filters out unknown quoteTypes', async () => {
    mockSearch.mockResolvedValue({
      quotes: [
        makeQuote('AAPL', 'EQUITY'),
        makeQuote('WEIRDTYPE', 'OPTION'),
        makeQuote('MSTY', 'ETF'),
      ],
    })
    const results = await searchTicker('test')
    expect(results.map((r) => r.ticker)).toEqual(['AAPL', 'MSTY'])
  })

  test('filters out results without a symbol', async () => {
    mockSearch.mockResolvedValue({
      quotes: [
        { quoteType: 'EQUITY', shortname: 'No Symbol' },
        makeQuote('MSFT', 'EQUITY'),
      ],
    })
    const results = await searchTicker('test')
    expect(results).toHaveLength(1)
    expect(results[0].ticker).toBe('MSFT')
  })

  test('caps results at 8', async () => {
    const quotes = Array.from({ length: 15 }, (_, i) => makeQuote(`T${i}`, 'EQUITY'))
    mockSearch.mockResolvedValue({ quotes })
    const results = await searchTicker('T')
    expect(results).toHaveLength(8)
  })

  test('handles empty search results', async () => {
    mockSearch.mockResolvedValue({ quotes: [] })
    const results = await searchTicker('ZZZNOMATCH')
    expect(results).toEqual([])
  })

  test('mixed quoteTypes all allowed through', async () => {
    mockSearch.mockResolvedValue({
      quotes: [
        makeQuote('AAPL', 'EQUITY'),
        makeQuote('BTC-USD', 'CRYPTOCURRENCY'),
        makeQuote('MSTY', 'ETF'),
        makeQuote('VTSAX', 'MUTUALFUND'),
        makeQuote('^GSPC', 'INDEX'),
        makeQuote('GC=F', 'FUTURE'),
        makeQuote('ILS=X', 'CURRENCY'),
      ],
    })
    const results = await searchTicker('mixed')
    expect(results).toHaveLength(7)
  })
})
