const Position = require('../models/Position')
const Transaction = require('../models/Transaction')
const Alert = require('../models/Alert')
require('../models/FeeProfile')
const {getQuotes, getIlsToUsd, getAnalystInsight} = require('./stockService')
const {getEnrichment} = require('./stockfolioInsightsService')
const {resolveFindings} = require('./xray/resolve')

function numberValue(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function tickerCurrency(ticker) {
  return String(ticker || '').toUpperCase().endsWith('.TA') ? 'ILS' : 'USD'
}

function marketForTicker(ticker) {
  const symbol = String(ticker || '').toUpperCase()
  if (symbol.endsWith('.TA')) return 'TASE'
  if (symbol.endsWith('-USD')) return 'Crypto'
  return 'US'
}

function fxForTicker(ticker, ilsToUsd) {
  if (tickerCurrency(ticker) !== 'ILS') return 1
  const fx = numberValue(ilsToUsd)
  return fx > 0 ? fx : 1
}

function percent(value, total) {
  return total > 0 ? (value / total) * 100 : 0
}

function dividendYield(rate, currentPrice, reportedYield) {
  const yieldValue = numberValue(reportedYield)
  if (yieldValue > 0) return yieldValue
  return rate > 0 && currentPrice > 0 ? (rate / currentPrice) * 100 : 0
}

function bucketRows(map, totalValueUsd, keyName = 'key') {
  return [...map.entries()]
    .map(([key, valueUsd]) => ({[keyName]: key, valueUsd, percent: percent(valueUsd, totalValueUsd)}))
    .sort((a, b) => b.valueUsd - a.valueUsd)
}

function pushBucket(map, key, value) {
  const resolved = key || 'Unknown'
  map.set(resolved, (map.get(resolved) || 0) + value)
}

function ruleStatus(value, warnAt, failAt) {
  if (value >= failAt) return 'fail'
  if (value >= warnAt) return 'warn'
  return 'pass'
}

function addRule(rules, rule) {
  rules.push({
    status: rule.status,
    severity: rule.status === 'fail' ? 3 : rule.status === 'warn' ? 2 : 1,
    affectedTickers: [],
    ...rule,
  })
}

function summarizeRules(rules) {
  return rules.reduce((summary, rule) => {
    summary.total += 1
    summary[rule.status] = (summary[rule.status] || 0) + 1
    return summary
  }, {total: 0, pass: 0, warn: 0, fail: 0})
}

async function getPortfolioAnalytics(userId) {
  const [positions, transactions, alerts, ilsToUsd] = await Promise.all([
    Position.find({user: userId, shares: {$gt: 0}}).lean(),
    Transaction.find({user: userId}).populate('feeProfile', 'name currency').sort({date: 1}).lean(),
    Alert.find({user: userId, active: true}).lean(),
    getIlsToUsd(),
  ])

  if (!positions.length) {
    return {
      generatedAt: new Date().toISOString(),
      summary: {
        positionCount: 0,
        activityCount: 0,
        sectorCount: 0,
        dividendPayerCount: 0,
        totalValueUsd: 0,
        totalCostUsd: 0,
        unrealizedPnlUsd: 0,
        unrealizedPnlPercent: 0,
        buyTotalUsd: 0,
        sellTotalUsd: 0,
        feesUsd: 0,
        dividendsUsd: 0,
        annualDividendIncomeUsd: 0,
        dividendIncomeYield: 0,
        activeAlertCount: alerts.length,
        ilsToUsd,
      },
      positions: [],
      allocations: {currency: [], market: [], sector: [], industry: [], group: [], holding: [], broker: []},
    }
  }

  const tickers = positions.map((p) => p.ticker)
  const quotes = await getQuotes(tickers)
  const quoteMap = Object.fromEntries(quotes.filter(Boolean).map((q) => [q.ticker, q]))

  let totalValueUsd = 0
  let totalCostUsd = 0
  const currencyBuckets = new Map()
  const marketBuckets = new Map()
  const sectorBuckets = new Map()
  const industryBuckets = new Map()
  const groupBuckets = new Map()
  const brokerBuckets = new Map()

  const enrichedPositions = positions.map((p) => {
    const q = quoteMap[p.ticker] || {}
    const currency = tickerCurrency(p.ticker)
    const fx = fxForTicker(p.ticker, ilsToUsd)
    const currentPrice = numberValue(q.price)
    const dividendRate = q.dividendRate ?? null
    const dividendYieldValue = dividendYield(numberValue(dividendRate), currentPrice, q.dividendYield)
    const annualDividendIncomeUsd = numberValue(dividendRate) * numberValue(p.shares) * fx
    const value = currentPrice * numberValue(p.shares)
    const cost = numberValue(p.avgCost) * numberValue(p.shares)
    const valueUsd = value * fx
    const costUsd = cost * fx
    totalValueUsd += valueUsd
    totalCostUsd += costUsd

    pushBucket(currencyBuckets, currency, valueUsd)
    pushBucket(marketBuckets, marketForTicker(p.ticker), valueUsd)
    pushBucket(sectorBuckets, p.sector || 'Unknown', valueUsd)
    pushBucket(industryBuckets, p.industry || 'Unknown', valueUsd)
    for (const group of p.groups || []) pushBucket(groupBuckets, group, valueUsd)

    return {
      _id: p._id,
      ticker: p.ticker,
      companyName: q.name || p.companyName || p.ticker,
      currency,
      market: marketForTicker(p.ticker),
      sector: p.sector || 'Unknown',
      industry: p.industry || 'Unknown',
      groups: p.groups || [],
      shares: p.shares,
      avgCost: p.avgCost,
      currentPrice,
      dividendRate,
      dividendYield: q.dividendYield ?? null,
      dividendYieldValue,
      annualDividendIncomeUsd,
      value,
      valueUsd,
      cost,
      costUsd,
      pnlUsd: valueUsd - costUsd,
      pnlPercent: costUsd > 0 ? ((valueUsd - costUsd) / costUsd) * 100 : 0,
      beta: typeof p.beta === 'number' ? p.beta : null,
    }
  })

  const holdings = enrichedPositions
    .map((p) => ({ticker: p.ticker, companyName: p.companyName, valueUsd: p.valueUsd, percent: percent(p.valueUsd, totalValueUsd)}))
    .sort((a, b) => b.valueUsd - a.valueUsd)

  for (const tx of transactions) {
    if (tx.feeProfile?.name) pushBucket(brokerBuckets, tx.feeProfile.name, Math.abs(numberValue(tx.total)) * fxForTicker(tx.ticker, ilsToUsd))
  }

  const txSummary = transactions.reduce((summary, tx) => {
    const fx = fxForTicker(tx.ticker, ilsToUsd)
    const total = numberValue(tx.total) * fx
    const fee = numberValue(tx.feeAmount) * fx
    summary.activityCount += 1
    if (tx.type === 'buy') summary.buyTotalUsd += total
    if (tx.type === 'sell') summary.sellTotalUsd += total
    if (tx.type === 'dividend' && !tx.drip) {
      const divRaw = numberValue(tx.total) || (numberValue(tx.shares) * numberValue(tx.price))
      summary.dividendsUsd += divRaw * fx
    }
    summary.feesUsd += fee
    const ts = new Date(tx.date).getTime()
    if (Number.isFinite(ts)) {
      summary.firstActivityAt = summary.firstActivityAt ? Math.min(summary.firstActivityAt, ts) : ts
      summary.lastActivityAt = summary.lastActivityAt ? Math.max(summary.lastActivityAt, ts) : ts
    }
    return summary
  }, {activityCount: 0, buyTotalUsd: 0, sellTotalUsd: 0, feesUsd: 0, dividendsUsd: 0, firstActivityAt: null, lastActivityAt: null})

  const alertTickers = new Set(alerts.map((a) => a.ticker))
  const positionsWithAlerts = enrichedPositions.filter((p) => alertTickers.has(p.ticker)).length
  const sectorCount = new Set(enrichedPositions.map((p) => p.sector).filter((sector) => sector && sector !== 'Unknown')).size
  const annualDividendIncomeUsd = enrichedPositions.reduce((sum, p) => sum + numberValue(p.annualDividendIncomeUsd), 0)
  const dividendPayerCount = enrichedPositions.filter((p) => numberValue(p.annualDividendIncomeUsd) > 0 || numberValue(p.dividendYieldValue) > 0).length

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      positionCount: enrichedPositions.length,
      sectorCount,
      dividendPayerCount,
      totalValueUsd,
      totalCostUsd,
      unrealizedPnlUsd: totalValueUsd - totalCostUsd,
      unrealizedPnlPercent: totalCostUsd > 0 ? ((totalValueUsd - totalCostUsd) / totalCostUsd) * 100 : 0,
      activeAlertCount: alerts.length,
      positionsWithAlerts,
      annualDividendIncomeUsd,
      dividendIncomeYield: totalValueUsd > 0 ? (annualDividendIncomeUsd / totalValueUsd) * 100 : 0,
      ilsToUsd,
      timeInMarketDays: txSummary.firstActivityAt ? Math.max(0, Math.round((Date.now() - txSummary.firstActivityAt) / 86_400_000)) : null,
      ...txSummary,
      firstActivityAt: txSummary.firstActivityAt ? new Date(txSummary.firstActivityAt).toISOString() : null,
      lastActivityAt: txSummary.lastActivityAt ? new Date(txSummary.lastActivityAt).toISOString() : null,
    },
    positions: enrichedPositions
      .map((p) => ({...p, allocationPercent: percent(p.valueUsd, totalValueUsd), hasAlert: alertTickers.has(p.ticker)}))
      .sort((a, b) => b.valueUsd - a.valueUsd),
    allocations: {
      currency: bucketRows(currencyBuckets, totalValueUsd, 'currency'),
      market: bucketRows(marketBuckets, totalValueUsd, 'market'),
      sector: bucketRows(sectorBuckets, totalValueUsd, 'sector'),
      industry: bucketRows(industryBuckets, totalValueUsd, 'industry'),
      group: bucketRows(groupBuckets, totalValueUsd, 'group'),
      broker: bucketRows(brokerBuckets, txSummary.buyTotalUsd + txSummary.sellTotalUsd, 'broker'),
      holding: holdings,
    },
  }
}

async function getTickerSignals(positions, limit = 16) {
  const selected = positions.slice(0, limit)
  const rows = await Promise.all(selected.map(async (position) => {
    const ticker = position.ticker
    const [insightResult, analystResult] = await Promise.allSettled([
      getEnrichment(ticker),
      getAnalystInsight(ticker),
    ])
    const insight = insightResult.status === 'fulfilled' ? insightResult.value : null
    const analyst = analystResult.status === 'fulfilled' ? analystResult.value : null
    return {
      ticker,
      allocationPercent: position.allocationPercent,
      sentiment: insight?.summary?.sentiment ?? null,
      momentum: insight?.summary?.momentum ?? null,
      articleCount7d: insight?.summary?.articleCount7d ?? null,
      analystDelta: insight?.summary?.analystDelta ?? null,
      insiderNet3m: insight?.summary?.insiderNet3m ?? null,
      daysToCover: insight?.summary?.daysToCover ?? null,
      nextEventDays: insight?.summary?.daysToNextEvent ?? null,
      rating: analyst?.recommendation?.rating ?? null,
      valuation: analyst?.valuation?.description ?? null,
      hasAnalystResearch: Boolean(analyst?.recommendation || analyst?.valuation || analyst?.outlook),
      hasInsightData: Boolean(insight && (insight.summary?.articleCount7d || insight.summary?.sentiment != null)),
    }
  }))
  return rows
}

async function getPortfolioXRay(userId) {
  const analytics = await getPortfolioAnalytics(userId)
  const rules = []
  const positions = analytics.positions
  const totalValueUsd = analytics.summary.totalValueUsd

  if (!positions.length) {
    addRule(rules, {
      key: 'no-positions',
      status: 'warn',
      title: 'No holdings to analyze',
      message: 'Add positions before running Portfolio X-Ray.',
      suggestion: 'Import or add your first transaction.',
    })
    return {generatedAt: new Date().toISOString(), summary: summarizeRules(rules), rules, analytics, tickerSignals: []}
  }

  const largestHolding = analytics.allocations.holding[0]
  const largestSector = analytics.allocations.sector[0]
  const largestCurrency = analytics.allocations.currency[0]
  const largestMarket = analytics.allocations.market[0]
  const taseExposure = analytics.allocations.market.find((row) => row.market === 'TASE')?.percent || 0
  const losingPositions = positions.filter((p) => p.pnlPercent <= -10)
  const feeDrag = totalValueUsd > 0 ? (analytics.summary.feesUsd / totalValueUsd) * 100 : 0

  // Driver tickers per bucket — the set of tickers that actually compose
  // that bucket's value, used to fingerprint correlated findings (e.g. when
  // one ticker alone accounts for the top holding, sector, market, and
  // currency, all four rules describe the same fact and should collapse).
  const tickersInSector = (sector) => positions.filter((p) => p.sector === sector).map((p) => p.ticker)
  const tickersInMarket = (market) => positions.filter((p) => p.market === market).map((p) => p.ticker)
  const tickersInCurrency = (currency) => positions.filter((p) => p.currency === currency).map((p) => p.ticker)

  addRule(rules, {
    key: 'holding-concentration',
    status: ruleStatus(largestHolding?.percent || 0, 20, 35),
    title: 'Single holding concentration',
    message: `${largestHolding?.ticker || 'Largest holding'} is ${numberValue(largestHolding?.percent).toFixed(1)}% of the portfolio.`,
    suggestion: 'Consider a rebalance target if one position becomes too dominant.',
    affectedTickers: largestHolding?.ticker ? [largestHolding.ticker] : [],
    cls: 'concentration',
    dimension: 'holding',
    drivers: largestHolding?.ticker ? [largestHolding.ticker] : [],
    value: numberValue(largestHolding?.percent) / 100,
    actionability: 0.9,
  })

  addRule(rules, {
    key: 'sector-concentration',
    status: ruleStatus(largestSector?.percent || 0, 35, 50),
    title: 'Sector concentration',
    message: `${largestSector?.sector || 'Top sector'} is ${numberValue(largestSector?.percent).toFixed(1)}% of portfolio value.`,
    suggestion: 'Check whether this sector exposure is intentional.',
    cls: 'concentration',
    dimension: 'sector',
    drivers: largestSector?.sector ? tickersInSector(largestSector.sector) : [],
    value: numberValue(largestSector?.percent) / 100,
    actionability: 0.5,
  })

  addRule(rules, {
    key: 'currency-concentration',
    status: ruleStatus(largestCurrency?.percent || 0, 75, 90),
    title: 'Currency concentration',
    message: `${largestCurrency?.currency || 'Top currency'} exposure is ${numberValue(largestCurrency?.percent).toFixed(1)}%.`,
    suggestion: 'Mixed-currency portfolios may need explicit FX risk awareness.',
    cls: 'concentration',
    dimension: 'currency',
    drivers: largestCurrency?.currency ? tickersInCurrency(largestCurrency.currency) : [],
    value: numberValue(largestCurrency?.percent) / 100,
    actionability: 0.2,
  })

  addRule(rules, {
    key: 'market-concentration',
    status: ruleStatus(largestMarket?.percent || 0, 75, 90),
    title: 'Market concentration',
    message: `${largestMarket?.market || 'Top market'} exposure is ${numberValue(largestMarket?.percent).toFixed(1)}%.`,
    suggestion: 'Compare this exposure with your target markets.',
    cls: 'concentration',
    dimension: 'market',
    drivers: largestMarket?.market ? tickersInMarket(largestMarket.market) : [],
    value: numberValue(largestMarket?.percent) / 100,
    actionability: 0.3,
  })

  addRule(rules, {
    key: 'tase-concentration',
    status: ruleStatus(taseExposure, 40, 65),
    title: 'Israeli market exposure',
    message: `TASE exposure is ${taseExposure.toFixed(1)}% of portfolio value.`,
    suggestion: 'Useful to track separately because ILS fees, FX, and local coverage behave differently.',
    cls: 'concentration',
    dimension: 'market',
    drivers: tickersInMarket('TASE'),
    value: taseExposure / 100,
    actionability: 0.3,
  })

  addRule(rules, {
    key: 'fee-drag',
    status: ruleStatus(feeDrag, 0.35, 1),
    title: 'Fee drag',
    message: `Recorded fees equal ${feeDrag.toFixed(2)}% of current portfolio value.`,
    suggestion: 'Review fee profiles and repeated small trades if this climbs.',
    cls: 'hygiene',
    actionability: 0.6,
  })

  addRule(rules, {
    key: 'losing-positions',
    status: losingPositions.length >= 3 ? 'fail' : losingPositions.length ? 'warn' : 'pass',
    title: 'Losing positions',
    message: losingPositions.length
      ? `${losingPositions.length} positions are down 10% or more.`
      : 'No position is down 10% or more.',
    suggestion: 'Review thesis notes, alerts, or position sizing for weak holdings.',
    affectedTickers: losingPositions.map((p) => p.ticker),
    cls: 'performance',
    actionability: 0.7,
  })

  const largePositionsWithoutAlerts = positions.filter((p) => p.allocationPercent >= 10 && !p.hasAlert)
  addRule(rules, {
    key: 'alert-coverage',
    status: largePositionsWithoutAlerts.length ? 'warn' : 'pass',
    title: 'Alert coverage',
    message: largePositionsWithoutAlerts.length
      ? `${largePositionsWithoutAlerts.length} holdings above 10% allocation have no active alert.`
      : 'Major holdings have active alert coverage.',
    suggestion: 'Add alerts on major holdings so large moves do not hide in the list.',
    affectedTickers: largePositionsWithoutAlerts.map((p) => p.ticker),
    cls: 'hygiene',
    actionability: 0.9,
  })

  const tickerSignals = await getTickerSignals(positions)
  const noInsight = tickerSignals.filter((row) => !row.hasInsightData)
  const bearishSignals = tickerSignals.filter((row) =>
    numberValue(row.momentum) < -0.15 ||
    numberValue(row.analystDelta) < 0 ||
    row.rating === 'SELL' ||
    row.valuation === 'Overvalued' ||
    numberValue(row.daysToCover) >= 4
  )

  // Coverage is not Pass — a momentum of 0.00 for a ticker with no analyzed
  // articles is missing data, not an assessment. Report it as a fact about
  // data availability, gated on materiality so a handful of untracked
  // micro-positions don't trigger a finding nobody can act on.
  const noInsightAllocation = tickerSignals
    .filter((row) => !row.hasInsightData)
    .reduce((sum, row) => sum + numberValue(row.allocationPercent), 0)
  addRule(rules, {
    key: 'news-coverage',
    status: noInsightAllocation >= 25 ? 'warn' : 'pass',
    title: 'Ticker insight coverage',
    message: noInsight.length
      ? `${noInsightAllocation.toFixed(1)}% of portfolio (${noInsight.length} of ${tickerSignals.length} checked holdings) has no signal coverage.`
      : 'Checked holdings have recent insight coverage.',
    suggestion: 'For .TA tickers this may mean the scraper needs more Israeli sources, not that the company is quiet.',
    affectedTickers: noInsight.map((row) => row.ticker),
    cls: 'coverage',
    actionability: 0.1,
  })

  addRule(rules, {
    key: 'bearish-ticker-signals',
    status: bearishSignals.length >= 3 ? 'fail' : bearishSignals.length ? 'warn' : 'pass',
    title: 'Bearish ticker signals',
    message: bearishSignals.length
      ? `${bearishSignals.length} checked holdings have bearish sentiment, analyst, valuation, or short-interest signals.`
      : 'No bearish ticker-level signals found in checked holdings.',
    suggestion: 'Open affected position pages to inspect Ticker Insight and Analyst Research before acting.',
    affectedTickers: bearishSignals.map((row) => row.ticker),
    cls: 'performance',
    actionability: 0.6,
  })

  const resolvedRules = resolveFindings(rules)

  return {
    generatedAt: new Date().toISOString(),
    summary: summarizeRules(resolvedRules),
    rules: resolvedRules,
    analytics,
    tickerSignals,
  }
}

module.exports = {
  getPortfolioAnalytics,
  getPortfolioXRay,
}
