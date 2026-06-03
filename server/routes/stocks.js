const router = require('express').Router()
const auth = require('../middleware/auth')
const { getQuote, getHistory, search } = require('../controllers/stockController')

router.use(auth)
router.get('/search', search)
router.get('/quote/:ticker', getQuote)
router.get('/history/:ticker', getHistory)

module.exports = router
