const Alert = require('../models/Alert')
const PushSubscription = require('../models/PushSubscription')
const {getQuote} = require('../services/stockService')

exports.getVapidKey = (req, res) => {
    res.json({key: process.env.VAPID_PUBLIC_KEY || null})
}

exports.subscribe = async (req, res) => {
    try {
        const {endpoint, keys} = req.body
        if (!endpoint || !keys?.p256dh || !keys?.auth) {
            return res.status(400).json({message: 'Invalid subscription'})
        }
        const sub = await PushSubscription.findOneAndUpdate(
            {user: req.user._id, endpoint},
            {user: req.user._id, endpoint, keys},
            {upsert: true, returnDocument: 'after'}
        )
        res.status(201).json({_id: sub._id})
    } catch (err) {
        res.status(500).json({message: err.message})
    }
}

exports.unsubscribe = async (req, res) => {
    try {
        const {endpoint} = req.body
        await PushSubscription.deleteOne({user: req.user._id, endpoint})
        res.json({message: 'Unsubscribed'})
    } catch (err) {
        res.status(500).json({message: err.message})
    }
}

exports.getAlerts = async (req, res) => {
    try {
        const alerts = await Alert.find({user: req.user._id}).sort({createdAt: -1})
        res.json(alerts)
    } catch (err) {
        res.status(500).json({message: err.message})
    }
}

exports.createAlert = async (req, res) => {
    try {
        const {ticker, condition, target, note} = req.body
        if (!ticker || !condition || target == null) {
            return res.status(400).json({message: 'ticker, condition, target required'})
        }
        if (!['above', 'below'].includes(condition)) {
            return res.status(400).json({message: 'condition must be above or below'})
        }
        
        // Capture current price so we can show context in the UI (best-effort).
        let currentPrice = null
        try {
            const q = await getQuote(ticker.toUpperCase())
            currentPrice = q?.price ?? null
        } catch {
        }
        
        const alert = await Alert.create({
            user: req.user._id,
            ticker: ticker.toUpperCase(),
            condition,
            target,
            note,
        })
        res.status(201).json({...alert.toObject(), currentPrice})
    } catch (err) {
        res.status(500).json({message: err.message})
    }
}

exports.updateAlert = async (req, res) => {
    try {
        const alert = await Alert.findOne({_id: req.params.id, user: req.user._id})
        if (!alert) return res.status(404).json({message: 'Alert not found'})
        
        const {condition, target, note, active} = req.body
        if (condition !== undefined) alert.condition = condition
        if (target !== undefined) alert.target = target
        if (note !== undefined) alert.note = note
        if (active !== undefined) {
            alert.active = active
            // Re-arming an alert clears its triggered state.
            if (active) {
                alert.triggeredAt = null
                alert.triggeredPrice = null
            }
        }
        await alert.save()
        res.json(alert)
    } catch (err) {
        res.status(500).json({message: err.message})
    }
}

exports.deleteAlert = async (req, res) => {
    try {
        const alert = await Alert.findOneAndDelete({_id: req.params.id, user: req.user._id})
        if (!alert) return res.status(404).json({message: 'Alert not found'})
        res.json({message: 'Alert deleted'})
    } catch (err) {
        res.status(500).json({message: err.message})
    }
}
