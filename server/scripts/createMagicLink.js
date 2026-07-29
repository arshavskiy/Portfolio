require('dotenv').config()
const crypto = require('crypto')
const mongoose = require('mongoose')
const User = require('../models/User')
const MagicLinkToken = require('../models/MagicLinkToken')
const {seedDemoAccount, grantTrial} = require('../services/demoSeedService')

const EXPIRY_DAYS = 7

async function main() {
  const [name, email] = process.argv.slice(2)
  if (!name || !email) {
    console.error('Usage: node scripts/createMagicLink.js "Name" email@example.com')
    process.exit(1)
  }

  await mongoose.connect(process.env.MONGODB_URI)

  let user = await User.findOne({email: email.toLowerCase().trim()})
  if (!user) {
    user = await User.create({name, email: email.toLowerCase().trim(), magicLinkOnly: true})
    await seedDemoAccount(user)
    await grantTrial(user)
  }

  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000)
  await MagicLinkToken.create({user: user._id, token, expiresAt})

  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173'
  console.log(`Magic link for ${user.email}:`)
  console.log(`${clientUrl}/login?magic=${token}`)
  console.log(`Expires: ${expiresAt.toISOString()}`)

  await mongoose.disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
