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

function startCronJobs() {
    // Refresh quote cache every 5 minutes during US market hours (Mon-Fri).
  cron.schedule('*/5 14-21 * * 1-5', async () => {
    try {
      const positions = await Position.distinct('ticker')
      if (positions.length > 0) {
        await getQuotes(positions)
        console.log(`[cron] Refreshed quotes for: ${positions.join(', ')}`)
      }
    } catch (err) {
      console.error('[cron] Quote refresh error:', err.message)
    }
  })
    
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
