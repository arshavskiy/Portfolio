<script setup>
import {computed, defineAsyncComponent, onMounted, ref, watch} from 'vue'
import {storeToRefs} from 'pinia'
import {useToast} from 'primevue/usetoast'
import {useDashboardStore} from '@/stores/dashboard'
import {useAlertsStore} from '@/stores/alerts'
import {usePush} from '@/composables/usePush'
import {useNavigateToPosition} from '@/composables/useNavigateToPosition'
import {gainLossClass, useCurrency, useTickerCurrency} from '@/composables/useFormat'
import api from '@/composables/useApi'
import Button from 'primevue/button'
import ToggleSwitch from 'primevue/toggleswitch'
import Tag from 'primevue/tag'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import EditTransactionModal from '@/components/ui/EditTransactionModal.vue'
import AppLoader from '@/components/ui/AppLoader.vue'
import {useI18n} from '@/composables/useI18n'

const PortfolioHistoryChart = defineAsyncComponent(() => import('@/components/charts/PortfolioHistoryChart.vue'))
const PortfolioCompareChart = defineAsyncComponent(() => import('@/components/charts/PortfolioCompareChart.vue'))

const toast = useToast()
const {locale, t} = useI18n()
const dashboard = useDashboardStore()
const alerts = useAlertsStore()
const {supported, subscribed, busy, refreshState, enablePush, disablePush} = usePush()
const {openPosition} = useNavigateToPosition()

const {portfolioPositions, history, historyLoading, historyRange} = storeToRefs(dashboard)

const HISTORY_RANGES = [
  {label: '1D', value: '1d'},
  {label: '1W', value: '1wk'},
  {label: '1M', value: '1mo'},
  {label: '3M', value: '3mo'},
  {label: '6M', value: '6mo'},
]

// ── Transactions ──────────────────────────────────────────────────────────
const activeTab = ref('history')
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

function openEdit(tx) { editTx.value = tx; showEdit.value = true }

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
  const a = document.createElement('a'); a.href = url
  a.download = `transactions_${new Date().toISOString().split('T')[0]}.csv`
  a.click(); URL.revokeObjectURL(url)
}

// ── Realized gains ────────────────────────────────────────────────────────
const gainsData = ref(null)
const loadingGains = ref(false)
const selectedYear = ref(null)

const yearOptions = computed(() => {
  const years = gainsData.value?.availableYears ?? []
  return [{label: t('transactions.allYears'), value: null}, ...years.map((y) => ({label: String(y), value: y}))]
})

const visibleYears = computed(() => {
  const years = gainsData.value?.years ?? []
  return selectedYear.value ? years.filter((y) => y.year === selectedYear.value) : years
})

async function fetchGains() {
  if (gainsData.value) return
  loadingGains.value = true
  try { gainsData.value = await api.get('/portfolio/realized-gains') }
  finally { loadingGains.value = false }
}

function onTransactionSaved() {
  fetchTransactions()
  gainsData.value = null
  if (activeTab.value === 'gains') fetchGains()
  dashboard.fetchIncomeProjection().catch(() => {})
}

function exportGainsCSV() {
  const rows = [['Year', 'Date', 'Ticker', 'Type', 'Shares', 'Avg Cost', 'Proceeds', 'Gross Gain', 'Fees', 'Tax', 'Net Gain']]
  for (const yr of visibleYears.value) {
    for (const s of yr.sells) rows.push([yr.year, formatDate(s.date), s.ticker, 'sell', s.shares ?? '', s.avgCostAtSale?.toFixed(4) ?? '', s.proceeds?.toFixed(2) ?? '', s.grossGain?.toFixed(2) ?? '', s.feePaid?.toFixed(2) ?? '', s.taxPaid?.toFixed(2) ?? '', s.netGain?.toFixed(2) ?? ''])
    for (const d of yr.dividends) rows.push([yr.year, formatDate(d.date), d.ticker, 'dividend', '', '', '', d.grossGain?.toFixed(2) ?? '', '', '', d.netGain?.toFixed(2) ?? ''])
  }
  const csv = rows.map((r) => r.join(',')).join('\n')
  const blob = new Blob([csv], {type: 'text/csv'})
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url
  a.download = `realized_gains_${new Date().toISOString().split('T')[0]}.csv`
  a.click(); URL.revokeObjectURL(url)
}

// ── Alerts ────────────────────────────────────────────────────────────────
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

onMounted(async () => {
  try { await dashboard.initialize() } catch {}
  alerts.fetchAlerts()
  refreshState()
  fetchTransactions()
})

watch(activeTab, (tab) => { if (tab === 'gains') fetchGains() })
</script>

<template>
  <div class="ha-layout">

    <!-- Col 1: Portfolio History -->
    <div class="history-col">
      <header class="col-header">
        <h1 class="gradient-title">{{ t('dashboard.portfolioValue') }}</h1>
        <div class="toggle-group">
          <button
              v-for="opt in HISTORY_RANGES"
              :key="opt.value"
              :class="{active: historyRange === opt.value}"
              class="toggle-btn"
              @click="dashboard.setHistoryRange(opt.value)"
          >{{ opt.label }}</button>
        </div>
      </header>
      <div class="col-body">
        <PortfolioHistoryChart
            v-if="portfolioPositions.length"
            :key="historyRange"
            :data="history"
            :loading="historyLoading"
            :range="historyRange"
        />
        <div v-else class="col-empty text-muted">
          <i class="pi pi-chart-line"/>
          <p>{{ t('dashboard.empty') }}</p>
        </div>
        <PortfolioCompareChart
            v-if="portfolioPositions.length"
            :positions="portfolioPositions"
            :range="historyRange"
        />
      </div>
    </div>

    <div class="col-divider"/>

    <!-- Col 2: Transactions -->
    <div class="tx-col">
      <header class="col-header tx-col-header">
        <div class="tx-title-row">
          <h1 class="gradient-title">{{ t('nav.transactions') }}</h1>
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
        </div>
        <div class="tab-bar">
          <button :class="{active: activeTab === 'history'}" class="tab-btn" @click="activeTab = 'history'">
            {{ t('nav.transactions') }}
          </button>
          <button :class="{active: activeTab === 'gains'}" class="tab-btn" @click="activeTab = 'gains'">
            {{ t('transactions.realizedGains') }}
          </button>
        </div>
      </header>

      <div class="col-body">
        <!-- History tab -->
        <template v-if="activeTab === 'history'">
          <div class="filters">
            <InputText v-model="filterTicker" :placeholder="t('transactions.filterTicker')" class="filter-input"
                       size="small"/>
            <Select v-model="filterType" :options="typeOptions" class="filter-select" option-label="label" option-value="value" size="small"/>
          </div>
          <div v-if="loadingHistory" class="page-loader"><AppLoader/></div>
          <div v-else-if="!filtered.length" class="col-empty text-muted">
            <i class="pi pi-list"/>
            <p>{{ t('transactions.noTransactions') }}</p>
          </div>
          <div v-else class="tx-list">
            <div v-for="tx in filtered" :key="tx._id" class="tx-row" @click="openEdit(tx)">
              <div class="tx-left">
                <span class="tx-ticker">{{ tx.ticker }}</span>
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
                <Tag :severity="tx.type === 'buy' ? 'success' : tx.type === 'sell' ? 'danger' : 'info'"
                     :value="tx.type === 'buy' ? t('common.buy') : tx.type === 'sell' ? t('common.sell') : t('common.dividend')"/>
                <span :class="tx.type === 'sell' || tx.type === 'dividend' ? 'gain' : ''" class="total">
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
            <div v-if="!gainsData.availableYears.length" class="col-empty text-muted">
              <i class="pi pi-chart-line"/>
              <p>{{ t('transactions.noRealizedGains') }}</p>
            </div>
            <template v-else>
              <div class="gains-filter">
                <Select v-model="selectedYear" :options="yearOptions" option-label="label" option-value="value" size="small" style="width:130px"/>
              </div>
              <div v-for="yr in visibleYears" :key="yr.year" class="year-section">
                <div class="year-header">
                  <span class="year-label">{{ yr.year }}</span>
                  <div class="year-totals">
                    <div v-if="yr.totalDividends" class="year-stat">
                      <span class="text-muted">{{ t('common.dividends') }}</span>
                      <span class="gain">+{{ useCurrency(yr.totalDividends, 'USD') }}</span>
                    </div>
                    <div class="year-stat">
                      <span class="text-muted">{{ t('transactions.grossGain') }}</span>
                      <span :class="gainLossClass(yr.totalGross)">{{ yr.totalGross >= 0 ? '+' : '' }}{{ useCurrency(yr.totalGross, 'USD') }}</span>
                    </div>
                    <div class="year-stat">
                      <span class="text-muted">{{ t('transactions.netGain') }}</span>
                      <span :class="gainLossClass(yr.totalNet)" class="net-highlight">{{ yr.totalNet >= 0 ? '+' : '' }}{{ useCurrency(yr.totalNet, 'USD') }}</span>
                    </div>
                  </div>
                </div>
                <div v-for="s in yr.sells" :key="s._id" class="gain-row">
                  <div class="tx-left">
                    <span class="tx-ticker">{{ s.ticker }}</span>
                    <span class="tx-date text-muted">{{ formatDate(s.date) }}</span>
                  </div>
                  <div class="gain-mid text-muted">{{ s.shares }} {{ t('rebalance.sharesShort') }} ·
                    {{ t('transactions.avg') }} {{ useTickerCurrency(s.avgCostAtSale, s.ticker) }} →
                    {{ useTickerCurrency(s.price, s.ticker) }}
                  </div>
                  <div class="gain-right">
                    <span :class="gainLossClass(s.grossGain)" class="gross-gain">{{ s.grossGain >= 0 ? '+' : '' }}{{ useTickerCurrency(s.grossGain, s.ticker) }}</span>
                    <span v-if="s.feePaid || s.taxPaid" :class="gainLossClass(s.netGain)"
                          class="net-gain">{{ t('transactions.net') }} {{
                        s.netGain >= 0 ? '+' : ''
                      }}{{ useTickerCurrency(s.netGain, s.ticker) }}</span>
                  </div>
                </div>
                <div v-for="d in yr.dividends" :key="d._id" class="gain-row gain-row-div">
                  <div class="tx-left">
                    <span class="tx-ticker">{{ d.ticker }}</span>
                    <span class="tx-date text-muted">{{ formatDate(d.date) }}</span>
                  </div>
                  <div class="gain-mid text-muted">{{ t('common.dividend') }}</div>
                  <div class="gain-right">
                    <span class="gain gross-gain">+{{ useTickerCurrency(d.grossGain, d.ticker) }}</span>
                  </div>
                </div>
              </div>
            </template>
          </template>
        </template>
      </div>
    </div>

    <div class="col-divider"/>

    <!-- Col 3: Alerts -->
    <div class="alerts-col">
      <header class="col-header">
        <h1 class="gradient-title">{{ t('alerts.title') }}</h1>
      </header>
      <div class="col-body">
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
              <span class="al-ticker">{{ a.ticker }}</span>
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

  </div>

  <EditTransactionModal v-model:visible="showEdit" :transaction="editTx" @saved="onTransactionSaved"/>
</template>

<style scoped>
.ha-layout {
  display: flex;
  height: 100%;
  overflow: hidden;
}

/* Column bases */
.col-divider {
  width: 1px;
  background: var(--border);
  flex-shrink: 0;
}

.col-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.25rem 1.25rem 0.75rem;
  flex-shrink: 0;
}

.col-header h1 {
  font-size: 1.3rem;
  margin: 0;
}

.col-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0 1.25rem 2rem;
}

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

/* Col 1: History */
.history-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.toggle-group { display: flex; gap: 0.25rem; }

.toggle-btn {
  padding: 3px 9px;
  font-size: 0.72rem;
  border-radius: 5px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.toggle-btn.active {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}

/* Col 2: Transactions */
.tx-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.tx-col-header {
  flex-direction: column;
  align-items: stretch;
  gap: 0;
  padding-bottom: 0;
  border-bottom: 1px solid var(--border);
}

.tx-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.tx-title-row h1 {
  font-size: 1.3rem;
  margin: 0;
}

.tab-bar {
  display: flex;
}

.tab-btn {
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-secondary);
  font-size: 0.88rem;
  font-weight: 600;
  padding: 0.5rem 1rem 0.6rem;
  cursor: pointer;
  margin-bottom: -1px;
  transition: color 0.15s, border-color 0.15s;
}

.tab-btn.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}

.filters {
  display: flex;
  gap: 0.5rem;
  margin: 0.75rem 0 1rem;
}

.filter-input { flex: 1; }
.filter-select { width: 120px; }

.page-loader { min-height: 0; padding: 2rem; }

.tx-list { display: flex; flex-direction: column; }

.tx-row {
  display: flex;
  align-items: center;
  padding: 0.7rem 0;
  border-bottom: 1px solid var(--border);
  gap: 0.5rem;
  cursor: pointer;
  transition: background 0.15s;
}

.tx-row:active { background: rgba(255,255,255,0.03); }

.tx-left { flex: 0 0 90px; }
.tx-ticker { font-weight: 600; display: block; font-size: 0.9rem; }
.tx-date { font-size: 0.72rem; }
.tx-mid { flex: 1; font-size: 0.8rem; min-width: 0; }
.tx-right { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex-shrink: 0; }
.total { font-size: 0.85rem; font-weight: 500; }
.edit-hint { font-size: 0.7rem; flex-shrink: 0; margin-left: 2px; }
.count { margin-top: 0.75rem; font-size: 0.8rem; text-align: center; }

.gains-filter { margin: 0.75rem 0 1rem; }
.year-section { margin-bottom: 1.5rem; }

.year-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.65rem 0.85rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  margin-bottom: 0.25rem;
  flex-wrap: wrap;
}

.year-label { font-size: 1rem; font-weight: 700; }
.year-totals { display: flex; gap: 1rem; flex-wrap: wrap; }

.year-stat {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
  font-size: 0.78rem;
}

.year-stat .text-muted {
  font-size: 0.66rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.net-highlight { font-size: 0.88rem; font-weight: 700; }

.gain-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 0;
  border-bottom: 1px solid var(--border);
}

.gain-row-div { opacity: 0.8; }

.gain-mid {
  flex: 1;
  font-size: 0.75rem;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gain-right { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; flex-shrink: 0; }
.gross-gain { font-size: 0.88rem; font-weight: 600; }
.net-gain { font-size: 0.73rem; }

/* Col 3: Alerts */
.alerts-col {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.push-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 0.9rem 1rem;
  margin-bottom: 1.25rem;
}

.push-info { display: flex; align-items: center; gap: 0.75rem; }
.push-info > i { font-size: 1.3rem; color: var(--accent); }
.push-title { font-weight: 600; font-size: 0.92rem; }
.push-sub { font-size: 0.78rem; }

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
  gap: 0.6rem;
  flex: 1;
  cursor: pointer;
  flex-wrap: wrap;
  min-width: 0;
}

.al-ticker { font-weight: 700; font-size: 0.9rem; }

.cond {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.82rem;
  color: var(--text-secondary);
}

.cond i { font-size: 0.72rem; }
.triggered-tag { font-size: 0.68rem; color: var(--green); }
.alert-actions { display: flex; align-items: center; gap: 0.25rem; flex-shrink: 0; }
</style>
