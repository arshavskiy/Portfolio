const Watchlist = require('../models/Watchlist')
const Position = require('../models/Position')
const Transaction = require('../models/Transaction')

const DEMO_SEED_VERSION = 1

const WATCHLIST_DEMO = {
  ticker: 'TSLA',
  companyName: 'Tesla, Inc.',
  sector: 'Consumer Cyclical',
  industry: 'Auto Manufacturers',
  groups: ['Demo', 'Watchlist'],
}

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

  await Watchlist.create({
    user: userId,
    ...WATCHLIST_DEMO,
  })

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
