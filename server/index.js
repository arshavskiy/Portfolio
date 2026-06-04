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
const alertRoutes = require('./routes/alerts')
const { startCronJobs } = require('./services/cronService')
const {initPush} = require('./services/pushService')

const app = express()

const localDevOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
]

const configuredOrigins = [
  ...localDevOrigins,
  ...(process.env.CORS_ORIGINS || process.env.CLIENT_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
]

function isAllowedOrigin(origin) {
  if (!origin) return true
  if (configuredOrigins.includes(origin)) return true
  if (process.env.ALLOW_VERCEL_PREVIEWS !== 'false' && /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin))
    return true
  return false
}

app.use(cors({
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) return callback(null, true)
    return callback(new Error(`CORS blocked origin: ${origin}`))
  },
  credentials: true,
}))
app.use(express.json())
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  skip: () => process.env.NODE_ENV !== 'production',
}))

app.use('/api/auth', authRoutes)
app.use('/api/portfolio', portfolioRoutes)
app.use('/api/stocks', stockRoutes)
app.use('/api/watchlist', watchlistRoutes)
app.use('/api/fee-profiles', feeProfileRoutes)
app.use('/api/alerts', alertRoutes)

app.get('/api/health', (req, res) => res.json({ status: 'ok' }))

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('MongoDB connected')
      initPush()
    startCronJobs()
    app.listen(process.env.PORT || 3000, () =>
      console.log(`Server running on port ${process.env.PORT || 3000}`)
    )
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err)
    process.exit(1)
  })
