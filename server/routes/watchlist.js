const router = require('express').Router()
const auth = require('../middleware/auth')
const {getWatchlist, addToWatchlist, removeFromWatchlist, syncHoldings, updateWatchlistGroups} = require('../controllers/watchlistController')

router.use(auth)
router.get('/', getWatchlist)
router.post('/', addToWatchlist)
router.post('/sync-holdings', syncHoldings)
router.put('/:id/groups', updateWatchlistGroups)
router.delete('/:id', removeFromWatchlist)

module.exports = router
