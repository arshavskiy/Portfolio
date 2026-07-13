const jwt = require('jsonwebtoken')
const {OAuth2Client} = require('google-auth-library')
const User = require('../models/User')
const {seedDemoAccount} = require('../services/demoSeedService')
const PASSWORD_RULE = /^(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)

function signToken(id) {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN })
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

    const token = signToken(user._id)
    res.json({ token, user })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

exports.me = async (req, res) => {
  res.json({ user: req.user })
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

    if (created) await seedDemoAccount(user)

    const token = signToken(user._id)
    res.json({ token, user })
  } catch (err) {
    res.status(401).json({ message: 'Invalid Google credential' })
  }
}
