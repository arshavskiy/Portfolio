const jwt = require('jsonwebtoken')
const {OAuth2Client} = require('google-auth-library')
const User = require('../models/User')
const PASSWORD_RULE = /^(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)

function signToken(id) {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN })
}

exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body
    if (!name || !email || !password)
      return res.status(400).json({ message: 'All fields required' })
      if (!PASSWORD_RULE.test(password)) {
          return res.status(400).json({message: 'Password must be at least 8 characters and include a number and a special character'})
      }

    const exists = await User.findOne({ email })
    if (exists) return res.status(409).json({ message: 'Email already registered' })

    const user = await User.create({ name, email, password })
    const token = signToken(user._id)
    res.status(201).json({ token, user })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password)
      return res.status(400).json({ message: 'Email and password required' })

    const user = await User.findOne({ email })
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
    if (user) {
      if (!user.googleId) {
        user.googleId = googleId
        await user.save()
      }
    } else {
      user = await User.create({ name: name || email, email, googleId })
    }

    const token = signToken(user._id)
    res.json({ token, user })
  } catch (err) {
    res.status(401).json({ message: 'Invalid Google credential' })
  }
}
