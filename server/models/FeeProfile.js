const mongoose = require('mongoose')

const feeRuleSchema = new mongoose.Schema({
  type: { type: String, enum: ['percent', 'flat'], default: 'percent' },
  value: { type: Number, required: true, min: 0 },
  minFee: { type: Number, default: 0 },
}, { _id: false })

const feeProfileSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true },   // e.g. "IBI", "Meitav"
    country: { type: String, default: '' },               // e.g. "Israel", "USA"
    currency: { type: String, default: 'USD' },

    buyFee: { type: feeRuleSchema, default: () => ({ type: 'percent', value: 0, minFee: 0 }) },
    sellFee: { type: feeRuleSchema, default: () => ({ type: 'percent', value: 0, minFee: 0 }) },

    capitalGainsTax: { type: Number, default: 0 },         // % e.g. 25 for Israel
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
)

feeProfileSchema.index({ user: 1 })

module.exports = mongoose.model('FeeProfile', feeProfileSchema)
