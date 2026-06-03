<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { useTickerCurrency, gainLossClass } from '@/composables/useFormat'
import { useFeeProfileStore } from '@/stores/feeProfiles'
import api from '@/composables/useApi'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import AddTransactionModal from '@/components/ui/AddTransactionModal.vue'
import EditTransactionModal from '@/components/ui/EditTransactionModal.vue'

const route = useRoute()
const router = useRouter()
const toast = useToast()

const ticker = decodeURIComponent(route.params.ticker).toUpperCase()
const transactions = ref([])
const currentPrice = ref(null)
const loading = ref(false)
const showModal = ref(false)
const showSimulator = ref(false)
const editingTx = ref(null)
const simPrice = ref(null)
const simFeeProfileId = ref(null)
const feeStore = useFeeProfileStore()

onMounted(async () => {
  await fetchLots()
  await fetchQuote()
  feeStore.fetchProfiles()
})

// Pre-fill sim price with current price once loaded
watch(currentPrice, (p) => { if (p && !simPrice.value) simPrice.value = p })
// Pre-select default fee profile
watch(() => feeStore.profiles, (profiles) => {
  if (!simFeeProfileId.value) {
    const def = profiles.find(p => p.isDefault)
    if (def) simFeeProfileId.value = def._id
  }
}, { immediate: true })

async function fetchLots() {
  loading.value = true
  try {
    const data = await api.get(`/portfolio/transactions?ticker=${encodeURIComponent(ticker)}&limit=500`)
    transactions.value = data.transactions.sort((a, b) => new Date(a.date) - new Date(b.date))
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Failed to load', detail: err.message, life: 3000 })
  } finally {
    loading.value = false
  }
}

async function fetchQuote() {
  try {
    const q = await api.get(`/stocks/quote/${encodeURIComponent(ticker)}`)
    currentPrice.value = q.price
  } catch {}
}

// Running weighted average per lot
const lots = computed(() => {
  let shares = 0
  let totalCost = 0
  return transactions.value.map((tx) => {
    if (tx.type === 'buy') {
      totalCost += tx.shares * tx.price
      shares += tx.shares
    } else {
      totalCost -= (totalCost / shares) * tx.shares
      shares -= tx.shares
    }
    const avgCost = shares > 0 ? totalCost / shares : 0
    return { ...tx, runningShares: shares, runningAvg: avgCost }
  })
})

// Full summary including all fees and taxes paid
const summary = computed(() => {
  if (!lots.value.length) return null
  const last = lots.value[lots.value.length - 1]
  const shares = last.runningShares
  const avgCost = last.runningAvg
  const totalCost = shares * avgCost

  // Accumulate fees & taxes from all lots
  let totalBuyFees = 0
  let totalSellFees = 0
  let totalTax = 0
  let realizedGross = 0   // sell proceeds before fees/tax
  let realizedNet = 0     // sell proceeds after fees/tax

  for (const tx of transactions.value) {
    if (tx.type === 'buy') {
      totalBuyFees += tx.feeAmount || 0
    } else {
      totalSellFees += tx.feeAmount || 0
      totalTax += tx.taxAmount || 0
      realizedGross += tx.total || 0
      realizedNet += tx.netProceeds != null ? tx.netProceeds : (tx.total - (tx.feeAmount || 0) - (tx.taxAmount || 0))
    }
  }

  const totalFees = totalBuyFees + totalSellFees
  const currentValue = currentPrice.value != null ? shares * currentPrice.value : null

  // Gross P&L = current value - cost basis (ignores fees/tax)
  const grossPnl = currentValue != null ? currentValue - totalCost : null
  const grossPnlPct = avgCost > 0 && currentPrice.value != null
    ? ((currentPrice.value - avgCost) / avgCost) * 100 : null

  // Net P&L = gross P&L - all fees paid - all tax paid (true profit)
  const netPnl = grossPnl != null ? grossPnl - totalFees - totalTax : null
  const netPnlPct = totalCost > 0 && netPnl != null
    ? (netPnl / (totalCost + totalFees)) * 100 : null

  // Estimated future sell tax if sold at current price
  const unrealizedGain = currentValue != null ? currentValue - totalCost : null
  // Tax rate from last used fee profile (if any)
  const taxRate = transactions.value.find(t => t.feeProfile?.capitalGainsTax)?.feeProfile?.capitalGainsTax || 0
  const estimatedTax = unrealizedGain != null && unrealizedGain > 0 && taxRate > 0
    ? Math.round(unrealizedGain * taxRate / 100 * 100) / 100 : 0

  return {
    shares, avgCost, totalCost, currentValue,
    grossPnl, grossPnlPct,
    netPnl, netPnlPct,
    totalBuyFees, totalSellFees, totalFees,
    totalTax, taxRate, estimatedTax,
    realizedGross, realizedNet,
  }
})

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmt(val) {
  return val >= 0 ? '+' : ''
}

const tickerCurr = computed(() => ticker.endsWith('.TA') ? 'ILS' : 'USD')
const currSymbol = computed(() => tickerCurr.value === 'ILS' ? '₪' : '$')

const simulation = computed(() => {
  if (!simPrice.value || !summary.value) return null
  const { shares, avgCost, totalCost, totalBuyFees } = summary.value
  const sellPrice = simPrice.value
  const grossProceeds = sellPrice * shares

  // Get sell fee from selected profile
  const profile = feeStore.profiles.find(p => p._id === simFeeProfileId.value)
  let sellFee = 0
  if (profile?.sellFee?.value) {
    sellFee = profile.sellFee.type === 'percent'
      ? (grossProceeds * profile.sellFee.value) / 100
      : profile.sellFee.value
    if (profile.sellFee.minFee && sellFee < profile.sellFee.minFee)
      sellFee = profile.sellFee.minFee
    sellFee = Math.round(sellFee * 100) / 100
  }

  // Capital gains tax on profit only
  const taxRate = profile?.capitalGainsTax || 0
  const gain = grossProceeds - totalCost
  const tax = gain > 0 && taxRate > 0
    ? Math.round(gain * taxRate / 100 * 100) / 100
    : 0

  const netProceeds = grossProceeds - sellFee - tax
  // Net profit = net proceeds - original cost - buy fees already paid
  const netProfit = netProceeds - totalCost - totalBuyFees
  const netProfitPct = (totalCost + totalBuyFees) > 0
    ? (netProfit / (totalCost + totalBuyFees)) * 100 : 0

  return {
    sellPrice, shares, grossProceeds,
    sellFee, tax, taxRate,
    netProceeds, netProfit, netProfitPct,
    profileName: profile?.name || null,
  }
})
</script>

<template>
  <div class="position-detail">
    <header class="page-header">
      <Button icon="pi pi-arrow-left" text rounded @click="router.back()" />
      <div class="header-info">
        <h1>{{ ticker }}</h1>
        <span class="text-muted">Transaction Lots</span>
      </div>
      <Button icon="pi pi-plus" rounded text @click="showModal = true" />
    </header>

    <template v-if="summary">
      <!-- Gross P&L card -->
      <div class="pnl-card" :class="gainLossClass(summary.grossPnl)">
        <div class="pnl-header">
          <span class="pnl-label text-muted">Gross P&L</span>
          <span class="pnl-label text-muted">Avg {{ useTickerCurrency(summary.avgCost, ticker) }} → {{ currentPrice != null ? useTickerCurrency(currentPrice, ticker) : '…' }}</span>
        </div>
        <div class="pnl-row">
          <span class="pnl-pct" :class="gainLossClass(summary.grossPnlPct)">
            {{ summary.grossPnlPct != null ? fmt(summary.grossPnlPct) + summary.grossPnlPct.toFixed(2) + '%' : '—' }}
          </span>
          <span class="pnl-value" :class="gainLossClass(summary.grossPnl)">
            {{ summary.grossPnl != null ? fmt(summary.grossPnl) + useTickerCurrency(summary.grossPnl, ticker) : '—' }}
          </span>
        </div>
      </div>

      <!-- Net P&L card (after all fees + tax) -->
      <div v-if="summary.totalFees > 0 || summary.totalTax > 0" class="pnl-card net-card" :class="gainLossClass(summary.netPnl)">
        <div class="pnl-header">
          <span class="pnl-label text-muted">Net P&L <span class="after-badge">after fees & tax</span></span>
          <span class="pnl-label" :class="gainLossClass(summary.netPnl)">
            {{ summary.netPnl != null ? fmt(summary.netPnl) + useTickerCurrency(summary.netPnl, ticker) : '—' }}
          </span>
        </div>
        <div class="fee-breakdown">
          <div v-if="summary.totalBuyFees > 0" class="fee-row">
            <span class="text-muted">Buy fees paid</span>
            <span class="loss">-{{ useTickerCurrency(summary.totalBuyFees, ticker) }}</span>
          </div>
          <div v-if="summary.totalSellFees > 0" class="fee-row">
            <span class="text-muted">Sell fees paid</span>
            <span class="loss">-{{ useTickerCurrency(summary.totalSellFees, ticker) }}</span>
          </div>
          <div v-if="summary.totalTax > 0" class="fee-row">
            <span class="text-muted">Capital gains tax paid</span>
            <span class="loss">-{{ useTickerCurrency(summary.totalTax, ticker) }}</span>
          </div>
          <div v-if="summary.estimatedTax > 0" class="fee-row est-row">
            <span class="text-muted">Est. tax if sold now ({{ summary.taxRate }}%)</span>
            <span class="loss">-{{ useTickerCurrency(summary.estimatedTax, ticker) }}</span>
          </div>
        </div>
        <div v-if="summary.netPnlPct != null" class="net-pct" :class="gainLossClass(summary.netPnlPct)">
          {{ fmt(summary.netPnlPct) }}{{ summary.netPnlPct.toFixed(2) }}% net return
        </div>
      </div>

      <!-- Stats grid -->
      <div class="stats-row">
        <div class="stat-item">
          <span class="text-muted">Shares held</span>
          <span>{{ summary.shares.toFixed(4).replace(/\.?0+$/, '') }}</span>
        </div>
        <div class="stat-item">
          <span class="text-muted">Avg cost</span>
          <span>{{ useTickerCurrency(summary.avgCost, ticker) }}</span>
        </div>
        <div class="stat-item">
          <span class="text-muted">Total invested</span>
          <span>{{ useTickerCurrency(summary.totalCost, ticker) }}</span>
        </div>
        <div class="stat-item">
          <span class="text-muted">Current value</span>
          <span>{{ summary.currentValue != null ? useTickerCurrency(summary.currentValue, ticker) : '…' }}</span>
        </div>
      </div>
    </template>

    <!-- Sell Simulator -->
    <div class="sim-wrap">
      <button class="sim-toggle" @click="showSimulator = !showSimulator">
        <i class="pi pi-calculator" />
        Sell Simulator
        <i :class="showSimulator ? 'pi pi-chevron-up' : 'pi pi-chevron-down'" class="sim-chevron" />
      </button>

      <div v-if="showSimulator" class="sim-body">
        <div class="sim-inputs">
          <div class="sim-field">
            <label>Sell price per share</label>
            <InputNumber
              v-model="simPrice"
              mode="currency"
              :currency="tickerCurr"
              :min="0.001"
              :max-fraction-digits="4"
              fluid
            />
          </div>
          <div class="sim-field">
            <label>Fee profile</label>
            <Select
              v-model="simFeeProfileId"
              :options="[{ label: 'No fee profile', value: null }, ...feeStore.profiles.map(p => ({ label: p.name, value: p._id }))]"
              option-label="label"
              option-value="value"
              fluid
            />
          </div>
        </div>

        <div v-if="simulation" class="sim-results">
          <div class="sim-row">
            <span class="text-muted">Gross proceeds</span>
            <span>{{ currSymbol }}{{ simulation.grossProceeds.toFixed(2) }}</span>
          </div>
          <div v-if="simulation.sellFee > 0" class="sim-row">
            <span class="text-muted">Sell fee{{ simulation.profileName ? ` · ${simulation.profileName}` : '' }}</span>
            <span class="loss">-{{ currSymbol }}{{ simulation.sellFee.toFixed(2) }}</span>
          </div>
          <div v-if="simulation.tax > 0" class="sim-row">
            <span class="text-muted">Capital gains tax ({{ simulation.taxRate }}%)</span>
            <span class="loss">-{{ currSymbol }}{{ simulation.tax.toFixed(2) }}</span>
          </div>
          <div class="sim-row sim-divider">
            <span>Net proceeds</span>
            <span class="sim-net">{{ currSymbol }}{{ simulation.netProceeds.toFixed(2) }}</span>
          </div>
          <div class="sim-row sim-profit" :class="gainLossClass(simulation.netProfit)">
            <span>Net profit / loss</span>
            <div class="sim-profit-right">
              <span class="sim-profit-pct">{{ fmt(simulation.netProfitPct) }}{{ simulation.netProfitPct.toFixed(2) }}%</span>
              <span>{{ fmt(simulation.netProfit) }}{{ currSymbol }}{{ Math.abs(simulation.netProfit).toFixed(2) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="loading" class="text-muted loading">Loading...</div>

    <div v-else-if="!lots.length" class="empty">
      <i class="pi pi-list" />
      <p class="text-muted">No transactions yet</p>
      <Button label="Add Transaction" @click="showModal = true" />
    </div>

    <div v-else class="lots-list">
      <h2 class="section-title">Lots</h2>
      <div v-for="lot in lots" :key="lot._id" class="lot-row">
        <div class="lot-left">
          <div class="lot-top">
            <Tag :value="lot.type.toUpperCase()" :severity="lot.type === 'buy' ? 'success' : 'danger'" class="lot-tag" />
            <span class="lot-date text-muted">{{ formatDate(lot.date) }}</span>
          </div>
          <div class="lot-detail">
            {{ lot.shares }} shares @ {{ useTickerCurrency(lot.price, ticker) }}
          </div>
          <!-- Buy fee -->
          <div v-if="lot.type === 'buy' && lot.feeAmount" class="lot-extra loss">
            <i class="pi pi-percentage" /> Buy fee: {{ useTickerCurrency(lot.feeAmount, ticker) }}
            <span v-if="lot.feeProfile?.name" class="text-muted"> · {{ lot.feeProfile.name }}</span>
          </div>
          <!-- Sell fee -->
          <div v-if="lot.type === 'sell' && lot.feeAmount" class="lot-extra loss">
            <i class="pi pi-percentage" /> Sell fee: {{ useTickerCurrency(lot.feeAmount, ticker) }}
            <span v-if="lot.feeProfile?.name" class="text-muted"> · {{ lot.feeProfile.name }}</span>
          </div>
          <!-- Tax -->
          <div v-if="lot.taxAmount" class="lot-extra loss">
            <i class="pi pi-building-columns" /> Tax ({{ lot.feeProfile?.capitalGainsTax }}%): {{ useTickerCurrency(lot.taxAmount, ticker) }}
          </div>
          <!-- Net proceeds -->
          <div v-if="lot.type === 'sell'" class="lot-extra gain">
            <i class="pi pi-wallet" /> Net proceeds: {{ useTickerCurrency(lot.netProceeds ?? (lot.total - (lot.feeAmount||0) - (lot.taxAmount||0)), ticker) }}
          </div>
          <div v-if="lot.notes" class="lot-notes text-muted">{{ lot.notes }}</div>
        </div>
        <div class="lot-right">
          <span class="lot-total">{{ useTickerCurrency(lot.total, ticker) }}</span>
          <span class="lot-avg text-muted">Avg → {{ useTickerCurrency(lot.runningAvg, ticker) }}</span>
          <span class="lot-shares text-muted">{{ lot.runningShares.toFixed(2) }} held</span>
          <Button icon="pi pi-pencil" text rounded size="small" class="lot-edit-btn" @click.stop="editingTx = lot" />
        </div>
      </div>
    </div>

    <AddTransactionModal
      v-model:visible="showModal"
      :default-ticker="ticker"
      @hide="fetchLots"
    />

    <EditTransactionModal
      :visible="!!editingTx"
      :transaction="editingTx"
      @update:visible="v => { if (!v) editingTx = null }"
      @saved="fetchLots"
    />
  </div>
</template>

<style scoped>
.position-detail { padding: 0.5rem 1rem 2rem; }
.page-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1.25rem; }
.header-info { flex: 1; }
.header-info h1 { font-size: 1.3rem; font-weight: 700; line-height: 1; }
.header-info span { font-size: 0.82rem; }

.pnl-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 1rem 1.25rem;
  margin-bottom: 0.75rem;
}
.pnl-card.gain { border-color: rgba(34,197,94,0.3); }
.pnl-card.loss { border-color: rgba(239,68,68,0.3); }
.net-card { background: rgba(255,255,255,0.02); }

.pnl-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; font-size: 0.82rem; }
.pnl-label { font-size: 0.82rem; }
.after-badge { background: rgba(59,130,246,0.15); color: var(--accent); border-radius: 4px; padding: 1px 6px; font-size: 0.7rem; margin-left: 4px; }

.pnl-row { display: flex; justify-content: space-between; align-items: center; }
.pnl-pct { font-size: 1.8rem; font-weight: 700; }
.pnl-value { font-size: 1.1rem; font-weight: 600; }

.fee-breakdown { display: flex; flex-direction: column; gap: 4px; margin: 0.75rem 0 0.5rem; border-top: 1px solid var(--border); padding-top: 0.5rem; }
.fee-row { display: flex; justify-content: space-between; font-size: 0.82rem; }
.est-row { border-top: 1px dashed var(--border); padding-top: 4px; margin-top: 2px; }
.net-pct { font-size: 0.9rem; font-weight: 600; text-align: right; margin-top: 0.5rem; }

.stats-row {
  display: grid; grid-template-columns: 1fr 1fr;
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 12px; overflow: hidden; margin-bottom: 1.5rem;
}
.stat-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 0.7rem 1rem; border-bottom: 1px solid var(--border); font-size: 0.85rem;
}
.stat-item:nth-last-child(-n+2) { border-bottom: none; }
.stat-item .text-muted { font-size: 0.78rem; }

.sim-wrap { margin-bottom: 1.5rem; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
.sim-toggle { width: 100%; display: flex; align-items: center; gap: 0.5rem; padding: 0.85rem 1rem; background: var(--bg-card); border: none; color: var(--text-primary); font-size: 0.9rem; font-weight: 600; cursor: pointer; }
.sim-toggle i:first-child { color: var(--accent); }
.sim-chevron { margin-left: auto; color: var(--text-secondary); font-size: 0.75rem; }
.sim-body { padding: 1rem; background: var(--bg-card); border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 1rem; }
.sim-inputs { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
.sim-field { display: flex; flex-direction: column; gap: 0.4rem; }
.sim-field label { font-size: 0.8rem; color: var(--text-secondary); }
.sim-results { display: flex; flex-direction: column; gap: 6px; background: rgba(255,255,255,0.03); border-radius: 8px; padding: 0.75rem; }
.sim-row { display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; }
.sim-divider { border-top: 1px solid var(--border); padding-top: 8px; margin-top: 2px; font-weight: 600; }
.sim-net { font-size: 1rem; font-weight: 700; }
.sim-profit { border-top: 1px solid var(--border); padding-top: 8px; margin-top: 2px; font-weight: 700; }
.sim-profit-right { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; }
.sim-profit-pct { font-size: 1.2rem; }

.loading { padding: 1rem 0; }
.empty { display: flex; flex-direction: column; align-items: center; gap: 1rem; padding: 3rem 1rem; }
.empty i { font-size: 3rem; color: var(--text-secondary); }

.section-title { font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; }
.lots-list { display: flex; flex-direction: column; }
.lot-row { display: flex; justify-content: space-between; align-items: flex-start; padding: 0.85rem 0; border-bottom: 1px solid var(--border); gap: 0.5rem; }
.lot-left { flex: 1; display: flex; flex-direction: column; gap: 3px; }
.lot-top { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 2px; }
.lot-tag { font-size: 0.7rem; }
.lot-date { font-size: 0.78rem; }
.lot-detail { font-size: 0.88rem; }
.lot-extra { font-size: 0.75rem; display: flex; align-items: center; gap: 4px; }
.lot-extra i { font-size: 0.65rem; }
.lot-notes { font-size: 0.78rem; font-style: italic; color: var(--text-secondary); }
.lot-right { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.lot-total { font-weight: 600; font-size: 0.95rem; }
.lot-avg { font-size: 0.75rem; }
.lot-shares { font-size: 0.75rem; }
.lot-edit-btn { margin-top: 2px; opacity: 0.6; }
</style>
