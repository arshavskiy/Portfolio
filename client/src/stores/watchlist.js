import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/composables/useApi'

export const useWatchlistStore = defineStore('watchlist', () => {
  const items = ref([])
  const loading = ref(false)

  async function fetchWatchlist() {
    loading.value = true
    try {
      items.value = await api.get('/watchlist')
    } finally {
      loading.value = false
    }
  }

  async function addItem(ticker, companyName) {
    const item = await api.post('/watchlist', { ticker, companyName })
    items.value.unshift(item)
    return item
  }

  async function removeItem(id) {
    await api.delete(`/watchlist/${id}`)
    items.value = items.value.filter((i) => i._id !== id)
  }

  return { items, loading, fetchWatchlist, addItem, removeItem }
})
