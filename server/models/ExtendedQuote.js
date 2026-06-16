const mongoose = require('mongoose')

// Last-seen extended-hours (pre/post-market) snapshot per ticker. Yahoo drops
// these fields during regular hours, so we persist the most recent non-null
// values to keep showing the last after-hours move until the next session.
// Global per ticker (not user-scoped).
const extendedQuoteSchema = new mongoose.Schema(
    {
        ticker: {type: String, required: true, unique: true, uppercase: true, trim: true},
        postMarketPrice: {type: Number, default: null},
        postMarketChange: {type: Number, default: null},
        postMarketChangePercent: {type: Number, default: null},
        postMarketTime: {type: Date, default: null},
        preMarketPrice: {type: Number, default: null},
        preMarketChange: {type: Number, default: null},
        preMarketChangePercent: {type: Number, default: null},
        preMarketTime: {type: Date, default: null},
    },
    {timestamps: true}
)

module.exports = mongoose.model('ExtendedQuote', extendedQuoteSchema)
