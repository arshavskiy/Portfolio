<script setup>
import {computed, onMounted, ref, watch} from 'vue'
import {gainLossClass, useCurrency, useTickerCurrency} from '@/composables/useFormat'
import {useNavigateToPosition} from '@/composables/useNavigateToPosition'
import {useAlertsStore} from '@/stores/alerts'
import {usePush} from '@/composables/usePush'
import api from '@/composables/useApi'
import {useToast} from 'primevue/usetoast'
import Tag from 'primevue/tag'
import Select from 'primevue/select'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import ToggleSwitch from 'primevue/toggleswitch'
import EditTransactionModal from '@/components/modals/EditTransactionModal.vue'
import AppLoader from '@/components/ui/AppLoader.vue'
import {useI18n} from '@/composables/useI18n'
import {useDashboardStore} from '@/stores/dashboard'

const {locale, t} = useI18n()
const dashboard = useDashboardStore()

// ── Transactions ───────────────────────────────────────────────────────────
const activeTab = ref('history')
const transactions = ref([])
const loadingHistory = ref(false)
const filterTicker = ref('')
const filterType = ref('')
const editTx = ref(null)
const showEdit = ref(false)

const typeOptions = computed(() => [
  {label: t('transactions.allTypes'), value: ''},
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

const filtered = computed(() =>
  transactions.value.filter((tx) => {
    const tickerMatch = !filterTicker.value || tx.ticker.includes(filterTicker.value.toUpperCase())
    const typeMatch = !filterType.value || tx.type === filterType.value
    return tickerMatch && typeMatch
  })
)

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
    ...filtered.value.map((tx) => [formatDate(tx.date), tx.ticker, tx.type, tx.shares, tx.price, tx.total]),
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

// ── Realized gains ─────────────────────────────────────────────────────────
const gainsData = ref(null)
const loadingGains = ref(false)
const selectedYear = ref(null)

const yearOptions = computed(() => {
  const years = gainsData.value?.availableYears ?? []
  return [{label: t('transactions.allYears'), value: null}, ...years.map((y) => ({label: String(y), value: y}))]
})

const visibleYears = computed(() => {
  const years = gainsData.value?.years ?? []
  if (!selectedYear.value) return years
  return years.filter((y) => y.year === selectedYear.value)
})

function realizedCurrency(record) {
  return record?.currency || (String(record?.ticker || '').toUpperCase().endsWith('.TA') ? 'ILS' : 'USD')
}

function formatRealizedAmount(value, record) {
  return useCurrency(value, realizedCurrency(record))
}

function realizedTotals(year, key) {
  const totals = year?.totalsByCurrency?.length
      ? year.totalsByCurrency
      : [{currency: 'USD', totalGross: year?.totalGross || 0, totalNet: year?.totalNet || 0, totalDividends: year?.totalDividends || 0}]
  return totals.filter((total) => Number(total?.[key]) !== 0)
}

async function fetchGains(force = false) {
  if (gainsData.value && !force) return
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
  dashboard.fetchIncomeProjection().catch(() => {})
}

function exportGainsCSV() {
  const rows = [['Year', 'Date', 'Ticker', 'Currency', 'Type', 'Shares', 'Avg Cost', 'Proceeds', 'Gross Gain', 'Fees', 'Tax', 'Net Gain']]
  for (const yr of visibleYears.value) {
    for (const s of yr.sells) {
        rows.push([yr.year, formatDate(s.date), s.ticker, realizedCurrency(s), 'sell', s.shares ?? '', s.avgCostAtSale?.toFixed(4) ?? '', s.proceeds?.toFixed(2) ?? '', s.grossGain?.toFixed(2) ?? '', s.feePaid?.toFixed(2) ?? '', s.taxPaid?.toFixed(2) ?? '', s.netGain?.toFixed(2) ?? ''])
    }
    for (const d of yr.dividends) {
      rows.push([yr.year, formatDate(d.date), d.ticker, realizedCurrency(d), 'dividend', '', '', '', d.grossGain?.toFixed(2) ?? '', '', '', d.netGain?.toFixed(2) ?? ''])
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

// ── Alerts ─────────────────────────────────────────────────────────────────
const toast = useToast()
const alerts = useAlertsStore()
const {supported, subscribed, busy, refreshState, enablePush, disablePush} = usePush()
const {openPosition} = useNavigateToPosition()

async function togglePush() {
  try {
    if (subscribed.value) {
      await disablePush()
      toast.add({severity: 'info', summary: t('alerts.pushDisabled'), life: 2000})
    } else {
      await enablePush()
      toast.add({severity: 'success', summary: t('alerts.pushEnabled'), life: 2000})
    }
  } catch (err) {
    toast.add({severity: 'error', summary: err.message, life: 3000})
  }
}

async function toggleActive(alert) {
  try {
    await alerts.updateAlert(alert._id, {active: !alert.active})
  } catch (err) {
    toast.add({severity: 'error', summary: err.message, life: 3000})
  }
}

async function removeAlert(alert) {
  try {
    await alerts.deleteAlert(alert._id)
    toast.add({severity: 'success', summary: t('alerts.deleted'), life: 2000})
  } catch (err) {
    toast.add({severity: 'error', summary: err.message, life: 3000})
  }
}

onMounted(() => {
  fetchTransactions()
  alerts.fetchAlerts()
  refreshState()
})

watch(activeTab, (tab) => {
  if (tab === 'gains') fetchGains()
})
</script>

<template>
  <div class="ta-layout">
    <!-- Left: Transactions -->
    <div class="tx-col">
      <header class="col-header">
        <h1 class="gradient-title">{{ t('nav.records') }}</h1>
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

      <div class="tab-bar">
        <button :class="{active: activeTab === 'history'}" class="tab-btn" @click="activeTab = 'history'">
          {{ t('nav.transactions') }}
        </button>
        <button :class="{active: activeTab === 'gains'}" class="tab-btn" @click="activeTab = 'gains'">
          {{ t('transactions.realizedGains') }}
        </button>
      </div>

      <div class="tx-body">
        <!-- History tab -->
        <template v-if="activeTab === 'history'">
          <div class="filters">
            <InputText v-model="filterTicker" :placeholder="t('transactions.filterTicker')" class="filter-input"
                       size="small"/>
            <Select v-model="filterType" :options="typeOptions" class="filter-select" option-label="label" option-value="value" size="small" :placeholder="t('transactions.allTypes')"/>
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
                <div class="tx-ticker-row">
                  <span class="ticker">{{ tx.ticker }}</span>
                  <Tag
                    :severity="tx.type === 'buy' ? 'success' : tx.type === 'sell' ? 'danger' : 'info'"
                    :value="tx.type === 'buy' ? t('common.buy') : tx.type === 'sell' ? t('common.sell') : t('common.dividend')"
                    class="tx-type-tag"
                  />
                </div>
                <span class="tx-date text-muted">{{ formatDate(tx.date) }}</span>
              </div>
              <div class="tx-mid">
                <span v-if="tx.type === 'dividend'" class="tx-detail">
                  <span class="tx-shares">{{ t('common.dividend') }}</span>
                  <span class="text-muted">{{ useTickerCurrency(tx.price, tx.ticker) }}/sh{{ tx.drip ? ' · DRIP' : '' }}</span>
                </span>
                <span v-else class="tx-detail">
                  <span class="tx-shares">{{ tx.shares }} {{ t('common.shares').toLowerCase() }}</span>
                  <span class="text-muted">@ {{ useTickerCurrency(tx.price, tx.ticker) }}</span>
                </span>
              </div>
              <div class="tx-right">
                <span :class="tx.type === 'sell' || tx.type === 'dividend' ? 'gain' : 'loss'" class="total">
                  {{ tx.type === 'sell' || tx.type === 'dividend' ? '+' : '-' }}{{ useTickerCurrency(tx.total, tx.ticker) }}
                </span>
              </div>
              <i class="pi pi-pencil edit-hint text-muted"/>
            </div>
          </div>
          <p v-if="filtered.length" class="count text-muted">{{
              t('transactions.count', {
                count: filtered.length,
                plural: filtered.length !== 1 ? 's' : ''
              })
            }}</p>
        </template>

        <!-- Realized gains tab -->
        <template v-else-if="activeTab === 'gains'">
          <div v-if="loadingGains" class="page-loader"><AppLoader/></div>
          <template v-else-if="gainsData">
            <div v-if="!gainsData.availableYears.length" class="empty">
              <i class="pi pi-chart-line"/>
              <p class="text-muted">{{ t('transactions.noRealizedGains') }}</p>
            </div>
            <template v-else>
              <div class="gains-filter">
                <Select v-model="selectedYear" :options="yearOptions" option-label="label" option-value="value" size="small" style="width:130px"/>
              </div>
              <div v-for="yr in visibleYears" :key="yr.year" class="year-section">
                <div class="year-header">
                  <span class="year-label">{{ yr.year }}</span>
                  <div class="year-totals">
                    <div v-for="total in realizedTotals(yr, 'totalDividends')" :key="`${total.currency}-dividends`" class="year-stat">
                      <span class="text-muted">{{ t('common.dividends') }}</span>
                      <span class="gain">+{{ useCurrency(total.totalDividends, total.currency) }}</span>
                    </div>
                    <div v-for="total in realizedTotals(yr, 'totalGross')" :key="`${total.currency}-gross`" class="year-stat">
                      <span class="text-muted">{{ t('transactions.grossGain') }}</span>
                      <span :class="gainLossClass(total.totalGross)">{{ total.totalGross >= 0 ? '+' : '' }}{{ useCurrency(total.totalGross, total.currency) }}</span>
                    </div>
                    <div v-for="total in realizedTotals(yr, 'totalNet')" :key="`${total.currency}-net`" class="year-stat">
                      <span class="text-muted">{{ t('transactions.netGain') }}</span>
                      <span :class="gainLossClass(total.totalNet)" class="net-highlight">{{ total.totalNet >= 0 ? '+' : '' }}{{ useCurrency(total.totalNet, total.currency) }}</span>
                    </div>
                  </div>
                </div>
                <div v-for="s in yr.sells" :key="s._id" class="gain-row" @click="openEditGain(s, 'sell')">
                  <div class="gain-left">
                    <span class="ticker">{{ s.ticker }}</span>
                    <span class="tx-date text-muted">{{ formatDate(s.date) }}</span>
                  </div>
                  <div class="gain-mid text-muted">{{ s.shares }} {{ t('rebalance.sharesShort') }} ·
                    {{ t('transactions.avg') }} {{ formatRealizedAmount(s.avgCostAtSale, s) }} →
                    {{ formatRealizedAmount(s.price, s) }}
                  </div>
                  <div class="gain-right">
                    <span :class="gainLossClass(s.grossGain)" class="gross-gain">{{ s.grossGain >= 0 ? '+' : '' }}{{ formatRealizedAmount(s.grossGain, s) }}</span>
                    <span v-if="s.feePaid || s.taxPaid" :class="gainLossClass(s.netGain)"
                          class="net-gain">{{ t('transactions.net') }} {{
                        s.netGain >= 0 ? '+' : ''
                      }}{{ formatRealizedAmount(s.netGain, s) }}</span>
                  </div>
                  <i class="pi pi-pencil edit-hint text-muted"/>
                </div>
                <div v-for="d in yr.dividends" :key="d._id" class="gain-row gain-row-div" @click="openEditGain(d, 'dividend')">
                  <div class="gain-left">
                    <span class="ticker">{{ d.ticker }}</span>
                    <span class="tx-date text-muted">{{ formatDate(d.date) }}</span>
                  </div>
                  <div class="gain-mid text-muted">{{ t('common.dividend') }}</div>
                  <div class="gain-right">
                    <span class="gain gross-gain">+{{ formatRealizedAmount(d.grossGain, d) }}</span>
                  </div>
                  <i class="pi pi-pencil edit-hint text-muted"/>
                </div>
              </div>
            </template>
          </template>
        </template>
      </div>
    </div>

    <!-- Divider -->
    <div class="col-divider"/>

    <!-- Right: Alerts -->
    <div class="alerts-col">
      <header class="col-header alerts-header">
        <h1 class="gradient-title">{{ t('alerts.title') }}</h1>
      </header>

      <div class="push-card">
        <div class="push-info">
          <i class="pi pi-bell"/>
          <div>
            <div class="push-title">{{ t('alerts.pushNotifications') }}</div>
            <div class="push-sub text-muted">
              {{
                supported ? (subscribed ? t('alerts.pushOn') : t('alerts.pushOff')) : t('alerts.pushUnsupportedShort')
              }}
            </div>
          </div>
        </div>
        <ToggleSwitch :disabled="!supported || busy" :model-value="subscribed" @update:model-value="togglePush"/>
      </div>

      <div v-if="alerts.loading" class="col-empty text-muted">{{ t('common.loading') }}</div>

      <div v-else-if="!alerts.items.length" class="col-empty text-muted">
        <i class="pi pi-bell-slash"/>
        <p>{{ t('alerts.empty') }}</p>
        <span class="sub">{{ t('alerts.emptyHint') }}</span>
      </div>

      <div v-else class="alert-list">
        <div
            v-for="a in alerts.items"
            :key="a._id"
            :class="{triggered: !a.active && a.triggeredAt}"
            class="alert-row"
        >
          <div class="alert-main" @click="openPosition(a.ticker)">
            <span class="ticker">{{ a.ticker }}</span>
            <span class="cond">
              <i :class="a.condition === 'above' ? 'pi pi-arrow-up' : 'pi pi-arrow-down'"/>
              {{ useTickerCurrency(a.target, a.ticker) }}
            </span>
            <span v-if="a.triggeredAt" class="triggered-tag">{{
                t('alerts.triggeredAt', {price: useTickerCurrency(a.triggeredPrice, a.ticker)})
              }}</span>
          </div>
          <div class="alert-actions">
            <ToggleSwitch :model-value="a.active" @update:model-value="toggleActive(a)"/>
            <Button icon="pi pi-trash" severity="danger" size="small" text @click="removeAlert(a)"/>
          </div>
        </div>
      </div>
    </div>
  </div>

  <EditTransactionModal v-model:visible="showEdit" :transaction="editTx" @saved="onTransactionSaved"/>
</template>

<style scoped>
.ta-layout {
  display: flex;
  height: 100%;
  overflow: hidden;
}

.tx-col {
  flex: 1;
  min-width: 400px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.col-divider {
  width: 1px;
  background: var(--border);
  flex-shrink: 0;
}

.alerts-col {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0 1.25rem 2rem;
}

.col-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.25rem 1.25rem 0;
  flex-shrink: 0;
}

.alerts-header {
  padding: 1.25rem 0 0;
}

.col-header h1 {
  font-size: 1.3rem;
  margin: 0;
}

.tab-bar {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--border);
  padding: 0 1.25rem;
  margin-top: 0.75rem;
  flex-shrink: 0;
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

.tx-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 1rem 1.25rem 2rem;
}

.filters {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.filter-input { flex: 1; }
.filter-select { width: 130px; }

.filter-select :deep(.p-select-label),
.filter-select :deep(.p-select-label.p-placeholder) {
  color: var(--text-primary);
}


.empty { height: auto; }

.empty i { font-size: 3rem; color: var(--text-secondary); }

.tx-list { display: flex; flex-direction: column; gap: 0.15rem; }

.tx-row {
  display: flex;
  align-items: center;
  padding: 0.6rem 0.75rem;
  border-radius: 8px;
  gap: 0.75rem;
  cursor: pointer;
  transition: background 0.15s;
}

.tx-row:hover { background: var(--bg-card); }
.tx-row:active { background: color-mix(in srgb, var(--text-primary) 6%, transparent); }

.tx-left { flex: 0 0 160px; }

.tx-ticker-row {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin-bottom: 0.15rem;
}

.tx-type-tag :deep(.p-tag) {
  font-size: 0.65rem;
  padding: 1px 6px;
  border-radius: 4px;
}

.tx-mid { flex: 1; font-size: 0.82rem; }

.tx-detail {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.tx-shares {
  font-size: 0.84rem;
  font-weight: 600;
  color: var(--text-primary);
}

.tx-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.total { font-size: 0.9rem; font-weight: 600; }
.edit-hint { font-size: 0.7rem; flex-shrink: 0; opacity: 0.4; }
.tx-row:hover .edit-hint { opacity: 1; }
.count { margin-top: 0.75rem; font-size: 0.8rem; text-align: center; }

.gains-filter { margin-bottom: 1rem; }

.year-section { margin-bottom: 1.5rem; }

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

.year-label { font-size: 1rem; font-weight: 700; }

.year-totals { display: flex; gap: 1.25rem; flex-wrap: wrap; }

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

.net-highlight { font-size: 0.92rem; font-weight: 700; }

.gain-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.65rem 0;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  transition: background 0.15s;
}

.gain-row:hover {
  background: rgba(255, 255, 255, 0.03);
}

.gain-row-div { opacity: 0.8; }
.gain-left { flex: 0 0 90px; }

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

.gross-gain { font-size: 0.9rem; font-weight: 600; }
.net-gain { font-size: 0.75rem; }

.ticker { font-weight: 600; display: block; font-size: 0.95rem; }
.tx-date { font-size: 0.75rem; }

/* Alerts panel */
.push-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 0.9rem 1rem;
  margin: 1rem 0;
  flex-shrink: 0;
}

.push-info { display: flex; align-items: center; gap: 0.75rem; }
.push-info > i { font-size: 1.3rem; color: var(--accent); }
.push-title { font-weight: 600; font-size: 0.92rem; }
.push-sub { font-size: 0.78rem; }

.col-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  padding: 3rem 1rem;
  text-align: center;
}

.col-empty i { font-size: 2.5rem; opacity: 0.3; }
.sub { font-size: 0.8rem; }

.alert-list { display: flex; flex-direction: column; gap: 0.5rem; }

.alert-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 0.65rem 0.85rem;
}

.alert-row.triggered { border-color: color-mix(in srgb, var(--green) 50%, transparent); }

.alert-main {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex: 1;
  cursor: pointer;
  flex-wrap: wrap;
}

.cond {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.cond i { font-size: 0.75rem; }
.triggered-tag { font-size: 0.7rem; color: var(--green); }
.alert-actions { display: flex; align-items: center; gap: 0.25rem; }
</style>
