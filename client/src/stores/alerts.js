import {defineStore} from 'pinia'
import {ref} from 'vue'
import api from '@/composables/useApi'

export const useAlertsStore = defineStore('alerts', () => {
    const items = ref([])
    const loading = ref(false)
    
    async function fetchAlerts() {
        loading.value = true
        try {
            items.value = await api.get('/alerts')
        } finally {
            loading.value = false
        }
    }
    
    async function createAlert({ticker, condition, target, note}) {
        const alert = await api.post('/alerts', {ticker, condition, target, note})
        items.value.unshift(alert)
        return alert
    }
    
    async function updateAlert(id, patch) {
        const updated = await api.put(`/alerts/${id}`, patch)
        const i = items.value.findIndex((a) => a._id === id)
        if (i !== -1) items.value[i] = updated
        return updated
    }
    
    async function deleteAlert(id) {
        await api.delete(`/alerts/${id}`)
        items.value = items.value.filter((a) => a._id !== id)
    }
    
    function forTicker(ticker) {
        return items.value.filter((a) => a.ticker === ticker?.toUpperCase())
    }
    
    return {items, loading, fetchAlerts, createAlert, updateAlert, deleteAlert, forTicker}
})
