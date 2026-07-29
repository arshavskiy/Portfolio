const Watchlist = require('../models/Watchlist')
const Position = require('../models/Position')
const Transaction = require('../models/Transaction')
const Alert = require('../models/Alert')
const {getQuotes} = require('./stockService')

const DEMO_SEED_VERSION = 1
const ALERT_ABOVE_PCT = 0.05 // demo alert target: 5% above the live price at signup time
const TRIAL_DAYS = 1

// One-time 24h Pro trial for every brand-new account. Guarded by trialEndsAt
// already being set so re-running (e.g. a second seedDemoAccount call on an
// existing user) never extends or re-grants it.
async function grantTrial(user) {
  if (!user || user.trialEndsAt) return false
  user.userType = 'pro'
  user.trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86400000)
  await user.save()
  return true
}

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

  // One "above" alert per watchlist stock (excluding the index), targeted at
  // 5% above the live price so it's never stale regardless of signup date.
  // Best-effort: a quote failure for one ticker just skips that alert.
  const alertTickers = WATCHLIST_DEMO.filter((item) => !item.ticker.startsWith('^')).map((item) => item.ticker)
  try {
    const quotes = await getQuotes(alertTickers)
    const quoteMap = Object.fromEntries(quotes.filter(Boolean).map((q) => [q.ticker, q]))
    const alertDocs = alertTickers
      .map((ticker) => {
        const price = quoteMap[ticker]?.price
        if (!price) return null
        return {
          user: userId,
          ticker,
          condition: 'above',
          target: Math.round(price * (1 + ALERT_ABOVE_PCT) * 100) / 100,
          note: 'Demo alert for the guided tour.',
        }
      })
      .filter(Boolean)
    if (alertDocs.length) await Alert.insertMany(alertDocs)
  } catch {
    // Quote fetch failing shouldn't block account seeding — alerts are a nice-to-have here.
  }

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

  // A "below" alert on the O holding, set well above the live price so it's
  // guaranteed true — the alert cron (runs every 5 min) fires it on its next
  // pass, giving the new user a real triggered-alert notification to see
  // during the guided tour instead of an empty Alerts page.
  try {
    const [ownedQuote] = await getQuotes([HOLDING_DEMO.ticker])
    const ownedPrice = ownedQuote?.price
    if (ownedPrice) {
      await Alert.create({
        user: userId,
        ticker: HOLDING_DEMO.ticker,
        condition: 'below',
        target: Math.round(ownedPrice * 1.5 * 100) / 100,
        note: 'Demo alert — triggers automatically so you can see how alerts work.',
      })
    }
  } catch {
    // Best-effort, same as the watchlist alerts above.
  }

  user.demoSeedVersion = DEMO_SEED_VERSION
  user.demoSeededAt = new Date()
  await user.save()
  return true
}

module.exports = {seedDemoAccount, grantTrial, DEMO_SEED_VERSION}
