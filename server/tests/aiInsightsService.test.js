const mockCreateCompletion = jest.fn()

jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCreateCompletion,
      },
    },
  }))
})

const mockPositionFind = jest.fn()
const mockWatchlistFind = jest.fn()
const mockTransactionFind = jest.fn()
const mockUserFindById = jest.fn()
const mockChatMessageCreate = jest.fn()
const mockChatMessageDeleteMany = jest.fn()

jest.mock('../models/Position', () => ({
  find: (...args) => mockPositionFind(...args),
}))

jest.mock('../models/Watchlist', () => ({
  find: (...args) => mockWatchlistFind(...args),
}))

jest.mock('../models/Transaction', () => ({
  find: (...args) => mockTransactionFind(...args),
}))

jest.mock('../models/User', () => ({
  findById: (...args) => mockUserFindById(...args),
}))

jest.mock('../models/AiChatMessage', () => ({
  create: (...args) => mockChatMessageCreate(...args),
  deleteMany: (...args) => mockChatMessageDeleteMany(...args),
}))

jest.mock('../services/stockService', () => ({
  getQuotes: jest.fn(),
  getMarketNews: jest.fn(),
  getHistory: jest.fn(),
  getIlsToUsd: jest.fn(),
}))

jest.mock('../services/historyService', () => ({
  getPortfolioHistory: jest.fn(),
}))

jest.mock('../services/returnMetrics', () => ({
  computeXirr: jest.fn(),
  computeTwr: jest.fn(),
}))

const {getQuotes, getMarketNews} = require('../services/stockService')
const {askAboutPortfolio, clearChatHistory} = require('../services/aiInsightsService')

function makeQuery(value) {
  return {
    lean: jest.fn().mockResolvedValue(value),
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
  }
}

function makeUserDoc(overrides = {}) {
  return {
    _id: 'user-1',
    userType: 'regular',
    aiUsage: {dayKey: null, questionCount: 0},
    save: jest.fn(async function save() {
      return this
    }),
    ...overrides,
  }
}

describe('aiInsightsService quotas', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-07-16T10:00:00.000Z'))
    process.env.OPENAI_API_KEY = 'test-key'

    mockPositionFind.mockReturnValue(makeQuery([]))
    mockWatchlistFind.mockReturnValue(makeQuery([]))
    mockTransactionFind.mockReturnValue(makeQuery([]))
    getQuotes.mockResolvedValue([])
    getMarketNews.mockResolvedValue({articles: []})
    mockChatMessageCreate.mockResolvedValue(null)
    mockChatMessageDeleteMany.mockResolvedValue({deletedCount: 0})
    mockCreateCompletion.mockResolvedValue({
      choices: [{message: {content: 'Test answer'}}],
      usage: {prompt_tokens: 10, completion_tokens: 5},
    })
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.clearAllMocks()
    delete process.env.OPENAI_API_KEY
  })

  test('regular user can ask 3 questions and gets blocked on the 4th', async () => {
    const user = makeUserDoc()
    mockUserFindById.mockImplementation(async () => user)

    await askAboutPortfolio(user._id, 'one')
    await askAboutPortfolio(user._id, 'two')
    await askAboutPortfolio(user._id, 'three')

    await expect(askAboutPortfolio(user._id, 'four')).rejects.toMatchObject({
      message: 'Daily question limit reached',
      status: 429,
    })
    expect(user.aiUsage).toEqual({dayKey: '2026-07-16', questionCount: 3})
  })

  test('regular user quota resets on a new day', async () => {
    const user = makeUserDoc({
      aiUsage: {dayKey: '2026-07-15', questionCount: 3},
    })
    mockUserFindById.mockImplementation(async () => user)

    await askAboutPortfolio(user._id, 'fresh day')

    expect(user.aiUsage).toEqual({dayKey: '2026-07-16', questionCount: 1})
  })

  test.each(['pro', 'max', 'plan', 'admin'])('%s user is unlimited', async (userType) => {
    const user = makeUserDoc({userType})
    mockUserFindById.mockImplementation(async () => user)

    for (let index = 0; index < 5; index++) {
      await expect(askAboutPortfolio(user._id, `question-${index}`)).resolves.toMatchObject({
        answer: 'Test answer',
      })
    }

    expect(user.aiUsage).toEqual({dayKey: '2026-07-16', questionCount: 5})
    expect(user.save).toHaveBeenCalledTimes(5)
  })

  test('missing userType falls back to regular behavior', async () => {
    const user = makeUserDoc({userType: undefined})
    mockUserFindById.mockImplementation(async () => user)

    await askAboutPortfolio(user._id, 'one')
    await askAboutPortfolio(user._id, 'two')
    await askAboutPortfolio(user._id, 'three')

    await expect(askAboutPortfolio(user._id, 'four')).rejects.toMatchObject({
      status: 429,
    })
  })

  test('clearing chat history does not reset the stored quota', async () => {
    const user = makeUserDoc()
    mockUserFindById.mockImplementation(async () => user)

    await askAboutPortfolio(user._id, 'one')
    await askAboutPortfolio(user._id, 'two')
    await askAboutPortfolio(user._id, 'three')
    await clearChatHistory(user._id)

    await expect(askAboutPortfolio(user._id, 'four')).rejects.toMatchObject({
      status: 429,
    })
    expect(mockChatMessageDeleteMany).toHaveBeenCalledWith({user: user._id})
  })

  test('502 upstream failure does not consume quota', async () => {
    const user = makeUserDoc()
    mockUserFindById.mockImplementation(async () => user)
    mockCreateCompletion.mockRejectedValueOnce(new Error('upstream down'))

    await expect(askAboutPortfolio(user._id, 'bad call')).rejects.toMatchObject({
      status: 502,
    })

    expect(user.aiUsage).toEqual({dayKey: null, questionCount: 0})
    expect(user.save).not.toHaveBeenCalled()

    await expect(askAboutPortfolio(user._id, 'good call')).resolves.toMatchObject({
      answer: 'Test answer',
    })
    expect(user.aiUsage).toEqual({dayKey: '2026-07-16', questionCount: 1})
  })

  test('empty AI response does not consume quota', async () => {
    const user = makeUserDoc()
    mockUserFindById.mockImplementation(async () => user)
    mockCreateCompletion.mockResolvedValueOnce({
      choices: [{message: {content: '   '}}],
      usage: {prompt_tokens: 8, completion_tokens: 4},
    })

    await expect(askAboutPortfolio(user._id, 'empty response')).rejects.toMatchObject({
      status: 502,
      message: 'AI Q&A returned an empty response',
    })

    expect(user.aiUsage).toEqual({dayKey: null, questionCount: 0})
    expect(user.save).not.toHaveBeenCalled()
  })
})
