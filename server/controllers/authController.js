const jwt = require('jsonwebtoken')
const {OAuth2Client} = require('google-auth-library')
const User = require('../models/User')
const MagicLinkToken = require('../models/MagicLinkToken')
const {seedDemoAccount, grantTrial} = require('../services/demoSeedService')
const PASSWORD_RULE = /^(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)

function signToken(id) {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN })
}

const LOGIN_HISTORY_LIMIT = 20

async function recordLogin(user, method, req) {
  user.loginHistory.push({method, ip: req.ip, at: new Date()})
  if (user.loginHistory.length > LOGIN_HISTORY_LIMIT)
    user.loginHistory = user.loginHistory.slice(-LOGIN_HISTORY_LIMIT)
  await user.save()
}

const EMAIL_RULE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

exports.register = async (req, res) => {
  try {
    const {name, password} = req.body
    const identifier = (req.body.identifier || req.body.email || '').trim().toLowerCase()
    if (!name || !identifier || !password)
      return res.status(400).json({ message: 'All fields required' })
      if (!PASSWORD_RULE.test(password)) {
          return res.status(400).json({message: 'Password must be at least 8 characters and include a number and a special character'})
      }
    
    const isEmail = EMAIL_RULE.test(identifier)
    const query = isEmail ? {email: identifier} : {username: identifier}
    const exists = await User.findOne(query)
    if (exists) return res.status(409).json({message: isEmail ? 'Email already registered' : 'Username already taken'})
    
    const user = await User.create({name, password, ...query})
    await seedDemoAccount(user)
    await grantTrial(user)
    const token = signToken(user._id)
    res.status(201).json({ token, user })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

exports.login = async (req, res) => {
  try {
    const {password} = req.body
    const identifier = (req.body.identifier || req.body.email || '').trim().toLowerCase()
    if (!identifier || !password)
      return res.status(400).json({message: 'Email/username and password required'})
    
    const user = await User.findOne({$or: [{email: identifier}, {username: identifier}]})
    if (!user || !(await user.comparePassword(password)))
      return res.status(401).json({ message: 'Invalid credentials' })

    await recordLogin(user, 'password', req)
    const token = signToken(user._id)
    res.json({ token, user })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

exports.magicLink = async (req, res) => {
  try {
    const {token} = req.body
    if (!token) return res.status(400).json({message: 'Missing token'})

    const record = await MagicLinkToken.findOne({token})
    if (!record || record.expiresAt < new Date())
      return res.status(401).json({message: 'Invalid or expired link'})

    const user = await User.findById(record.user)
    if (!user) return res.status(401).json({message: 'Invalid or expired link'})

    await recordLogin(user, 'magic-link', req)
    const jwtToken = signToken(user._id)
    res.json({token: jwtToken, user})
  } catch (err) {
    res.status(500).json({message: err.message})
  }
}

exports.me = async (req, res) => {
  res.json({ user: req.user })
}

const PROMPT_CUSTOM_USER_TYPES = ['pro', 'max', 'admin']
const AI_DAILY_SUMMARY_CUSTOM_PROMPT_MAX_LENGTH = 500

exports.updatePreferences = async (req, res) => {
  try {
    const {aiDailySummaryEnabled, aiDailySummaryCustomPrompt} = req.body
    const update = {}
    const unset = {}

    if (aiDailySummaryEnabled !== undefined) {
      if (typeof aiDailySummaryEnabled !== 'boolean')
        return res.status(400).json({message: 'aiDailySummaryEnabled must be a boolean'})
      update.aiDailySummaryEnabled = aiDailySummaryEnabled
    }

    if (aiDailySummaryCustomPrompt !== undefined) {
      if (typeof aiDailySummaryCustomPrompt !== 'string')
        return res.status(400).json({message: 'aiDailySummaryCustomPrompt must be a string'})
      if (!PROMPT_CUSTOM_USER_TYPES.includes(req.user.userType))
        return res.status(403).json({message: 'Custom daily prompt is available on Pro and above'})
      const nextCustomPrompt = aiDailySummaryCustomPrompt.trim().slice(0, AI_DAILY_SUMMARY_CUSTOM_PROMPT_MAX_LENGTH)
      update.aiDailySummaryCustomPrompt = nextCustomPrompt
      if (nextCustomPrompt !== (req.user.aiDailySummaryCustomPrompt || ''))
        unset.aiDailySummary = ''
    }

    if (!Object.keys(update).length)
      return res.status(400).json({message: 'No valid preferences provided'})

    const updateQuery = Object.keys(unset).length ? {...update, $unset: unset} : update
    const user = await User.findByIdAndUpdate(req.user._id, updateQuery, {new: true})
    res.json({user})
  } catch (err) {
    res.status(500).json({message: err.message})
  }
}

exports.dismissWelcomeModal = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.user._id, {welcomeModalSeenAt: new Date()}, {new: true})
    res.json({user})
  } catch (err) {
    res.status(500).json({message: err.message})
  }
}

exports.google = async (req, res) => {
  try {
    const { credential } = req.body
    if (!credential) return res.status(400).json({ message: 'Missing Google credential' })

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    })
    const payload = ticket.getPayload()
    const { sub: googleId, email, name } = payload

    let user = await User.findOne({ $or: [{ googleId }, { email }] })
    let created = false
    if (user) {
      if (!user.googleId) {
        user.googleId = googleId
        await user.save()
      }
    } else {
      user = await User.create({ name: name || email, email, googleId })
      created = true
    }

    if (created) {
      await seedDemoAccount(user)
      await grantTrial(user)
    }

    await recordLogin(user, 'google', req)
    const token = signToken(user._id)
    res.json({ token, user })
  } catch (err) {
    res.status(401).json({ message: 'Invalid Google credential' })
  }
}
