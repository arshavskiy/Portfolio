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

function resolveTrustProxy(value) {
  if (value == null || value === '') return process.env.NODE_ENV === 'production' ? 1 : false
  const normalized = String(value).trim().toLowerCase()
  if (normalized === 'true') return true
  if (normalized === 'false') return false
  if (/^\d+$/.test(normalized)) return Number(normalized)
  return value
}

app.set('trust proxy', resolveTrustProxy(process.env.TRUST_PROXY))

const localDevOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
]

// Production frontends that are always allowed (no trailing slash — the browser
// Origin header never includes one).
const productionOrigins = [
  'https://stockfolio.handcoded.tech'
]

const configuredOrigins = [
  ...localDevOrigins,
  ...productionOrigins,
  ...(process.env.CORS_ORIGINS || process.env.CLIENT_URL || '')
  .split(',')
  .map((origin) => origin.trim().replace(/\/+$/, ''))
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

app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    const ms = Date.now() - start
    const xCache = res.getHeader('X-Cache')
    const cc = res.getHeader('Cache-Control')
    const ttlMatch = cc && cc.match(/max-age=(\d+)/)
    const ttl = ttlMatch ? `ttl=${ttlMatch[1]}s` : null
    const cacheInfo = [xCache, ttl].filter(Boolean).join(' ')
    const cachePart = cacheInfo ? ` [${cacheInfo}]` : ''
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms${cachePart}`)
  })
  next()
})

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
