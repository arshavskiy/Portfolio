<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { usePortfolioStore } from '@/stores/portfolio'
import { useHistoryStore } from '@/stores/history'
import { useTickerCurrency, useCurrency, usePercent, gainLossClass } from '@/composables/useFormat'
import Button from 'primevue/button'
import SparklineChart from '@/components/charts/SparklineChart.vue'
import AddTransactionModal from '@/components/ui/AddTransactionModal.vue'

const router = useRouter()
const toast = useToast()
const confirm = useConfirm()
const portfolio = usePortfolioStore()
const historyStore = useHistoryStore()
const showModal = ref(false)
const sparklines = ref({})

onMounted(async () => {
  try {
    await portfolio.fetchPortfolio()
    await fetchSparklines()
  } catch {}
})

async function fetchSparklines() {
  const entries = await Promise.all(portfolio.positions.map(async (pos) => {
    try {
      return [pos.ticker, await historyStore.fetchHistory(pos.ticker, '1mo')]
    } catch {
      return null
    }
  }))

  sparklines.value = Object.fromEntries(entries.filter(Boolean))
}

function confirmDelete(pos) {
  confirm.require({
    message: `Remove ${pos.ticker} from your portfolio?`,
    header: 'Confirm',
    icon: 'pi pi-exclamation-triangle',
    acceptClass: 'p-button-danger',
    accept: async () => {
      await portfolio.deletePosition(pos._id)
      toast.add({ severity: 'success', summary: 'Removed', life: 2000 })
    },
  })
}
</script>

<template>
  <div class="holdings">
    <header class="page-header">
      <h1 class="gradient-title">Holdings</h1>
      <Button icon="pi pi-plus" label="Add" size="small" @click="showModal = true" />
    </header>

    <div v-if="portfolio.loading" class="loading text-muted">Loading...</div>

    <div v-else-if="!portfolio.positions.length" class="empty">
      <i class="pi pi-briefcase" />
      <p>No holdings yet</p>
      <Button label="Add Transaction" @click="showModal = true" />
    </div>

    <div v-else class="positions-list">
      <div
        v-for="pos in portfolio.positions"
        :key="pos.ticker"
        class="position-card"
        :class="pos.pnl >= 0 ? 'neon-card-gain' : 'neon-card-loss'"
      >
        <div class="pos-top" @click="router.push(`/stock/${pos.ticker}`)">
          <div>
            <span class="ticker">{{ pos.ticker }}</span>
            <span class="company text-muted">{{ pos.companyName }}</span>
          </div>
          <div class="pos-value">
            <span class="value">{{ useTickerCurrency(pos.value, pos.ticker) }}</span>
            <span :class="gainLossClass(pos.pnl)" class="pnl">
              {{ useTickerCurrency(pos.pnl, pos.ticker) }} ({{ usePercent(pos.pnlPercent) }})
            </span>
          </div>
        </div>

        <!-- Sparkline -->
        <SparklineChart
          v-if="sparklines[pos.ticker]?.length"
          :data="sparklines[pos.ticker]"
          :pnl-percent="pos.pnlPercent"
          class="pos-spark"
        />

        <div class="pos-details">
          <div class="detail">
            <span class="text-muted">Shares</span>
            <span>{{ pos.shares }}</span>
          </div>
          <div class="detail">
            <span class="text-muted">Avg Cost</span>
            <span>{{ useTickerCurrency(pos.avgCost, pos.ticker) }}</span>
          </div>
          <div class="detail">
            <span class="text-muted">Current</span>
            <span>{{ useTickerCurrency(pos.currentPrice, pos.ticker) }}</span>
          </div>
          <Button
            icon="pi pi-list"
            severity="secondary"
            text
            size="small"
            v-tooltip="'View lots'"
            @click="router.push(`/position/${encodeURIComponent(pos.ticker)}`)"
          />
          <Button
            icon="pi pi-trash"
            severity="danger"
            text
            size="small"
            @click="confirmDelete(pos)"
          />
        </div>
      </div>
    </div>

    <AddTransactionModal v-model:visible="showModal" />
  </div>
</template>

<style scoped>
.holdings { padding: 1rem; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
.page-header h1 { font-size: 1.5rem; font-weight: 700; }

.empty { display: flex; flex-direction: column; align-items: center; gap: 1rem; padding: 3rem 1rem; color: var(--text-secondary); }
.empty i { font-size: 3rem; }

.positions-list { display: flex; flex-direction: column; gap: 0.75rem; }
.position-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
.position-card.neon-card-gain { min-height: 173px; }
.pos-top { display: flex; justify-content: space-between; align-items: flex-start; padding: 1rem; cursor: pointer; }
.pos-spark { margin: 0 -1px; width: calc(100% + 2px); height: 50px; }
.ticker { font-weight: 700; font-size: 1.1rem; display: block; }
.company { font-size: 0.8rem; }
.pos-value { text-align: right; }
.value { display: block; font-weight: 600; }
.pnl { font-size: 0.8rem; }
.pos-details { display: flex; align-items: center; padding: 0.6rem 1rem; background: rgba(255,255,255,0.03); border-top: 1px solid var(--border); gap: 1rem; }
.detail { display: flex; flex-direction: column; gap: 2px; font-size: 0.8rem; flex: 1; }
.detail .text-muted { font-size: 0.72rem; }
</style>
