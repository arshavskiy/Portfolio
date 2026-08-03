const mongoose = require('mongoose')

const closedPositionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    ticker: { type: String, required: true, uppercase: true, trim: true },
    companyName: { type: String },
    sector: { type: String },
    industry: { type: String },
    currency: { type: String, default: 'USD' },
    groups: { type: [String], default: [] },
    sharesSold: { type: Number, required: true },
    avgCost: { type: Number, required: true },
    sellPrice: { type: Number, required: true },
    totalProceeds: { type: Number, required: true },
    totalCostBasis: { type: Number, required: true },
    feeAmount: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    netGain: { type: Number, required: true },
    dateClosed: { type: Date, required: true },
    partial: { type: Boolean, default: false },
  },
  { timestamps: true }
)

closedPositionSchema.index({ user: 1, dateClosed: -1 })
closedPositionSchema.index({ user: 1, ticker: 1 })

module.exports = mongoose.model('ClosedPosition', closedPositionSchema)
