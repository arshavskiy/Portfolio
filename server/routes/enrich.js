const router = require('express').Router()
const auth = require('../middleware/auth')
const {getEnrichment, getTypologyMap, getRelatedTickers, getTickerNews} = require('../controllers/enrichController')

router.use(auth)
router.get('/typology-map', getTypologyMap)
router.get('/related/:ticker', getRelatedTickers)
router.get('/news/:ticker', getTickerNews)
router.get('/:ticker', getEnrichment)

module.exports = router
