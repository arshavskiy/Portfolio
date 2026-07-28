const router = require('express').Router()
const auth = require('../middleware/auth')
const admin = require('../middleware/admin')
const {
    getEnrichment,
    getTypologyMap,
    getRelatedTickers,
    getTickerNews,
    getMacroSnapshot,
    getInsightsDataOverview,
} = require('../controllers/enrichController')

router.use(auth)
router.get('/typology-map', getTypologyMap)
router.get('/macro-snapshot', getMacroSnapshot)
router.get('/data/overview', admin, getInsightsDataOverview)
router.get('/related/:ticker', getRelatedTickers)
router.get('/news/:ticker', getTickerNews)
router.get('/:ticker', getEnrichment)

module.exports = router
