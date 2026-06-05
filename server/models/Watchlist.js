const mongoose = require('mongoose')

const watchlistSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    ticker: { type: String, required: true, uppercase: true, trim: true },
    companyName: { type: String },
      sector: {type: String},
      industry: {type: String},
    addedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
)

watchlistSchema.index({ user: 1, ticker: 1 }, { unique: true })

module.exports = mongoose.model('Watchlist', watchlistSchema)
