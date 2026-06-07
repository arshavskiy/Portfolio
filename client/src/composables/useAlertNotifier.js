import {onMounted, onUnmounted, watch} from 'vue'
import {useToast} from 'primevue/usetoast'
import {storeToRefs} from 'pinia'
import {useAuthStore} from '@/stores/auth'
import {useAlertsStore} from '@/stores/alerts'
import {useTickerCurrency} from '@/composables/useFormat'

const SEEN_KEY = 'alerts-seen-at'
const POLL_MS = 15 * 60_000

// Surfaces server-triggered alerts as in-app toasts (belt-and-suspenders for
// when Web Push is unavailable). De-duplicates via a localStorage watermark so
// each triggered alert is shown only once across reloads.
export function useAlertNotifier() {
    const toast = useToast()
    const auth = useAuthStore()
    const alerts = useAlertsStore()
    const {isAuthenticated} = storeToRefs(auth)
    
    let timer = null
    
    function lastSeen() {
        return Number(localStorage.getItem(SEEN_KEY) || 0)
    }
    
    function setLastSeen(ts) {
        localStorage.setItem(SEEN_KEY, String(ts))
    }
    
    async function check() {
        if (!auth.token) return
        try {
            await alerts.fetchAlerts({force: true})
        } catch {
            return
        }
        
        const seen = lastSeen()
        let newest = seen
        
        const fresh = alerts.items.filter((a) => {
            if (!a.triggeredAt) return false
            const ts = new Date(a.triggeredAt).getTime()
            if (ts > newest) newest = ts
            return ts > seen
        })
        
        for (const a of fresh) {
            const arrow = a.condition === 'above' ? '↑' : '↓'
            toast.add({
                severity: 'success',
                summary: `${a.ticker} alert ${arrow}`,
                detail: `Hit ${useTickerCurrency(a.target, a.ticker)} (now ${useTickerCurrency(a.triggeredPrice, a.ticker)})`,
                life: 6000,
            })
        }
        
        // On the very first run we only set the watermark (don't replay history).
        if (seen === 0) setLastSeen(Date.now())
        else if (newest > seen) setLastSeen(newest)
    }
    
    function start() {
        stop()
        check()
        timer = setInterval(check, POLL_MS)
    }
    
    function stop() {
        if (timer) {
            clearInterval(timer);
            timer = null
        }
    }
    
    onMounted(() => {
        if (isAuthenticated.value) start()
    })
    onUnmounted(stop)
    watch(isAuthenticated, (v) => (v ? start() : stop()))
    
    return {check}
}
