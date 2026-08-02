import {ref} from 'vue'
import api from '@/composables/useApi'

// Rolling 12-month income view from GET /portfolio/income-projection.
// The server does the monthly bucketing, FX conversion, and avg-cost replay,
// so this only holds request state.
export function useIncomeProjection() {
  const months = ref([])
  const totals = ref({trailingIncome: 0, projectedIncome: 0})
  const loading = ref(false)
  const error = ref(null)

  async function fetchProjection() {
    loading.value = true
    error.value = null
    try {
      const data = await api.get('/portfolio/income-projection')
      months.value = data?.months || []
      totals.value = data?.totals || {trailingIncome: 0, projectedIncome: 0}
    } catch (err) {
      error.value = err?.message || 'Failed to load income projection'
      months.value = []
    } finally {
      loading.value = false
    }
  }

  return {months, totals, loading, error, fetchProjection}
}
