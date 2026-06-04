const router = require('express').Router()
const auth = require('../middleware/auth')
const {
    getPortfolio,
    getHistory,
    addTransaction,
    getTransactions,
    updateTransaction,
    deletePosition
} = require('../controllers/portfolioController')

router.use(auth)
router.get('/', getPortfolio)
router.get('/history', getHistory)
router.post('/transaction', addTransaction)
router.get('/transactions', getTransactions)
router.put('/transaction/:id', updateTransaction)
router.delete('/position/:id', deletePosition)

module.exports = router
