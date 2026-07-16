require('dotenv').config()
const mongoose = require('mongoose')
const User = require('../models/User')

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required')
  }

  await mongoose.connect(process.env.MONGODB_URI)

  const result = await User.updateMany(
    { userType: { $exists: false } },
    { $set: { userType: 'regular' } }
  )

  console.log(`Matched ${result.matchedCount} users; updated ${result.modifiedCount} users to regular`)
}

main()
  .catch((err) => {
    console.error(err.message)
    process.exitCode = 1
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {})
  })
