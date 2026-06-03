require('dotenv').config()
const express = require('express')
const cors = require('cors')
const mongoose = require('mongoose')
const rateLimit = require('express-rate-limit')

const authRoutes = require('./routes/auth')
const portfolioRoutes = require('./routes/portfolio')
const stockRoutes = require('./routes/stocks')
const watchlistRoutes = require('./routes/watchlist')
const feeProfileRoutes = require('./routes/feeProfiles')
const { startCronJobs } = require('./services/cronService')

const app = express()

app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }))
app.use(express.json())
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }))

app.use('/api/auth', authRoutes)
app.use('/api/portfolio', portfolioRoutes)
app.use('/api/stocks', stockRoutes)
app.use('/api/watchlist', watchlistRoutes)
app.use('/api/fee-profiles', feeProfileRoutes)

app.get('/api/health', (req, res) => res.json({ status: 'ok' }))

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('MongoDB connected')
    startCronJobs()
    app.listen(process.env.PORT || 3000, () =>
      console.log(`Server running on port ${process.env.PORT || 3000}`)
    )
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err)
    process.exit(1)
  })
