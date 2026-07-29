const router = require('express').Router()
const { register, login, me, google, magicLink, updatePreferences, dismissWelcomeModal } = require('../controllers/authController')
const auth = require('../middleware/auth')

router.post('/register', register)
router.post('/login', login)
router.post('/google', google)
router.post('/magic-link', magicLink)
router.get('/me', auth, me)
router.put('/me/preferences', auth, updatePreferences)
router.post('/me/welcome-modal-seen', auth, dismissWelcomeModal)

module.exports = router
