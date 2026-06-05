const router = require('express').Router()
const auth = require('../middleware/auth')
const { getQuote, getHistory, search, getMarkets, getTrending, getMarketNews } = require('../controllers/stockController')

router.use(auth)
router.get('/search', search)
router.get('/markets', getMarkets)
router.get('/trending', getTrending)
router.get('/news', getMarketNews)
router.get('/quote/:ticker', getQuote)
router.get('/history/:ticker', getHistory)

module.exports = router
