const router = require('express').Router()
const auth = require('../middleware/auth')
const {
    getPortfolio,
    getHistory,
    getGroups,
    addTransaction,
    getTransactions,
    getDividendSummary,
    getRealizedGains,
    updateTransaction,
    deleteTransaction,
    updatePositionGroups,
    deletePosition
} = require('../controllers/portfolioController')

router.use(auth)
router.get('/', getPortfolio)
router.get('/history', getHistory)
router.get('/groups', getGroups)
router.post('/transaction', addTransaction)
router.get('/transactions', getTransactions)
router.get('/dividends/summary', getDividendSummary)
router.get('/realized-gains', getRealizedGains)
router.put('/transaction/:id', updateTransaction)
router.delete('/transaction/:id', deleteTransaction)
router.put('/position/:id/groups', updatePositionGroups)
router.delete('/position/:id', deletePosition)

module.exports = router
