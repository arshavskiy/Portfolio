const router = require('express').Router()
const { register, login, me, google } = require('../controllers/authController')
const auth = require('../middleware/auth')

router.post('/register', register)
router.post('/login', login)
router.post('/google', google)
router.get('/me', auth, me)

module.exports = router
