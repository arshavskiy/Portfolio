const router = require('express').Router()
const auth = require('../middleware/auth')
const {
    getPortfolio,
    getAnalytics,
    getXRay,
    getHistory,
    getReturnMetrics,
    getRiskExposure,
    getGroups,
    addTransaction,
    getTransactions,
    getDividendSummary,
    getDividendCalendar,
    getDividendFrequencies,
    getDividendPaymentHistory,
    getRealizedGains,
    getIncomeProjection,
    updateTransaction,
    deleteTransaction,
    updatePositionGroups,
    updatePositionNotes,
    getPositionNotes,
    getRebalanceTargets,
    saveRebalanceTargets,
    deletePosition,
    archivePositions,
    getClosedPositions
} = require('../controllers/portfolioController')

router.use(auth)
router.get('/', getPortfolio)
router.get('/analytics', getAnalytics)
router.get('/x-ray', getXRay)
router.get('/history', getHistory)
router.get('/return-metrics', getReturnMetrics)
router.get('/risk', getRiskExposure)
router.get('/groups', getGroups)
router.post('/transaction', addTransaction)
router.get('/transactions', getTransactions)
router.get('/dividends/summary', getDividendSummary)
router.get('/dividends/calendar', getDividendCalendar)
router.get('/dividends/frequency', getDividendFrequencies)
router.get('/dividends/history', getDividendPaymentHistory)
router.get('/realized-gains', getRealizedGains)
router.get('/income-projection', getIncomeProjection)
router.put('/transaction/:id', updateTransaction)
router.delete('/transaction/:id', deleteTransaction)
router.put('/position/:id/groups', updatePositionGroups)
router.get('/position/notes/:ticker', getPositionNotes)
router.get('/rebalance-targets', getRebalanceTargets)
router.put('/rebalance-targets', saveRebalanceTargets)
router.put('/position/notes/:ticker', updatePositionNotes)
router.put('/positions/archive', archivePositions)
router.delete('/position/:id', deletePosition)
router.get('/closed-positions', getClosedPositions)

module.exports = router
