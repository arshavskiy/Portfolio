const router = require('express').Router()
const { register, login, me, google, magicLink, updatePreferences } = require('../controllers/authController')
const auth = require('../middleware/auth')

router.post('/register', register)
router.post('/login', login)
router.post('/google', google)
router.post('/magic-link', magicLink)
router.get('/me', auth, me)
router.put('/me/preferences', auth, updatePreferences)

module.exports = router
