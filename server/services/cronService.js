const cron = require('node-cron')
const Position = require('../models/Position')
const Alert = require('../models/Alert')
const {getQuotes, getQuote} = require('./stockService')
const {sendPush} = require('./pushService')

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

// Refresh quotes for every held ticker. Each getQuote also persists any fresh
// extended-hours values (see stockService.saveExtendedSnapshot).
async function refreshQuotes(label, {force = false} = {}) {
    const positions = await Position.distinct('ticker')
    if (!positions.length) return
    await getQuotes(positions, {force})
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
            await refreshQuotes('after-hours close', {force: true})
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

  console.log('Cron jobs started')
}

module.exports = {startCronJobs, checkAlerts}
