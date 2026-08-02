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

function normalizeCurrencyCode(currency) {
  return currency === 'ILS' ? 'ILS' : 'USD'
}

function normalizeFeeRule(rule) {
  if (!rule) return { type: 'percent', value: 0, minFee: 0 }
  return {
    type: rule.type || 'percent',
    value: Number(rule.value) || 0,
    minFee: Number(rule.minFee) || 0,
  }
}

function normalizeFeeSchedule(schedule, fallback = null) {
  const source = schedule || fallback || {}
  const sharedFee = source.tradingFee || source.buyFee || source.sellFee
  return {
    buyFee: normalizeFeeRule(source.buyFee || sharedFee),
    sellFee: normalizeFeeRule(source.sellFee || sharedFee),
    capitalGainsTax: Number(source.capitalGainsTax) || 0,
  }
}

function profileScheduleForCurrency(profile, transactionCurrency) {
  const currency = normalizeCurrencyCode(transactionCurrency)
  const nested = profile?.feesByCurrency?.[currency]
  if (nested) return normalizeFeeSchedule(nested)

  const profileCurrency = normalizeCurrencyCode(profile?.currency || 'USD')
  if (profileCurrency === currency) {
    return normalizeFeeSchedule({
      buyFee: profile.buyFee,
      sellFee: profile.sellFee,
      capitalGainsTax: profile.capitalGainsTax,
    })
  }

  return null
}

function profileSupportsCurrency(profile, transactionCurrency) {
  return Boolean(profileScheduleForCurrency(profile, transactionCurrency))
}

function normalizeFeesByCurrency(input, fallbackCurrency, existing = {}) {
  const schedules = {}
  const currencies = ['USD', 'ILS']
  for (const code of currencies) {
    if (input?.[code]) {
      schedules[code] = normalizeFeeSchedule(input[code])
    } else if (existing?.[code]) {
      schedules[code] = normalizeFeeSchedule(existing[code])
    }
  }

  const primaryCurrency = normalizeCurrencyCode(fallbackCurrency || 'USD')
  if (!schedules[primaryCurrency]) {
    schedules[primaryCurrency] = normalizeFeeSchedule(input?.[primaryCurrency], existing?.[primaryCurrency])
  }

  return schedules
}

function feeCurrencyForTransaction(profile, transactionCurrency) {
  const currency = normalizeCurrencyCode(transactionCurrency)
  return profileSupportsCurrency(profile, currency) ? currency : normalizeCurrencyCode(profile?.currency || currency)
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
  const currency = normalizeCurrencyCode(transactionCurrency)
  const profiles = await FeeProfile.find({ user: userId }).sort({ isDefault: -1, createdAt: 1 })
  const matching = profiles.filter((profile) => profileSupportsCurrency(profile, currency))
  return matching.find((p) => p.isDefault) || (matching.length === 1 ? matching[0] : null)
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
    const { name, country, currency, buyFee, sellFee, capitalGainsTax, feesByCurrency, isDefault } = req.body
    if (!name) return res.status(400).json({ message: 'name required' })
    const profileCurrency = currency || 'USD'
    const storedSchedules = normalizeFeesByCurrency(feesByCurrency, profileCurrency)
    const activeSchedule = normalizeFeeSchedule(
      storedSchedules[normalizeCurrencyCode(profileCurrency)],
      { buyFee, sellFee, capitalGainsTax }
    )
    storedSchedules[normalizeCurrencyCode(profileCurrency)] = activeSchedule
    if (isDefault) {
      await FeeProfile.updateMany({ user: req.user._id, currency: profileCurrency }, { isDefault: false })
    }
    const profile = await FeeProfile.create({
      user: req.user._id, name, country, currency: profileCurrency,
      buyFee: activeSchedule.buyFee,
      sellFee: activeSchedule.sellFee,
      capitalGainsTax: activeSchedule.capitalGainsTax,
      feesByCurrency: storedSchedules,
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
    const { name, country, currency, buyFee, sellFee, capitalGainsTax, feesByCurrency, isDefault } = req.body
    const profileCurrency = currency || 'USD'
    const storedSchedules = normalizeFeesByCurrency(
      feesByCurrency,
      profileCurrency,
      profile.feesByCurrency || {}
    )
    const activeSchedule = normalizeFeeSchedule(
      storedSchedules[normalizeCurrencyCode(profileCurrency)],
      {
        buyFee: buyFee || profile.buyFee,
        sellFee: sellFee || profile.sellFee,
        capitalGainsTax: capitalGainsTax ?? profile.capitalGainsTax,
      }
    )
    storedSchedules[normalizeCurrencyCode(profileCurrency)] = activeSchedule
    if (isDefault) {
      await FeeProfile.updateMany(
        { user: req.user._id, currency: profileCurrency, _id: { $ne: profile._id } },
        { isDefault: false }
      )
    }
    Object.assign(profile, {
      name,
      country,
      currency: profileCurrency,
      buyFee: activeSchedule.buyFee,
      sellFee: activeSchedule.sellFee,
      capitalGainsTax: activeSchedule.capitalGainsTax,
      feesByCurrency: storedSchedules,
      isDefault: !!isDefault,
    })
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
  if (!rule) return 0
  const value = Number(rule.value) || 0
  const minFee = Number(rule.minFee) || 0
  let fee = value
  if (rule.type === 'percent') fee = total * value
  if (rule.type === 'perShare') fee = shares * value
  if (minFee && fee < minFee) fee = minFee
  return Math.round(fee * 100) / 100
}

// avgCost required for sell tax calculation
exports.computeTransactionCosts = (profile, txType, total, shares, price, avgCost, transactionCurrency = null) => {
  if (!profile) return { feeAmount: 0, taxAmount: 0 }

  const schedule = profileScheduleForCurrency(profile, transactionCurrency || profile.currency || 'USD') ||
    normalizeFeeSchedule({ buyFee: profile.buyFee, sellFee: profile.sellFee, capitalGainsTax: profile.capitalGainsTax })
  const feeRule = txType === 'buy' ? schedule.buyFee : schedule.sellFee
  const feeAmount = calcFee(feeRule, total, shares)

  let taxAmount = 0
  if (txType === 'sell' && schedule.capitalGainsTax > 0 && avgCost != null) {
    const gain = (price - avgCost) * shares
    if (gain > 0) {
      taxAmount = Math.round((gain * schedule.capitalGainsTax) / 100 * 100) / 100
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
      Number.isFinite(avgCost) ? avgCost : null,
      transactionCurrency
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
