const router = require('express').Router()
const auth = require('../middleware/auth')
const {logError, listErrors} = require('../controllers/errorController')

router.post('/', logError)
router.get('/', auth, listErrors)

module.exports = router
