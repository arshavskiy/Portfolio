<script setup>
import {computed, onMounted, ref, watch} from 'vue'
import {useToast} from 'primevue/usetoast'
import {useConfirm} from 'primevue/useconfirm'
import {useStorage} from '@vueuse/core'
import {usePortfolioStore} from '@/stores/portfolio'
import {useHistoryStore} from '@/stores/history'
import {useChartRange} from '@/composables/useChartRange'
import Button from 'primevue/button'
import AddTransactionModal from '@/components/ui/AddTransactionModal.vue'
import PositionCard from '@/components/ui/PositionCard.vue'

const toast = useToast()
const confirm = useConfirm()
const portfolio = usePortfolioStore()
const historyStore = useHistoryStore()
const range = useChartRange()
const showModal = ref(false)
const sparklines = ref({})
const groupByMarket = useStorage('holdings-group-market', false)
const compactMode = useStorage('holdings-compact', false)

function marketOf(ticker) {
  return ticker.toUpperCase().endsWith('.TA') ? 'TASE' : 'US'
}

const grouped = computed(() => {
  if (!groupByMarket.value) return [{market: null, items: portfolio.positions}]
  const map = {}
  for (const pos of portfolio.positions) {
    const m = marketOf(pos.ticker)
    ;(map[m] ||= []).push(pos)
  }
  return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([market, items]) => ({market, items}))
})

onMounted(async () => {
  try {
    await portfolio.fetchPortfolio()
    await fetchSparklines()
  } catch {}
})

async function fetchSparklines() {
  const entries = await Promise.all(portfolio.positions.map(async (pos) => {
    try {
      return [pos.ticker, await historyStore.fetchHistory(pos.ticker, range.value)]
    } catch {
      return null
    }
  }))
  sparklines.value = Object.fromEntries(entries.filter(Boolean))
}

watch(range, fetchSparklines)

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
      <div class="header-actions">
        <button
            :class="{ active: compactMode }"
            class="market-btn"
            title="Compact view"
            @click="compactMode = !compactMode"
        >
          <i class="pi pi-list"/>
        </button>
        <button
            class="market-btn"
            :class="{ active: groupByMarket }"
            title="Group by market"
            @click="groupByMarket = !groupByMarket"
        >
          <i class="pi pi-globe"/>
        </button>
        <Button icon="pi pi-plus" label="Add" size="small" @click="showModal = true"/>
      </div>
    </header>

    <div v-if="portfolio.loading" class="loading text-muted">Loading...</div>

    <div v-else-if="!portfolio.positions.length" class="empty">
      <i class="pi pi-briefcase" />
      <p>No holdings yet</p>
      <Button label="Add Transaction" @click="showModal = true" />
    </div>

    <div v-else :class="compactMode ? 'positions-compact' : 'positions-list'">
      <template v-for="group in grouped" :key="group.market">
        <div v-if="group.market" class="market-header">{{ group.market }}</div>
        <PositionCard
          v-for="pos in group.items"
          :key="pos.ticker"
          :compact="compactMode"
          :pos="pos"
          :sparkline="sparklines[pos.ticker]"
          @delete="confirmDelete"
        />
      </template>
    </div>

    <AddTransactionModal v-model:visible="showModal" />
  </div>
</template>

<style scoped>
.holdings { padding: 1rem; }

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.page-header h1 {
  font-size: 1.5rem;
  font-weight: 700;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.market-btn {
  background: none;
  border: 1px solid var(--border);
  color: var(--text-secondary);
  border-radius: 8px;
  padding: 5px 9px;
  cursor: pointer;
  font-size: 0.85rem;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.market-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.market-header {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-secondary);
  padding: 0.6rem 0.25rem 0.3rem;
  border-bottom: 1px solid var(--border);
  margin-bottom: 0.5rem;
}

.empty { display: flex; flex-direction: column; align-items: center; gap: 1rem; padding: 3rem 1rem; color: var(--text-secondary); }
.empty i { font-size: 3rem; }

.positions-list { display: flex; flex-direction: column; gap: 0.75rem; }

.positions-compact {
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--border);
}
</style>
