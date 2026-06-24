const mongoose = require('mongoose')

// Last successfully fetched quote per ticker, persisted so cold starts and
// 429 errors can serve stale data instead of erroring. TTL index auto-cleans
// entries not updated for 24 hours. Global (not user-scoped).
const quoteSnapshotSchema = new mongoose.Schema(
    {
        ticker: {type: String, required: true, unique: true, uppercase: true, trim: true},
        data: {type: mongoose.Schema.Types.Mixed, required: true},
        updatedAt: {type: Date, default: Date.now, index: {expires: '24h'}},
    },
    {_id: true}
)

module.exports = mongoose.model('QuoteSnapshot', quoteSnapshotSchema)
