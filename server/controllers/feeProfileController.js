const FeeProfile = require('../models/FeeProfile')
const { getIlsToUsd } = require('../services/stockService')

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

function tickerCurrency(ticker) {
  return ticker?.toUpperCase().endsWith('.TA') ? 'ILS' : 'USD'
}

exports.tickerCurrency = tickerCurrency

function feeCurrencyForTransaction(profile, transactionCurrency) {
  if (transactionCurrency === 'ILS') return 'ILS'
  return profile?.currency || transactionCurrency
}

exports.feeCurrencyForTransaction = feeCurrencyForTransaction

async function convertFeeToTransactionCurrency(amount, feeCurrency, transactionCurrency) {
  if (!amount || feeCurrency === transactionCurrency) return amount || 0
  const ilsToUsd = await getIlsToUsd()
  if (feeCurrency === 'ILS' && transactionCurrency === 'USD' && ilsToUsd > 0) return amount * ilsToUsd
  if (feeCurrency === 'USD' && transactionCurrency === 'ILS' && ilsToUsd > 0) return amount / ilsToUsd
  return amount || 0
}

exports.convertFeeToTransactionCurrency = convertFeeToTransactionCurrency

async function findDefaultFeeProfile(userId, transactionCurrency) {
  async function preferredProfile(currency) {
    const profiles = await FeeProfile.find({ user: userId, currency }).sort({ isDefault: -1, createdAt: 1 })
    return profiles.find((p) => p.isDefault) || (profiles.length === 1 ? profiles[0] : null)
  }

  const exact = await preferredProfile(transactionCurrency)
  if (exact) return exact
  if (transactionCurrency === 'USD') {
    return preferredProfile('ILS')
  }
  return null
}

exports.findDefaultFeeProfile = findDefaultFeeProfile

async function resolveFeeProfile(userId, feeProfileId, transactionCurrency) {
  if (feeProfileId === null) return null
  if (feeProfileId) {
    return exports.getBuiltInFeeProfile(feeProfileId) ||
      FeeProfile.findOne({ _id: feeProfileId, user: userId })
  }
  if (feeProfileId === undefined) return findDefaultFeeProfile(userId, transactionCurrency)
  return null
}

exports.resolveFeeProfile = resolveFeeProfile

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

exports.simulateTransactionCosts = async (req, res) => {
  try {
    const { ticker, type, feeProfileId } = req.body || {}
    const txType = type === 'sell' ? 'sell' : 'buy'
    const transactionCurrency = req.body?.currency || tickerCurrency(ticker)
    const shares = Number(req.body?.shares) || 0
    const price = Number(req.body?.price) || 0
    const total = Number(req.body?.total) || shares * price
    const avgCost = req.body?.avgCost == null ? null : Number(req.body.avgCost)

    if (!shares || !price || !total) {
      return res.status(400).json({ message: 'shares and price are required' })
    }

    const profile = await resolveFeeProfile(req.user._id, feeProfileId, transactionCurrency)
    if (!profile) {
      return res.json({
        feeAmount: 0,
        feeAmountForTotals: 0,
        feeCurrency: transactionCurrency,
        transactionCurrency,
        taxAmount: 0,
        taxRate: 0,
        profileName: null,
      })
    }

    const { feeAmount, taxAmount } = exports.computeTransactionCosts(
      profile,
      txType,
      total,
      shares,
      price,
      Number.isFinite(avgCost) ? avgCost : null
    )
    const feeCurrency = feeCurrencyForTransaction(profile, transactionCurrency)
    const feeAmountForTotals = await convertFeeToTransactionCurrency(feeAmount, feeCurrency, transactionCurrency)

    res.json({
      feeAmount,
      feeAmountForTotals,
      feeCurrency,
      transactionCurrency,
      taxAmount,
      taxRate: profile.capitalGainsTax || 0,
      profileName: profile.name || null,
      profileId: profile._id,
    })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}
