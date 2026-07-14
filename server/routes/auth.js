const router = require('express').Router()
const { register, login, me, google, magicLink } = require('../controllers/authController')
const auth = require('../middleware/auth')

router.post('/register', register)
router.post('/login', login)
router.post('/google', google)
router.post('/magic-link', magicLink)
router.get('/me', auth, me)

module.exports = router
