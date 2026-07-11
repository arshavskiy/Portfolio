const mongoose = require('mongoose')

// Saved target allocation per user, checked by cron for drift alerts.
// One document per user; targets must sum to ~100.
const rebalanceTargetSchema = new mongoose.Schema(
    {
        user: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true},
        targets: [{
            ticker: {type: String, required: true, uppercase: true, trim: true},
            percent: {type: Number, required: true, min: 0, max: 100},
        }],
        threshold: {type: Number, default: 5, min: 1, max: 50}, // drift % that triggers a push
        enabled: {type: Boolean, default: true},
        lastNotifiedAt: {type: Date, default: null},
    },
    {timestamps: true}
)

module.exports = mongoose.model('RebalanceTarget', rebalanceTargetSchema)
