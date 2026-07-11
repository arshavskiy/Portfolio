const router = require('express').Router()
const auth = require('../middleware/auth')
const {
    getPortfolio,
    getHistory,
    getGroups,
    addTransaction,
    getTransactions,
    getDividendSummary,
    getDividendCalendar,
    getRealizedGains,
    updateTransaction,
    deleteTransaction,
    updatePositionGroups,
    updatePositionNotes,
    getPositionNotes,
    getRebalanceTargets,
    saveRebalanceTargets,
    deletePosition
} = require('../controllers/portfolioController')

router.use(auth)
router.get('/', getPortfolio)
router.get('/history', getHistory)
router.get('/groups', getGroups)
router.post('/transaction', addTransaction)
router.get('/transactions', getTransactions)
router.get('/dividends/summary', getDividendSummary)
router.get('/dividends/calendar', getDividendCalendar)
router.get('/realized-gains', getRealizedGains)
router.put('/transaction/:id', updateTransaction)
router.delete('/transaction/:id', deleteTransaction)
router.put('/position/:id/groups', updatePositionGroups)
router.get('/position/notes/:ticker', getPositionNotes)
router.get('/rebalance-targets', getRebalanceTargets)
router.put('/rebalance-targets', saveRebalanceTargets)
router.put('/position/notes/:ticker', updatePositionNotes)
router.delete('/position/:id', deletePosition)

module.exports = router
