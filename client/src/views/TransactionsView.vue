<script setup>
import {computed, onMounted, ref} from 'vue'
import {useTickerCurrency} from '@/composables/useFormat'
import api from '@/composables/useApi'
import Tag from 'primevue/tag'
import Select from 'primevue/select'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import EditTransactionModal from '@/components/ui/EditTransactionModal.vue'

const transactions = ref([])
const loading = ref(false)
const filterTicker = ref('')
const filterType = ref(null)

const editTx = ref(null)
const showEdit = ref(false)

function openEdit(tx) {
  editTx.value = tx
  showEdit.value = true
}

const typeOptions = [
  { label: 'All types', value: null },
  { label: 'Buy', value: 'buy' },
  { label: 'Sell', value: 'sell' },
]

onMounted(fetchTransactions)

async function fetchTransactions() {
  loading.value = true
  try {
    const data = await api.get('/portfolio/transactions?limit=500')
    transactions.value = data.transactions
  } finally {
    loading.value = false
  }
}

const filtered = computed(() => {
  return transactions.value.filter((tx) => {
    const tickerMatch = !filterTicker.value || tx.ticker.includes(filterTicker.value.toUpperCase())
    const typeMatch = !filterType.value || tx.type === filterType.value
    return tickerMatch && typeMatch
  })
})

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function exportCSV() {
  const rows = [
    ['Date', 'Ticker', 'Type', 'Shares', 'Price', 'Total'],
    ...filtered.value.map((tx) => [
      formatDate(tx.date),
      tx.ticker,
      tx.type,
      tx.shares,
      tx.price,
      tx.total,
    ]),
  ]
  const csv = rows.map((r) => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `transactions_${new Date().toISOString().split('T')[0]}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="transactions">
    <header class="page-header">
      <h1 class="gradient-title">History</h1>
      <Button icon="pi pi-download" label="CSV" size="small" outlined @click="exportCSV" :disabled="!filtered.length" />
    </header>

    <!-- Filters -->
    <div class="filters">
      <InputText
        v-model="filterTicker"
        placeholder="Filter ticker..."
        size="small"
        class="filter-input"
      />
      <Select
        v-model="filterType"
        :options="typeOptions"
        option-label="label"
        option-value="value"
        size="small"
        class="filter-select"
      />
    </div>

    <div v-if="loading" class="text-muted loading">Loading...</div>

    <div v-else-if="!filtered.length" class="empty">
      <i class="pi pi-list" />
      <p class="text-muted">No transactions found</p>
    </div>

    <div v-else class="tx-list">
      <div v-for="tx in filtered" :key="tx._id" class="tx-row" @click="openEdit(tx)">
        <div class="tx-left">
          <span class="ticker">{{ tx.ticker }}</span>
          <span class="tx-date text-muted">{{ formatDate(tx.date) }}</span>
        </div>
        <div class="tx-mid">
          <span class="text-muted">{{ tx.shares }} × {{ useTickerCurrency(tx.price, tx.ticker) }}</span>
        </div>
        <div class="tx-right">
          <Tag :value="tx.type.toUpperCase()" :severity="tx.type === 'buy' ? 'success' : 'danger'" />
          <span class="total" :class="tx.type === 'sell' ? 'gain' : ''">
            {{ tx.type === 'sell' ? '+' : '-' }}{{ useTickerCurrency(tx.total, tx.ticker) }}
          </span>
        </div>
        <i class="pi pi-pencil edit-hint text-muted"/>
      </div>
    </div>

    <p v-if="filtered.length" class="count text-muted">{{ filtered.length }} transaction{{ filtered.length !== 1 ? 's' : '' }}</p>

    <EditTransactionModal
        v-model:visible="showEdit"
        :transaction="editTx"
        @saved="fetchTransactions"
    />
  </div>
</template>

<style scoped>
.transactions { padding: 1rem; }

@media (min-width: 768px) {
  .transactions {
    padding: 1.5rem;
  }
}

@media (min-width: 1280px) {
  .transactions {
    padding: 2rem;
  }
}
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }

.page-header h1 {
  font-size: 1.5rem;
}

.filters { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
.filter-input { flex: 1; }
.filter-select { width: 130px; }

.loading { padding: 1rem 0; }
.empty { display: flex; flex-direction: column; align-items: center; gap: 1rem; padding: 3rem 1rem; }
.empty i { font-size: 3rem; color: var(--text-secondary); }

.tx-list { display: flex; flex-direction: column; }

.tx-row {
  display: flex;
  align-items: center;
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--border);
  gap: 0.5rem;
  cursor: pointer;
  transition: background 0.15s;
}

.tx-row:active {
  background: rgba(255, 255, 255, 0.03);
}
.tx-left { flex: 0 0 90px; }
.ticker { font-weight: 600; display: block; font-size: 0.95rem; }
.tx-date { font-size: 0.75rem; }
.tx-mid { flex: 1; font-size: 0.82rem; }
.tx-right { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.total { font-size: 0.88rem; font-weight: 500; }

.edit-hint {
  font-size: 0.7rem;
  flex-shrink: 0;
  margin-left: 2px;
}
.count { margin-top: 0.75rem; font-size: 0.8rem; text-align: center; }
</style>
