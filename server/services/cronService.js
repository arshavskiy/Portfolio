const cron = require('node-cron')
const Position = require('../models/Position')
const { getQuotes } = require('./stockService')

function startCronJobs() {
  // Refresh quote cache every 5 minutes during market hours (Mon-Fri 9:30-16:00 ET)
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

  console.log('Cron jobs started')
}

module.exports = { startCronJobs }
