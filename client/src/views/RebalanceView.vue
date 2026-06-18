<script setup>
import {computed, onMounted, ref, watch} from 'vue'
import {usePortfolioStore} from '@/stores/portfolio'
import {gainLossClass, useCurrency, useTickerCurrency} from '@/composables/useFormat'
import {useRouter} from 'vue-router'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'

const router = useRouter()
const portfolio = usePortfolioStore()

// User-editable target allocations (0–100 per ticker)
const targets = ref({})
const totalCash = ref(null) // extra cash to deploy (optional)

onMounted(async () => {
  if (!portfolio.positions.length) await portfolio.fetchPortfolio()
  initTargets()
})

// Initialise targets to the current actual allocation % (rounded to 1 decimal)
function initTargets() {
  const total = portfolio.positions.reduce((s, p) => s + (p.valueUsd ?? p.value), 0)
  for (const p of portfolio.positions) {
    const pct = total > 0 ? ((p.valueUsd ?? p.value) / total) * 100 : 0
    targets.value[p.ticker] = parseFloat(pct.toFixed(1))
  }
}

// Combined portfolio value in USD (server already gives valueUsd per position)
const portfolioValueUsd = computed(() =>
    portfolio.positions.reduce((s, p) => s + (p.valueUsd ?? p.value), 0)
)

// Total target % — must sum to 100 to be valid
const targetSum = computed(() => Object.values(targets.value).reduce((s, v) => s + (v || 0), 0))
const targetSumOk = computed(() => Math.abs(targetSum.value - 100) < 0.05)

// Total portfolio including any extra cash to deploy
const totalValue = computed(() => portfolioValueUsd.value + (totalCash.value || 0))

// Rebalancing actions
const actions = computed(() => {
  if (!portfolio.positions.length) return []
  return portfolio.positions.map((p) => {
    const target = targets.value[p.ticker] || 0
    const targetValueUsd = (target / 100) * totalValue.value
    const currentValueUsd = p.valueUsd ?? p.value
    const diffUsd = targetValueUsd - currentValueUsd

    // Shares delta: diff / current price (in USD)
    const priceUsd = p.currency === 'ILS' && portfolio.combinedUsd?.ilsToUsd
        ? p.currentPrice * portfolio.combinedUsd.ilsToUsd
        : p.currentPrice

    const sharesDelta = priceUsd > 0 ? diffUsd / priceUsd : 0

    return {
      ticker: p.ticker,
      companyName: p.companyName,
      currency: p.currency,
      currentPrice: p.currentPrice,
      currentValueUsd,
      currentPct: portfolioValueUsd.value > 0 ? (currentValueUsd / portfolioValueUsd.value) * 100 : 0,
      targetPct: target,
      targetValueUsd,
      diffUsd,
      sharesDelta,
      action: Math.abs(sharesDelta) < 0.0001 ? 'hold' : sharesDelta > 0 ? 'buy' : 'sell',
    }
  }).sort((a, b) => Math.abs(b.diffUsd) - Math.abs(a.diffUsd))
})

// Remaining unallocated %
const unallocated = computed(() => Math.max(0, 100 - targetSum.value))

function setEqualWeights() {
  const n = portfolio.positions.length
  if (!n) return
  const each = parseFloat((100 / n).toFixed(1))
  for (const p of portfolio.positions) targets.value[p.ticker] = each
  // fix rounding: add remainder to first ticker
  const diff = parseFloat((100 - each * n).toFixed(1))
  if (diff && portfolio.positions[0]) {
    targets.value[portfolio.positions[0].ticker] = parseFloat((each + diff).toFixed(1))
  }
}

function resetToCurrent() {
  initTargets()
}

function formatShares(n) {
  if (!Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  return (n >= 0 ? '+' : '') + (abs >= 1 ? abs.toFixed(2) : abs.toFixed(4))
}
</script>

<template>
  <div class="rebalance safe-bottom">
    <header class="page-header">
      <Button icon="pi pi-arrow-left" rounded text @click="router.push('/holdings')"/>
      <h1 class="gradient-title">Rebalance</h1>
      <div/>
    </header>

    <div v-if="portfolio.loading" class="page-loader">
      <span class="text-muted">Loading…</span>
    </div>

    <template v-else-if="portfolio.positions.length">
      <!-- Context -->
      <div class="context-card">
        <div class="ctx-row">
          <span class="text-muted">Portfolio value</span>
          <span>{{ useCurrency(portfolioValueUsd, 'USD') }}</span>
        </div>
        <div class="ctx-row">
          <span class="text-muted">Extra cash to deploy</span>
          <InputNumber
              v-model="totalCash"
              :max-fraction-digits="2"
              :min="0"
              currency="USD"
              fluid
              mode="currency"
              placeholder="$0"
              size="small"
          />
        </div>
      </div>

      <!-- Target allocation sliders -->
      <section class="alloc-section">
        <div class="section-head">
          <h2 class="section-title">Target Allocations</h2>
          <div class="section-actions">
            <button class="action-link" @click="setEqualWeights">Equal weight</button>
            <button class="action-link" @click="resetToCurrent">Reset</button>
          </div>
        </div>

        <div class="alloc-list">
          <div v-for="p in portfolio.positions" :key="p.ticker" class="alloc-row">
            <div class="alloc-info">
              <span class="alloc-ticker">{{ p.ticker }}</span>
              <span class="alloc-name text-muted">{{ p.companyName }}</span>
            </div>
            <div class="alloc-input-wrap">
              <InputNumber
                  v-model="targets[p.ticker]"
                  :max="100"
                  :max-fraction-digits="1"
                  :min="0"
                  :step="0.5"
                  fluid
                  size="small"
                  suffix="%"
              />
            </div>
          </div>
        </div>

        <div :class="{ error: !targetSumOk && targetSum > 0 }" class="sum-row">
          <span>Total allocated: <strong>{{ targetSum.toFixed(1) }}%</strong></span>
          <span v-if="unallocated > 0.01" class="text-muted">{{ unallocated.toFixed(1) }}% unallocated</span>
          <span v-if="!targetSumOk && targetSum > 0" class="err-msg">Must sum to 100%</span>
        </div>
      </section>

      <!-- Action plan -->
      <section v-if="targetSumOk" class="plan-section">
        <h2 class="section-title">Action Plan</h2>
        <div class="plan-list">
          <div v-for="a in actions" :key="a.ticker" class="plan-row">
            <div class="plan-left">
              <span class="plan-ticker">{{ a.ticker }}</span>
              <span class="plan-name text-muted">{{ a.companyName }}</span>
            </div>

            <div class="plan-center text-muted">
              <span>{{ a.currentPct.toFixed(1) }}%</span>
              <i class="pi pi-arrow-right" style="font-size:0.65rem"/>
              <span>{{ a.targetPct.toFixed(1) }}%</span>
            </div>

            <div class="plan-right">
              <span
                  :class="a.action === 'buy' ? 'gain' : a.action === 'sell' ? 'loss' : 'text-muted'"
                  class="plan-action"
              >
                <template v-if="a.action === 'hold'">Hold</template>
                <template v-else>
                  {{ a.action === 'buy' ? 'Buy' : 'Sell' }}
                  {{ formatShares(Math.abs(a.sharesDelta)) }} sh
                </template>
              </span>
              <span :class="gainLossClass(a.diffUsd)" class="plan-usd">
                {{ a.diffUsd >= 0 ? '+' : '' }}{{ useCurrency(a.diffUsd, 'USD') }}
              </span>
            </div>
          </div>
        </div>

        <div class="plan-note text-muted">
          Prices are live quotes. Share counts are estimates — verify before trading.
        </div>
      </section>
    </template>

    <div v-else class="empty">
      <i class="pi pi-briefcase"/>
      <p class="text-muted">No holdings to rebalance</p>
      <Button label="Add Transaction" @click="router.push('/holdings')"/>
    </div>
  </div>
</template>

<style scoped>
.rebalance {
  padding: 0.5rem 1rem 2rem;
}

@media (min-width: 768px) {
  .rebalance {
    padding: 1.5rem;
    max-width: 760px;
  }
}

.page-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1.25rem;
}

.page-header h1 {
  flex: 1;
  font-size: 1.5rem;
  text-align: center;
}

.page-loader {
  display: flex;
  justify-content: center;
  padding: 3rem;
}

/* Context card */
.context-card {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 0.9rem 1rem;
  margin-bottom: 1.25rem;
}

.ctx-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.88rem;
}

.ctx-row :deep(.p-inputnumber) {
  max-width: 140px;
}

/* Allocation section */
.alloc-section {
  margin-bottom: 1.5rem;
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.section-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0;
}

.section-actions {
  display: flex;
  gap: 0.75rem;
}

.action-link {
  background: none;
  border: none;
  color: var(--accent);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
}

.alloc-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.alloc-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--border);
}

.alloc-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.alloc-ticker {
  font-weight: 700;
  font-size: 0.92rem;
}

.alloc-name {
  font-size: 0.75rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.alloc-input-wrap {
  width: 100px;
  flex-shrink: 0;
}

.sum-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-top: 0.75rem;
  font-size: 0.85rem;
  padding: 0.5rem 0.75rem;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
}

.sum-row.error {
  background: rgba(239, 68, 68, 0.08);
}

.err-msg {
  color: var(--neon-red, #ef4444);
  font-size: 0.8rem;
}

/* Plan section */
.plan-section {
  margin-bottom: 1.5rem;
}

.plan-list {
  margin-top: 0.75rem;
  display: flex;
  flex-direction: column;
}

.plan-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--border);
}

.plan-left {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.plan-ticker {
  font-weight: 700;
  font-size: 0.9rem;
}

.plan-name {
  font-size: 0.72rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plan-center {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.75rem;
  flex-shrink: 0;
  width: 90px;
  justify-content: center;
}

.plan-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  flex-shrink: 0;
  min-width: 100px;
}

.plan-action {
  font-size: 0.85rem;
  font-weight: 600;
}

.plan-usd {
  font-size: 0.78rem;
}

.plan-note {
  margin-top: 0.85rem;
  font-size: 0.75rem;
  text-align: center;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 3rem 1rem;
  color: var(--text-secondary);
}

.empty i {
  font-size: 3rem;
}
</style>
