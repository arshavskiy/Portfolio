const router = require('express').Router()
const auth = require('../middleware/auth')
const { getQuote, getHistory, search, getMarkets, getTrending, getMarketNews, getNewsArticle, getIlsFx } = require('../controllers/stockController')

router.use(auth)
router.get('/search', search)
router.get('/markets', getMarkets)
router.get('/trending', getTrending)
router.get('/news', getMarketNews)
router.get('/news/article/:id', getNewsArticle)
router.get('/fx/ils-to-usd', getIlsFx)
router.get('/quote/:ticker', getQuote)
router.get('/history/:ticker', getHistory)

module.exports = router
