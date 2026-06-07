import {defineStore} from 'pinia'
import {ref} from 'vue'
import api from '@/composables/useApi'

const ALERTS_CACHE_TTL = 5 * 60 * 1000

export const useAlertsStore = defineStore('alerts', () => {
  const items = ref([])
  const loading = ref(false)
  const expiresAt = ref(0)
  let inflight = null

  function hasFreshCache() {
    return items.value.length && expiresAt.value > Date.now()
  }

  async function fetchAlerts({force = false} = {}) {
    if (!force && hasFreshCache()) return items.value
    if (inflight) return inflight

    const shouldShowLoading = !items.value.length
    if (shouldShowLoading) loading.value = true

    inflight = api.get('/alerts')
      .then((data) => {
        items.value = data
        expiresAt.value = Date.now() + ALERTS_CACHE_TTL
        return data
      })
      .finally(() => {
        inflight = null
        if (shouldShowLoading) loading.value = false
      })

    return inflight
  }

  async function createAlert({ticker, condition, target, note}) {
    const alert = await api.post('/alerts', {ticker, condition, target, note})
    items.value.unshift(alert)
    expiresAt.value = Date.now() + ALERTS_CACHE_TTL
    return alert
  }

  async function updateAlert(id, patch) {
    const updated = await api.put(`/alerts/${id}`, patch)
    const i = items.value.findIndex((a) => a._id === id)
    if (i !== -1) items.value[i] = updated
    expiresAt.value = Date.now() + ALERTS_CACHE_TTL
    return updated
  }

  async function deleteAlert(id) {
    await api.delete(`/alerts/${id}`)
    items.value = items.value.filter((a) => a._id !== id)
    expiresAt.value = Date.now() + ALERTS_CACHE_TTL
  }

  function forTicker(ticker) {
    return items.value.filter((a) => a.ticker === ticker?.toUpperCase())
  }

  return {items, loading, fetchAlerts, createAlert, updateAlert, deleteAlert, forTicker}
})
