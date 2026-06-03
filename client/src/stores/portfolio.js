import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/composables/useApi'

export const usePortfolioStore = defineStore('portfolio', () => {
  const positions = ref([])
  const totals = ref([])
  const combinedUsd = ref(null)
  const loading = ref(false)

  async function fetchPortfolio() {
    loading.value = true
    try {
      const data = await api.get('/portfolio')
      positions.value = data.positions
      totals.value = data.totals || []
      combinedUsd.value = data.combinedUsd || null
    } finally {
      loading.value = false
    }
  }

  async function addTransaction(payload) {
    const data = await api.post('/portfolio/transaction', payload)
    await fetchPortfolio()
    return data
  }

  async function deletePosition(id) {
    await api.delete(`/portfolio/position/${id}`)
    await fetchPortfolio()
  }

  return { positions, totals, combinedUsd, loading, fetchPortfolio, addTransaction, deletePosition }
})
