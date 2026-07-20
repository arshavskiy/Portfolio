const {getEnrichment, getTypologyMap, getRelatedTickers} = require('../services/stockfolioInsightsService')

exports.getEnrichment = async (req, res) => {
    try {
        const data = await getEnrichment(req.params.ticker.toUpperCase())
        res.json(data)
    } catch (err) {
        res.status(500).json({message: err.message})
    }
}

exports.getTypologyMap = async (req, res) => {
    try {
        const data = await getTypologyMap(req.query.group)
        res.json(data)
    } catch (err) {
        res.status(500).json({message: err.message})
    }
}

exports.getRelatedTickers = async (req, res) => {
    try {
        const days = Math.min(Number(req.query.days) || 30, 90)
        const data = await getRelatedTickers(req.params.ticker.toUpperCase(), days)
        res.json(data)
    } catch (err) {
        res.status(500).json({message: err.message})
    }
}
