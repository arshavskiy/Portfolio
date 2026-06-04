import {defineStore} from 'pinia'
import {ref} from 'vue'
import api from '@/composables/useApi'

export const useWatchlistStore = defineStore('watchlist', () => {
  const items = ref([])
  const loading = ref(false)
    let lastRange = '1mo'
    
    async function fetchWatchlist(range = '1mo') {
        lastRange = range
    loading.value = true
    try {
        await api.post('/watchlist/sync-holdings', {})
        items.value = await api.get(`/watchlist?range=${encodeURIComponent(range)}`)
    } finally {
      loading.value = false
    }
  }

  async function addItem(ticker, companyName) {
      await api.post('/watchlist', {ticker, companyName})
      await fetchWatchlist(lastRange)
  }

  async function removeItem(id) {
    await api.delete(`/watchlist/${id}`)
    items.value = items.value.filter((i) => i._id !== id)
  }

  return { items, loading, fetchWatchlist, addItem, removeItem }
})
