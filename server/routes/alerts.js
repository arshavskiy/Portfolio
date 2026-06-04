const router = require('express').Router()
const auth = require('../middleware/auth')
const {
    getVapidKey,
    subscribe,
    unsubscribe,
    getAlerts,
    createAlert,
    updateAlert,
    deleteAlert,
} = require('../controllers/alertController')

router.use(auth)

router.get('/vapid-key', getVapidKey)
router.post('/subscribe', subscribe)
router.post('/unsubscribe', unsubscribe)

router.get('/', getAlerts)
router.post('/', createAlert)
router.put('/:id', updateAlert)
router.delete('/:id', deleteAlert)

module.exports = router
