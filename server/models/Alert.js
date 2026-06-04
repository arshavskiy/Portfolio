const mongoose = require('mongoose')

const alertSchema = new mongoose.Schema(
    {
        user: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true},
        ticker: {type: String, required: true, uppercase: true, trim: true},
        condition: {type: String, enum: ['above', 'below'], required: true},
        target: {type: Number, required: true, min: 0},
        note: {type: String},
        active: {type: Boolean, default: true},
        triggeredAt: {type: Date, default: null},
        triggeredPrice: {type: Number, default: null},
    },
    {timestamps: true}
)

alertSchema.index({user: 1, ticker: 1})
alertSchema.index({active: 1})

module.exports = mongoose.model('Alert', alertSchema)
