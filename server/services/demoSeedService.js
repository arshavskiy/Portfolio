const Watchlist = require('../models/Watchlist')
const Position = require('../models/Position')
const Transaction = require('../models/Transaction')

const DEMO_SEED_VERSION = 1

const WATCHLIST_DEMO = [
  {
    ticker: 'AAPL',
    companyName: 'Apple Inc.',
    sector: 'Technology',
    industry: 'Consumer Electronics',
    groups: ['Demo', 'Watchlist'],
  },
  {
    ticker: 'MSFT',
    companyName: 'Microsoft Corporation',
    sector: 'Technology',
    industry: 'Software - Infrastructure',
    groups: ['Demo', 'Watchlist'],
  },
  {
    ticker: 'GOOGL',
    companyName: 'Alphabet Inc.',
    sector: 'Communication Services',
    industry: 'Internet Content & Information',
    groups: ['Demo', 'Watchlist'],
  },
  {
    ticker: 'AMZN',
    companyName: 'Amazon.com, Inc.',
    sector: 'Consumer Cyclical',
    industry: 'Internet Retail',
    groups: ['Demo', 'Watchlist'],
  },
  {
    ticker: 'NVDA',
    companyName: 'NVIDIA Corporation',
    sector: 'Technology',
    industry: 'Semiconductors',
    groups: ['Demo', 'Watchlist'],
  },
  {
    ticker: '^GSPC',
    companyName: 'S&P 500',
    sector: 'Index',
    industry: 'Index',
    groups: ['Demo', 'Watchlist', 'Index'],
  },
]

const HOLDING_DEMO = {
  ticker: 'O',
  companyName: 'Realty Income Corporation',
  sector: 'Real Estate',
  industry: 'REIT - Retail',
  shares: 10,
  avgCost: 62,
  groups: ['Demo', 'Holding', 'Dividend'],
}

function daysAgo(days) {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - days)
  return date
}

async function seedDemoAccount(user) {
  if (!user || user.demoSeedVersion >= DEMO_SEED_VERSION) return false

  const userId = user._id
  const existingData = await Promise.all([
    Watchlist.exists({user: userId}),
    Position.exists({user: userId}),
    Transaction.exists({user: userId}),
  ])
  if (existingData.some(Boolean)) {
    user.demoSeedVersion = DEMO_SEED_VERSION
    user.demoSeededAt = new Date()
    await user.save()
    return false
  }

  await Watchlist.insertMany(WATCHLIST_DEMO.map((item) => ({
    user: userId,
    ...item,
  })))

  await Position.create({
    user: userId,
    ...HOLDING_DEMO,
    notes: 'Demo dividend holding for the guided tour. Delete it when you are ready to add your real portfolio.',
  })

  await Transaction.create({
    user: userId,
    ticker: HOLDING_DEMO.ticker,
    type: 'buy',
    shares: HOLDING_DEMO.shares,
    price: HOLDING_DEMO.avgCost,
    total: HOLDING_DEMO.shares * HOLDING_DEMO.avgCost,
    totalWithFees: HOLDING_DEMO.shares * HOLDING_DEMO.avgCost,
    date: daysAgo(30),
    notes: 'Demo dividend holding buy for the guided tour.',
  })

  user.demoSeedVersion = DEMO_SEED_VERSION
  user.demoSeededAt = new Date()
  await user.save()
  return true
}

module.exports = {seedDemoAccount, DEMO_SEED_VERSION}
