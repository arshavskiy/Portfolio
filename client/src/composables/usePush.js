import {ref} from 'vue'
import api from '@/composables/useApi'

const supported = ref('serviceWorker' in navigator && 'PushManager' in window)
const permission = ref(supported.value ? Notification.permission : 'denied')
const subscribed = ref(false)
const busy = ref(false)

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
    const raw = atob(base64)
    return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

async function getRegistration() {
    // serviceWorker.ready never resolves if no SW is registered (e.g. dev build
    // without the PWA service worker) — fail fast instead of hanging the toggle.
    return Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Service worker not registered (is the PWA built?)')), 5000)
        ),
    ])
}

// Reflect whether an active push subscription already exists.
async function refreshState() {
    if (!supported.value) return
    permission.value = Notification.permission
    try {
        const reg = await getRegistration()
        const sub = await reg.pushManager.getSubscription()
        subscribed.value = !!sub
    } catch {
        subscribed.value = false
    }
}

async function enablePush() {
    if (!supported.value) throw new Error('Push not supported on this device')
    busy.value = true
    try {
        permission.value = await Notification.requestPermission()
        if (permission.value !== 'granted') throw new Error('Notification permission denied')
        
        const {key} = await api.get('/alerts/vapid-key')
        if (!key) throw new Error('Server is missing VAPID key')
        
        const reg = await getRegistration()
        let sub = await reg.pushManager.getSubscription()
        if (!sub) {
            sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(key),
            })
        }
        
        const json = sub.toJSON()
        await api.post('/alerts/subscribe', {endpoint: json.endpoint, keys: json.keys})
        subscribed.value = true
    } finally {
        busy.value = false
    }
}

async function disablePush() {
    busy.value = true
    try {
        const reg = await getRegistration()
        const sub = await reg.pushManager.getSubscription()
        if (sub) {
            await api.post('/alerts/unsubscribe', {endpoint: sub.endpoint}).catch(() => {
            })
            await sub.unsubscribe()
        }
        subscribed.value = false
    } finally {
        busy.value = false
    }
}

export function usePush() {
    return {supported, permission, subscribed, busy, refreshState, enablePush, disablePush}
}
