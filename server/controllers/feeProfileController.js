const FeeProfile = require('../models/FeeProfile')

const BUILTIN_FEE_PROFILES = [
  {
    _id: 'builtin:blink-plus',
    builtin: true,
    name: 'בלינק Plus',
    currency: 'USD',
    buyFee: {type: 'perShare', value: 0.01, minFee: 1.5},
    sellFee: {type: 'perShare', value: 0.01, minFee: 1.5},
    capitalGainsTax: 25,
    monthlyUsage: {transactions: 10, shares: 1000},
  },
]

exports.BUILTIN_FEE_PROFILES = BUILTIN_FEE_PROFILES

exports.getBuiltInFeeProfile = (id) =>
  BUILTIN_FEE_PROFILES.find((profile) => profile._id === id) || null

exports.getProfiles = async (req, res) => {
  try {
    const profiles = await FeeProfile.find({ user: req.user._id }).sort({ isDefault: -1, name: 1 })
    res.json(profiles)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

exports.createProfile = async (req, res) => {
  try {
    const { name, country, currency, buyFee, sellFee, capitalGainsTax, isDefault } = req.body
    if (!name) return res.status(400).json({ message: 'name required' })
    const profileCurrency = currency || 'USD'
    if (isDefault) {
      await FeeProfile.updateMany({ user: req.user._id, currency: profileCurrency }, { isDefault: false })
    }
    const profile = await FeeProfile.create({
      user: req.user._id, name, country, currency: profileCurrency,
      buyFee: buyFee || { type: 'percent', value: 0, minFee: 0 },
      sellFee: sellFee || { type: 'percent', value: 0, minFee: 0 },
      capitalGainsTax: capitalGainsTax || 0,
      isDefault: !!isDefault,
    })
    res.status(201).json(profile)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

exports.updateProfile = async (req, res) => {
  try {
    const profile = await FeeProfile.findOne({ _id: req.params.id, user: req.user._id })
    if (!profile) return res.status(404).json({ message: 'Not found' })
    const { name, country, currency, buyFee, sellFee, capitalGainsTax, isDefault } = req.body
    const profileCurrency = currency || 'USD'
    if (isDefault) {
      await FeeProfile.updateMany(
        { user: req.user._id, currency: profileCurrency, _id: { $ne: profile._id } },
        { isDefault: false }
      )
    }
    Object.assign(profile, { name, country, currency: profileCurrency, buyFee, sellFee, capitalGainsTax, isDefault: !!isDefault })
    await profile.save()
    res.json(profile)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

exports.deleteProfile = async (req, res) => {
  try {
    const profile = await FeeProfile.findOne({ _id: req.params.id, user: req.user._id })
    if (!profile) return res.status(404).json({ message: 'Not found' })
    await profile.deleteOne()
    res.json({ message: 'Deleted' })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

function calcFee(rule, total, shares = 0) {
  if (!rule || !rule.value) return 0
  let fee = rule.value
  if (rule.type === 'percent') fee = total * rule.value
  if (rule.type === 'perShare') fee = shares * rule.value
  if (rule.minFee && fee < rule.minFee) fee = rule.minFee
  return Math.round(fee * 100) / 100
}

// avgCost required for sell tax calculation
exports.computeTransactionCosts = (profile, txType, total, shares, price, avgCost) => {
  if (!profile) return { feeAmount: 0, taxAmount: 0 }

  const feeRule = txType === 'buy' ? profile.buyFee : profile.sellFee
  const feeAmount = calcFee(feeRule, total, shares)

  let taxAmount = 0
  if (txType === 'sell' && profile.capitalGainsTax > 0 && avgCost != null) {
    const gain = (price - avgCost) * shares
    if (gain > 0) {
      taxAmount = Math.round((gain * profile.capitalGainsTax) / 100 * 100) / 100
    }
  }

  return { feeAmount, taxAmount }
}

// Keep backward compat alias
exports.computeFee = (profile, total) => calcFee(profile?.buyFee, total)
