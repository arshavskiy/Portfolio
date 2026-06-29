const jwt = require('jsonwebtoken')
const ErrorLog = require('../models/ErrorLog')

function userIdFromHeader(req) {
    const header = req.headers.authorization
    if (!header || !header.startsWith('Bearer ')) return null
    try {
        return jwt.verify(header.split(' ')[1], process.env.JWT_SECRET).id
    } catch {
        return null
    }
}

function isAdmin(req) {
    const admins = (process.env.ADMIN_EMAILS || '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
    const email = req.user?.email?.toLowerCase()
    return !!email && admins.includes(email)
}

exports.listErrors = async (req, res) => {
    try {
        if (!isAdmin(req)) return res.status(403).json({message: 'Admin only'})
        const limit = Math.min(Number(req.query.limit) || 200, 1000)
        const filter = {}
        if (req.query.status) filter.status = Number(req.query.status)
        const errors = await ErrorLog.find(filter)
            .populate('user', 'name email')
            .sort({createdAt: -1})
            .limit(limit)
            .lean()
        res.json({errors, count: errors.length, isAdmin: true})
    } catch (err) {
        res.status(500).json({message: err.message})
    }
}

exports.logError = async (req, res) => {
    try {
        const {status, message, method, path, source, meta} = req.body || {}
        await ErrorLog.create({
            user: userIdFromHeader(req),
            status: status != null ? Number(status) : null,
            message: String(message || '').slice(0, 1000),
            method: String(method || '').slice(0, 10),
            path: String(path || '').slice(0, 300),
            source: source === 'server' ? 'server' : 'client',
            userAgent: String(req.headers['user-agent'] || '').slice(0, 300),
            meta: meta ?? null,
        })
        res.status(204).end()
    } catch {
        res.status(204).end()
    }
}
