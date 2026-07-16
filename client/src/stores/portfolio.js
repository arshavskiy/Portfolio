import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/composables/useApi'

export const usePortfolioStore = defineStore('portfolio', () => {
  const positions = ref([])
  const totals = ref([])
  const combinedUsd = ref(null)
  const loading = ref(false)
    const returnMetrics = ref(null)
    const riskExposure = ref(null)
    const dividendFrequencies = ref({})

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
    
    async function fetchReturnMetrics() {
        returnMetrics.value = await api.get('/portfolio/return-metrics')
        return returnMetrics.value
    }
    
    async function fetchRiskExposure() {
        riskExposure.value = await api.get('/portfolio/risk')
        return riskExposure.value
    }

    async function fetchDividendFrequencies() {
        const data = await api.get('/portfolio/dividends/frequency')
        dividendFrequencies.value = data.frequencies || {}
        return dividendFrequencies.value
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
    
    return {
        positions,
        totals,
        combinedUsd,
        loading,
        returnMetrics,
        riskExposure,
        dividendFrequencies,
        fetchPortfolio,
        fetchReturnMetrics,
        fetchRiskExposure,
        fetchDividendFrequencies,
        addTransaction,
        deletePosition
    }
})
