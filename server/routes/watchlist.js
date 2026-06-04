const router = require('express').Router()
const auth = require('../middleware/auth')
const {getWatchlist, addToWatchlist, removeFromWatchlist, syncHoldings} = require('../controllers/watchlistController')

router.use(auth)
router.get('/', getWatchlist)
router.post('/', addToWatchlist)
router.post('/sync-holdings', syncHoldings)
router.delete('/:id', removeFromWatchlist)

module.exports = router
