const mongoose = require('mongoose')

const transactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    ticker: { type: String, required: true, uppercase: true },
      type: {type: String, enum: ['buy', 'sell', 'dividend', 'update'], required: true},
    shares: { type: Number, required: true, min: 0 },
    price: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true },
    date: { type: Date, default: Date.now },
    notes: { type: String },
      drip: {type: Boolean, default: false},       // dividend reinvested as shares
    feeProfile: { type: mongoose.Schema.Types.ObjectId, ref: 'FeeProfile', default: null },
    feeAmount: { type: Number, default: 0 },         // buy or sell fee
    taxAmount: { type: Number, default: 0 },         // capital gains tax (sell only)
    totalWithFees: { type: Number },                 // total ± feeAmount (real cost/proceeds)
    netProceeds: { type: Number },                   // sell only: total - fee - tax
  },
  { timestamps: true }
)

transactionSchema.index({ user: 1, date: -1 })

module.exports = mongoose.model('Transaction', transactionSchema)
