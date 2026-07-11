const mongoose = require('mongoose')

const positionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    ticker: { type: String, required: true, uppercase: true, trim: true },
    companyName: { type: String },
      sector: {type: String},
      industry: {type: String},
    shares: { type: Number, required: true, min: 0 },
    avgCost: { type: Number, required: true, min: 0 },
      groups: {type: [String], default: []},
      notes: {type: String, default: ''},
  },
  { timestamps: true }
)

positionSchema.index({ user: 1, ticker: 1 }, { unique: true })

module.exports = mongoose.model('Position', positionSchema)
