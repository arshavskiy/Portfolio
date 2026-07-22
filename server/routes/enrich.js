const router = require('express').Router()
const auth = require('../middleware/auth')
const {getEnrichment, getTypologyMap, getRelatedTickers, getTickerNews, getMacroSnapshot} = require('../controllers/enrichController')

router.use(auth)
router.get('/typology-map', getTypologyMap)
router.get('/macro-snapshot', getMacroSnapshot)
router.get('/related/:ticker', getRelatedTickers)
router.get('/news/:ticker', getTickerNews)
router.get('/:ticker', getEnrichment)

module.exports = router
