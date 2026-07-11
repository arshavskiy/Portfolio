const cron = require('node-cron')
const Position = require('../models/Position')
const Alert = require('../models/Alert')
const RebalanceTarget = require('../models/RebalanceTarget')
const {getQuotes, getQuote, getDividendCalendar, getIlsToUsd} = require('./stockService')
const {sendPush} = require('./pushService')

// Compare each user's live allocation against their saved rebalance targets.
// Push at most once per day per user when any position drifts past threshold.
async function checkAllocationDrift() {
    const configs = await RebalanceTarget.find({enabled: true, 'targets.0': {$exists: true}})
    if (!configs.length) return

    const dayAgo = Date.now() - 24 * 60 * 60 * 1000
    for (const config of configs) {
        if (config.lastNotifiedAt && config.lastNotifiedAt.getTime() > dayAgo) continue

        const positions = await Position.find({user: config.user, shares: {$gt: 0}}).lean()
        if (!positions.length) continue

        const [quotes, ilsToUsd] = await Promise.all([
            getQuotes(positions.map((p) => p.ticker)),
            getIlsToUsd().catch(() => 1),
        ])
        const priceByTicker = {}
        quotes.forEach((q) => { if (q) priceByTicker[q.ticker] = q.price })

        let totalUsd = 0
        const valueByTicker = {}
        for (const pos of positions) {
            const price = priceByTicker[pos.ticker]
            if (price == null) continue
            const fx = pos.ticker.endsWith('.TA') ? ilsToUsd : 1
            const value = price * pos.shares * fx
            valueByTicker[pos.ticker] = value
            totalUsd += value
        }
        if (totalUsd <= 0) continue

        const drifted = []
        for (const target of config.targets) {
            const currentPct = ((valueByTicker[target.ticker] || 0) / totalUsd) * 100
            const drift = currentPct - target.percent
            if (Math.abs(drift) >= config.threshold) {
                drifted.push(`${target.ticker} ${drift > 0 ? '+' : ''}${drift.toFixed(1)}%`)
            }
        }
        if (!drifted.length) continue

        config.lastNotifiedAt = new Date()
        await config.save()
        await sendPush(config.user, {
            title: 'Portfolio drift alert',
            body: `Off target: ${drifted.slice(0, 4).join(', ')} — consider rebalancing.`,
            data: {url: '/rebalance'},
        }).catch((err) => console.error('[cron] drift push error:', err.message))
        console.log(`[cron] Drift alert sent (user ${config.user}): ${drifted.join(', ')}`)
    }
}

// Push a heads-up the day before a held ticker goes ex-dividend. Buying (or
// selling) before the ex-date decides dividend eligibility, so the day-before
// warning is the actionable one.
async function notifyUpcomingDividends() {
    const positions = await Position.find({shares: {$gt: 0}}).lean()
    if (!positions.length) return

    const tickers = [...new Set(positions.map((p) => p.ticker))]
    const entries = await getDividendCalendar(tickers)

    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowKey = tomorrow.toISOString().split('T')[0]

    const exDivTomorrow = new Set(
        entries
            .filter((e) => e.exDividendDate &&
                new Date(e.exDividendDate).toISOString().split('T')[0] === tomorrowKey)
            .map((e) => e.ticker)
    )
    if (!exDivTomorrow.size) return

    for (const pos of positions) {
        if (!exDivTomorrow.has(pos.ticker)) continue
        await sendPush(pos.user, {
            title: `${pos.ticker} ex-dividend tomorrow`,
            body: `${pos.ticker} trades ex-dividend tomorrow — you hold ${pos.shares} shares.`,
            data: {url: `/position/${pos.ticker}`, ticker: pos.ticker},
        }).catch((err) => console.error('[cron] dividend push error:', err.message))
        console.log(`[cron] Ex-dividend notice sent: ${pos.ticker} (user ${pos.user})`)
    }
}

// Check every active alert against the latest quote. Trigger + push when the
// price condition is met, then mark the alert as triggered (one-shot).
async function checkAlerts() {
    const alerts = await Alert.find({active: true})
    if (!alerts.length) return
    
    // Refresh quotes once per unique ticker (cached for 5 min in stockService).
    const tickers = [...new Set(alerts.map((a) => a.ticker))]
    const quotes = await getQuotes(tickers)
    const priceByTicker = {}
    quotes.forEach((q) => {
        if (q) priceByTicker[q.ticker] = q.price
    })
    
    for (const alert of alerts) {
        const price = priceByTicker[alert.ticker]
        if (price == null) continue
        
        const hit =
            (alert.condition === 'above' && price >= alert.target) ||
            (alert.condition === 'below' && price <= alert.target)
        if (!hit) continue
        
        alert.active = false
        alert.triggeredAt = new Date()
        alert.triggeredPrice = price
        await alert.save()
        
        const arrow = alert.condition === 'above' ? '↑' : '↓'
        await sendPush(alert.user, {
            title: `${alert.ticker} ${arrow} ${alert.target}`,
            body: `${alert.ticker} is now ${price.toFixed(2)} (alert: ${alert.condition} ${alert.target})`,
            data: {url: `/stock/${alert.ticker}`, ticker: alert.ticker},
        }).catch((err) => console.error('[cron] push error:', err.message))
        
        console.log(`[cron] Alert triggered: ${alert.ticker} ${alert.condition} ${alert.target} @ ${price}`)
    }
}

// All US-session crons are pinned to Eastern time so the schedules mean what
// they say regardless of the host timezone (Railway runs UTC).
const ET = {timezone: 'America/New_York'}

// Refresh quotes for every held ticker in chunks of 10 with a 300ms pause
// between chunks. Smooths out the Yahoo request spike that a single
// Promise.all over many tickers would cause at cron fire time.
async function refreshQuotes(label) {
    const positions = await Position.distinct('ticker')
    if (!positions.length) return
    const CHUNK = 10
    const DELAY = 300
    for (let i = 0; i < positions.length; i += CHUNK) {
        const chunk = positions.slice(i, i + CHUNK)
        await getQuotes(chunk)
        if (i + CHUNK < positions.length) await new Promise((r) => setTimeout(r, DELAY))
    }
    console.log(`[cron] Refreshed quotes (${label}) for: ${positions.join(', ')}`)
}

function startCronJobs() {
    // Regular US market hours: 09:30–16:00 ET, Mon–Fri.
    cron.schedule('*/5 9-16 * * 1-5', async () => {
    try {
        await refreshQuotes('regular')
    } catch (err) {
      console.error('[cron] Quote refresh error:', err.message)
    }
    }, ET)
    
    // After-hours close: one run at 19:55 ET — just before the post-market
    // session ends (20:00 ET), while Yahoo still reports postMarket* fields and
    // marketState POST, Mon–Fri. Captures the final after-hours price so the
    // last close is persisted even when no user opens the app. getQuote persists
    // any fresh extended-hours values it sees (stockService.saveExtendedSnapshot).
    cron.schedule('55 19 * * 1-5', async () => {
        try {
            await refreshQuotes('after-hours close')
        } catch (err) {
            console.error('[cron] After-hours close refresh error:', err.message)
        }
    }, ET)

    // Check price alerts every 5 minutes, broader hours (covers TASE + extended).
    cron.schedule('*/5 * * * *', async () => {
        try {
            await checkAlerts()
        } catch (err) {
            console.error('[cron] Alert check error:', err.message)
        }
    })

    // Ex-dividend heads-up once a day at 08:00 ET, before the US session opens.
    cron.schedule('0 8 * * *', async () => {
        try {
            await notifyUpcomingDividends()
        } catch (err) {
            console.error('[cron] Dividend notify error:', err.message)
        }
    }, ET)

    // Allocation drift check after US close, Mon–Fri.
    cron.schedule('30 16 * * 1-5', async () => {
        try {
            await checkAllocationDrift()
        } catch (err) {
            console.error('[cron] Drift check error:', err.message)
        }
    }, ET)

  console.log('Cron jobs started')
}

module.exports = {startCronJobs, checkAlerts, notifyUpcomingDividends, checkAllocationDrift}
