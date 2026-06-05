require('dotenv').config()
const mongoose = require('mongoose')
const Watchlist = require('../models/Watchlist')
const {getTickerProfile} = require('../services/stockService')

async function run() {
    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI is not configured')
    }
    
    await mongoose.connect(process.env.MONGODB_URI)
    
    const items = await Watchlist.find({}).sort({createdAt: 1, addedAt: 1})
    let updated = 0
    let unchanged = 0
    let failed = 0
    
    for (const item of items) {
        try {
            const profile = await getTickerProfile(item.ticker, item.companyName)
            const nextCompanyName = profile.companyName || item.companyName || item.ticker
            const nextSector = profile.sector || null
            const nextIndustry = profile.industry || null
            
            const changed =
                item.companyName !== nextCompanyName ||
                (item.sector || null) !== nextSector ||
                (item.industry || null) !== nextIndustry
            
            if (!changed) {
                unchanged += 1
                continue
            }
            
            item.companyName = nextCompanyName
            item.sector = nextSector
            item.industry = nextIndustry
            await item.save()
            updated += 1
        } catch (err) {
            failed += 1
            console.error(`Failed ${item.ticker}: ${err.message}`)
        }
    }
    
    console.log(JSON.stringify({
        total: items.length,
        updated,
        unchanged,
        failed,
    }))
}

run()
    .catch((err) => {
        console.error(err.message)
        process.exitCode = 1
    })
    .finally(async () => {
        try {
            await mongoose.disconnect()
        } catch {
        }
    })
