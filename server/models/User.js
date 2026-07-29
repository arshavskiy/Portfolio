const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')
const PASSWORD_RULE = /^(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/
const USER_TYPES = ['regular', 'pro', 'max', 'admin', 'plan']
const REGULAR_AI_DAILY_LIMIT = 3
const AI_DAILY_TOKEN_LIMIT = 100000

function currentDayKey() {
  return new Date().toISOString().split('T')[0]
}

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
      email: {type: String, unique: true, sparse: true, lowercase: true, trim: true},
      username: {type: String, unique: true, sparse: true, lowercase: true, trim: true},
      password: {
          type: String,
          required: function () { return !this.googleId && !this.magicLinkOnly },
          minlength: 8,
          validate: {
              validator: function (value) {
                  if (!value) return true
                  return PASSWORD_RULE.test(value)
              },
              message: 'Password must be at least 8 characters and include a number and a special character',
          },
      },
      googleId: { type: String, unique: true, sparse: true },
      magicLinkOnly: {type: Boolean, default: false},
      userType: {type: String, enum: USER_TYPES, default: 'regular'},
      aiUsage: {
          dayKey: {type: String, default: null},
          questionCount: {type: Number, default: 0},
          tokenCount: {type: Number, default: 0},
      },
      aiDailySummary: {
          dayKey: {type: String, default: null},
          text: {type: String, default: null},
          generatedAt: {type: Date},
      },
      demoSeedVersion: {type: Number, default: 0},
      demoSeededAt: {type: Date},
      trialEndsAt: {type: Date},
      welcomeModalSeenAt: {type: Date},
      aiDailySummaryEnabled: {type: Boolean, default: true},
      aiDailySummaryCustomPrompt: {type: String, default: '', maxlength: 500},
      loginHistory: {
          type: [{
              method: {type: String, enum: ['password', 'google', 'magic-link']},
              ip: String,
              at: {type: Date, default: Date.now},
          }],
          default: [],
      },
  },
  { timestamps: true }
)

userSchema.pre('validate', function () {
    if (!this.email && !this.username) {
        this.invalidate('email', 'Either email or username is required')
    }
})

userSchema.pre('save', async function () {
  if (!this.isModified('password') || !this.password) return
  this.password = await bcrypt.hash(this.password, 12)
})

userSchema.methods.comparePassword = function (candidate) {
  if (!this.password) return Promise.resolve(false)
  return bcrypt.compare(candidate, this.password)
}

userSchema.methods.toJSON = function () {
  const obj = this.toObject()
  const usage = obj.aiUsage || {}
  const todayCount = usage.dayKey === currentDayKey() ? (Number.isFinite(usage.questionCount) ? usage.questionCount : 0) : 0
  const todayTokenCount = usage.dayKey === currentDayKey() ? (Number.isFinite(usage.tokenCount) ? usage.tokenCount : 0) : 0
  const resolvedUserType = obj.userType || 'regular'
  delete obj.password
  delete obj.aiUsage
  delete obj.loginHistory
  obj.aiUsageSummary = {
    todayCount,
    dailyLimit: resolvedUserType === 'regular' ? REGULAR_AI_DAILY_LIMIT : null,
    todayTokenCount,
    dailyTokenLimit: resolvedUserType === 'regular' ? AI_DAILY_TOKEN_LIMIT : null,
    unlimited: resolvedUserType !== 'regular',
  }
  return obj
}

module.exports = mongoose.model('User', userSchema)
