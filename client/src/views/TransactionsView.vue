<script setup>
import {computed, onMounted, ref, watch} from 'vue'
import {gainLossClass, useCurrency, useTickerCurrency} from '@/composables/useFormat'
import api from '@/composables/useApi'
import Tag from 'primevue/tag'
import Select from 'primevue/select'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import EditTransactionModal from '@/components/ui/EditTransactionModal.vue'
import AppLoader from '@/components/ui/AppLoader.vue'
import {useI18n} from '@/composables/useI18n'

defineProps({
  embedded: {type: Boolean, default: false},
})

const {locale, t} = useI18n()

// ── Tab state ──────────────────────────────────────────────────────────────
const activeTab = ref('history') // 'history' | 'gains'

// ── History tab ────────────────────────────────────────────────────────────
const transactions = ref([])
const loadingHistory = ref(false)
const filterTicker = ref('')
const filterType = ref(null)
const editTx = ref(null)
const showEdit = ref(false)

const typeOptions = computed(() => [
  {label: t('transactions.allTypes'), value: null},
  {label: t('common.buy'), value: 'buy'},
  {label: t('common.sell'), value: 'sell'},
  {label: t('common.dividend'), value: 'dividend'},
])

function openEdit(tx) {
  editTx.value = tx
  showEdit.value = true
}

function openEditGain(record, type) {
  openEdit({...record, type})
}

async function fetchTransactions() {
  loadingHistory.value = true
  try {
    const data = await api.get('/portfolio/transactions?limit=500')
    transactions.value = data.transactions
  } finally {
    loadingHistory.value = false
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
  return new Date(d).toLocaleDateString(locale.value === 'ru' ? 'ru-RU' : 'en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
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
  const blob = new Blob([csv], {type: 'text/csv'})
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `transactions_${new Date().toISOString().split('T')[0]}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Realized gains tab ─────────────────────────────────────────────────────
const gainsData = ref(null)   // { years, availableYears }
const loadingGains = ref(false)
const selectedYear = ref(null)  // null = all years

const yearOptions = computed(() => {
  const years = gainsData.value?.availableYears ?? []
  return [
    {label: t('transactions.allYears'), value: null},
    ...years.map((y) => ({label: String(y), value: y})),
  ]
})

const visibleYears = computed(() => {
  const years = gainsData.value?.years ?? []
  if (!selectedYear.value) return years
  return years.filter((y) => y.year === selectedYear.value)
})

async function fetchGains(force = false) {
  if (gainsData.value && !force) return   // already loaded
  loadingGains.value = true
  try {
    gainsData.value = await api.get('/portfolio/realized-gains')
  } finally {
    loadingGains.value = false
  }
}

function onTransactionSaved() {
  fetchTransactions()
  fetchGains(true)
}

function exportGainsCSV() {
  const rows = [['Year', 'Date', 'Ticker', 'Type', 'Shares', 'Avg Cost', 'Proceeds', 'Gross Gain', 'Fees', 'Tax', 'Net Gain']]
  for (const yr of visibleYears.value) {
    for (const s of yr.sells) {
      rows.push([
        yr.year, formatDate(s.date), s.ticker, 'sell',
        s.shares ?? '', s.avgCostAtSale?.toFixed(4) ?? '',
        s.proceeds?.toFixed(2) ?? '', s.grossGain?.toFixed(2) ?? '',
        s.feePaid?.toFixed(2) ?? '', s.taxPaid?.toFixed(2) ?? '',
        s.netGain?.toFixed(2) ?? '',
      ])
    }
    for (const d of yr.dividends) {
      rows.push([yr.year, formatDate(d.date), d.ticker, 'dividend', '', '', '', d.grossGain?.toFixed(2) ?? '', '', '', d.netGain?.toFixed(2) ?? ''])
    }
  }
  const csv = rows.map((r) => r.join(',')).join('\n')
  const blob = new Blob([csv], {type: 'text/csv'})
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `realized_gains_${new Date().toISOString().split('T')[0]}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// Load history on mount; load gains lazily when tab is opened
onMounted(fetchTransactions)
watch(activeTab, (tab) => {
  if (tab === 'gains') fetchGains()
})

defineExpose({
  exportActive() {
    if (activeTab.value === 'history') exportCSV()
    else if (activeTab.value === 'gains') exportGainsCSV()
  },
  canExport: computed(() => activeTab.value === 'history' ? filtered.value.length > 0 : visibleYears.value.length > 0),
})
</script>

<template>
  <div class="transactions" :class="{embedded}">
    <header v-if="!embedded" class="page-header">
      <h1 class="gradient-title">Records</h1>
      <Button
          v-if="activeTab === 'history'"
          :disabled="!filtered.length"
          icon="pi pi-download"
          outlined
          size="small"
          @click="exportCSV"
      />
      <Button
          v-else-if="activeTab === 'gains' && visibleYears.length"
          icon="pi pi-download"
          outlined
          size="small"
          @click="exportGainsCSV"
      />
    </header>

    <!-- Tab bar -->
    <div class="tab-bar">
      <button :class="{active: activeTab === 'history'}" class="tab-btn" @click="activeTab = 'history'">
        {{ t('nav.transactions') }}
      </button>
      <button :class="{active: activeTab === 'gains'}" class="tab-btn" @click="activeTab = 'gains'">
        {{ t('transactions.realizedGains') }}
      </button>
    </div>

    <!-- ── History tab ── -->
    <template v-if="activeTab === 'history'">
      <div class="filters">
        <InputText v-model="filterTicker" :placeholder="t('transactions.filterTicker')" class="filter-input"
                   size="small"/>
        <Select
            v-model="filterType"
            :options="typeOptions"
            class="filter-select"
            option-label="label"
            option-value="value"
            size="small"
        />
      </div>

      <div v-if="loadingHistory" class="page-loader">
        <AppLoader/>
      </div>
      <div v-else-if="!filtered.length" class="empty">
        <i class="pi pi-list"/>
        <p class="text-muted">{{ t('transactions.noTransactions') }}</p>
      </div>
      <div v-else class="tx-list">
        <div v-for="tx in filtered" :key="tx._id" class="tx-row" @click="openEdit(tx)">
          <div class="tx-left">
            <span class="ticker">{{ tx.ticker }}</span>
            <span class="tx-date text-muted">{{ formatDate(tx.date) }}</span>
          </div>
          <div class="tx-mid">
            <span v-if="tx.type === 'dividend'" class="text-muted">
              {{ useTickerCurrency(tx.price, tx.ticker) }}{{
                t('transactions.perShareShort')
              }}{{ tx.drip ? ' · DRIP' : '' }}
            </span>
            <span v-else class="text-muted">{{ tx.shares }} × {{ useTickerCurrency(tx.price, tx.ticker) }}</span>
          </div>
          <div class="tx-right">
            <Tag
                :severity="tx.type === 'buy' ? 'success' : tx.type === 'sell' ? 'danger' : 'info'"
                :value="tx.type === 'buy' ? t('common.buy') : tx.type === 'sell' ? t('common.sell') : t('common.dividend')"
            />
            <span :class="tx.type === 'sell' || tx.type === 'dividend' ? 'gain' : ''" class="total">
              {{ tx.type === 'sell' || tx.type === 'dividend' ? '+' : '-' }}{{ useTickerCurrency(tx.total, tx.ticker) }}
            </span>
          </div>
          <i class="pi pi-pencil edit-hint text-muted"/>
        </div>
      </div>
      <p v-if="filtered.length" class="count text-muted">
        {{ t('transactions.count', {count: filtered.length, plural: filtered.length !== 1 ? 's' : ''}) }}
      </p>
    </template>

    <!-- ── Realized gains tab ── -->
    <template v-else-if="activeTab === 'gains'">
      <div v-if="loadingGains" class="page-loader">
        <AppLoader/>
      </div>

      <template v-else-if="gainsData">
        <div v-if="!gainsData.availableYears.length" class="empty">
          <i class="pi pi-chart-line"/>
          <p class="text-muted">{{ t('transactions.noRealizedGains') }}</p>
          <span class="text-muted" style="font-size:0.8rem">{{ t('transactions.sellToSeeGains') }}</span>
        </div>

        <template v-else>
          <!-- Year filter -->
          <div class="gains-filter">
            <Select
                v-model="selectedYear"
                :options="yearOptions"
                option-label="label"
                option-value="value"
                size="small"
                style="width:130px"
            />
          </div>

          <!-- Year sections -->
          <div v-for="yr in visibleYears" :key="yr.year" class="year-section">
            <!-- Year summary header -->
            <div class="year-header">
              <span class="year-label">{{ yr.year }}</span>
              <div class="year-totals">
                <div v-if="yr.totalDividends" class="year-stat">
                  <span class="text-muted">{{ t('common.dividends') }}</span>
                  <span class="gain">+{{ useCurrency(yr.totalDividends, 'USD') }}</span>
                </div>
                <div class="year-stat">
                  <span class="text-muted">{{ t('transactions.grossGain') }}</span>
                  <span :class="gainLossClass(yr.totalGross)">
                    {{ yr.totalGross >= 0 ? '+' : '' }}{{ useCurrency(yr.totalGross, 'USD') }}
                  </span>
                </div>
                <div class="year-stat">
                  <span class="text-muted">{{ t('transactions.netGain') }}</span>
                  <span :class="gainLossClass(yr.totalNet)" class="net-highlight">
                    {{ yr.totalNet >= 0 ? '+' : '' }}{{ useCurrency(yr.totalNet, 'USD') }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Sell rows -->
            <div v-for="s in yr.sells" :key="s._id" class="gain-row" @click="openEditGain(s, 'sell')">
              <div class="gain-left">
                <span class="ticker">{{ s.ticker }}</span>
                <span class="tx-date text-muted">{{ formatDate(s.date) }}</span>
              </div>
              <div class="gain-mid text-muted">
                {{ s.shares }} {{ t('rebalance.sharesShort') }} · {{ t('transactions.avg') }}
                {{ useTickerCurrency(s.avgCostAtSale, s.ticker) }} →
                {{ useTickerCurrency(s.price, s.ticker) }}
              </div>
              <div class="gain-right">
                <span :class="gainLossClass(s.grossGain)" class="gross-gain">
                  {{ s.grossGain >= 0 ? '+' : '' }}{{ useTickerCurrency(s.grossGain, s.ticker) }}
                </span>
                <span v-if="s.feePaid || s.taxPaid" :class="gainLossClass(s.netGain)" class="net-gain">
                  {{ t('transactions.net') }} {{ s.netGain >= 0 ? '+' : '' }}{{
                    useTickerCurrency(s.netGain, s.ticker)
                  }}
                </span>
              </div>
              <i class="pi pi-pencil edit-hint text-muted"/>
            </div>

            <!-- Dividend rows in this year -->
            <div v-for="d in yr.dividends" :key="d._id" class="gain-row gain-row-div" @click="openEditGain(d, 'dividend')">
              <div class="gain-left">
                <span class="ticker">{{ d.ticker }}</span>
                <span class="tx-date text-muted">{{ formatDate(d.date) }}</span>
              </div>
              <div class="gain-mid text-muted">{{ t('common.dividend') }}</div>
              <div class="gain-right">
                <span class="gain gross-gain">+{{ useTickerCurrency(d.grossGain, d.ticker) }}</span>
              </div>
              <i class="pi pi-pencil edit-hint text-muted"/>
            </div>
          </div>
        </template>
      </template>
    </template>

    <EditTransactionModal
        v-model:visible="showEdit"
        :transaction="editTx"
        @saved="onTransactionSaved"
    />
  </div>
</template>

<style scoped>
.transactions {
  padding: 1rem;
}

.transactions.embedded {
  padding: 0;
}

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

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}


/* Tab bar */
.tab-bar {
  display: flex;
  gap: 0;
  margin-bottom: 1rem;
  border-bottom: 1px solid var(--border);
}

.tab-btn {
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-secondary);
  font-size: 0.88rem;
  font-weight: 600;
  padding: 0.55rem 1rem 0.6rem;
  cursor: pointer;
  margin-bottom: -1px;
  transition: color 0.15s, border-color 0.15s;
}

.tab-btn.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}

/* History tab */
.filters {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.filter-input {
  flex: 1;
}

.filter-select {
  width: 130px;
}


.empty i {
  font-size: 3rem;
  color: var(--text-secondary);
}

.tx-list {
  display: flex;
  flex-direction: column;
}

.tx-row {
  display: grid;
  grid-template-columns: minmax(72px, 0.8fr) minmax(86px, 1fr) minmax(68px, auto) 20px;
  align-items: center;
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--border);
  gap: 0.5rem;
  cursor: pointer;
  transition: background 0.15s;
}

.tx-row:active {
  background: color-mix(in srgb, var(--text-primary) 4%, transparent);
}

.tx-left {
  min-width: 0;
}

.tx-mid {
  min-width: 0;
  font-size: 0.82rem;
}

.tx-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.total {
  font-size: 0.88rem;
  font-weight: 500;
}

.edit-hint {
  justify-self: end;
  color: var(--text-secondary);
  font-size: 0.75rem;
}

.count {
  margin-top: 0.75rem;
  font-size: 0.8rem;
  text-align: center;
}

/* Realized gains tab */
.gains-filter {
  margin-bottom: 1rem;
}

.year-section {
  margin-bottom: 1.5rem;
}

.year-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.65rem 0.85rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  margin-bottom: 0.25rem;
  flex-wrap: wrap;
}

.year-label {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary);
}

.year-totals {
  display: flex;
  gap: 1.25rem;
  flex-wrap: wrap;
}

.year-stat {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
  font-size: 0.8rem;
}

.year-stat .text-muted {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.net-highlight {
  font-size: 0.92rem;
  font-weight: 700;
}

/* Gain rows */
.gain-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.65rem 0;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  transition: background 0.15s;
}

.gain-row:active {
  background: rgba(255, 255, 255, 0.03);
}

.gain-row-div {
  opacity: 0.8;
}

.gain-left {
  flex: 0 0 90px;
}

.gain-mid {
  flex: 1;
  font-size: 0.78rem;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gain-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  flex-shrink: 0;
}

.gross-gain {
  font-size: 0.9rem;
  font-weight: 600;
}

.net-gain {
  font-size: 0.75rem;
}

.ticker {
  font-weight: 600;
  display: block;
  font-size: 0.95rem;
}

.tx-date {
  font-size: 0.75rem;
}
</style>
