const router = require('express').Router()
const auth = require('../middleware/auth')
const {
    getQuote,
    getHistory,
    search,
    getMarkets,
    getTrending,
    getMarketNews,
    getNewsArticle,
    getIlsFx,
    validateTickers,
    askPortfolioQuestion,
    getAiChatHistory,
    deleteAiChatHistory,
    getAiDailySummary,
    getAnalystResearch,
    getDividendHistory
} = require('../controllers/stockController')

router.use(auth)
router.get('/search', search)
router.get('/markets', getMarkets)
router.get('/trending', getTrending)
router.get('/news', getMarketNews)
router.get('/news/article/:id', getNewsArticle)
router.post('/ai-ask', askPortfolioQuestion)
router.get('/ai-daily-summary', getAiDailySummary)
router.get('/ai-chat', getAiChatHistory)
router.delete('/ai-chat', deleteAiChatHistory)
router.get('/fx/ils-to-usd', getIlsFx)
router.post('/validate-tickers', validateTickers)
router.get('/analyst/:ticker', getAnalystResearch)
router.get('/quote/:ticker', getQuote)
router.get('/history/:ticker', getHistory)
router.get('/dividends/:ticker', getDividendHistory)

module.exports = router
