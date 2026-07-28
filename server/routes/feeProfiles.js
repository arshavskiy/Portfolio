const router = require('express').Router()
const auth = require('../middleware/auth')
const {
  getProfiles,
  createProfile,
  updateProfile,
  deleteProfile,
  simulateTransactionCosts,
} = require('../controllers/feeProfileController')

router.use(auth)
router.get('/', getProfiles)
router.post('/simulate', simulateTransactionCosts)
router.post('/', createProfile)
router.put('/:id', updateProfile)
router.delete('/:id', deleteProfile)

module.exports = router
