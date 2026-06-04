const webpush = require('web-push')
const PushSubscription = require('../models/PushSubscription')

let enabled = false

function initPush() {
    const {VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT} = process.env
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
        console.warn('[push] VAPID keys missing — push notifications disabled')
        return
    }
    webpush.setVapidDetails(
        VAPID_SUBJECT || 'mailto:admin@example.com',
        VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY
    )
    enabled = true
    console.log('[push] Web Push enabled')
}

// Send a notification to every subscription belonging to a user.
// Dead subscriptions (404/410) are pruned automatically.
async function sendPush(userId, payload) {
    if (!enabled) return
    const subs = await PushSubscription.find({user: userId})
    if (!subs.length) return
    
    const body = JSON.stringify(payload)
    await Promise.all(
        subs.map(async (sub) => {
            try {
                await webpush.sendNotification(
                    {endpoint: sub.endpoint, keys: sub.keys},
                    body
                )
            } catch (err) {
                if (err.statusCode === 404 || err.statusCode === 410) {
                    await PushSubscription.deleteOne({_id: sub._id})
                } else {
                    console.error('[push] send error:', err.statusCode, err.body || err.message)
                }
            }
        })
    )
}

module.exports = {initPush, sendPush, isEnabled: () => enabled}
