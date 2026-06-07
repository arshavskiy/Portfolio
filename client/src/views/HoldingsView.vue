<script setup>
import {computed, onMounted, ref, watch} from 'vue'
import {useToast} from 'primevue/usetoast'
import {useConfirm} from 'primevue/useconfirm'
import {useStorage} from '@vueuse/core'
import {usePortfolioStore} from '@/stores/portfolio'
import {useHistoryStore} from '@/stores/history'
import {useAlertsStore} from '@/stores/alerts'
import {useChartRange} from '@/composables/useChartRange'
import {groupItems} from '@/composables/useGrouping'
import Button from 'primevue/button'
import AddTransactionModal from '@/components/ui/AddTransactionModal.vue'
import PositionCard from '@/components/ui/PositionCard.vue'
import GroupEditModal from '@/components/ui/GroupEditModal.vue'
import ImportModal from '@/components/ui/ImportModal.vue'
import RangeBar from '@/components/ui/RangeBar.vue'
import GroupModeBar from '@/components/ui/GroupModeBar.vue'
import TotalsGrid from '@/components/charts/TotalsGrid.vue'

const toast = useToast()
const confirm = useConfirm()
const portfolio = usePortfolioStore()
const historyStore = useHistoryStore()
const alerts = useAlertsStore()
const range = useChartRange()
const showModal = ref(false)
const sparklines = ref({})
const groupMode = useStorage('holdings-group-mode', 'sector')
const compactMode = useStorage('holdings-compact', true)

const grouped = computed(() => groupItems(portfolio.positions, groupMode.value))

onMounted(async () => {
  try {
    alerts.fetchAlerts()
    await portfolio.fetchPortfolio()
    await fetchSparklines()
  } catch {
  }
})

async function fetchSparklines() {
  const entries = await Promise.all(portfolio.positions.map(async (pos) => {
    try {
      return [pos.ticker, await historyStore.fetchHistory(pos.ticker, range.value, 40)]
    } catch {
      return null
    }
  }))
  sparklines.value = Object.fromEntries(entries.filter(Boolean))
}

watch(range, fetchSparklines)

const showImportModal = ref(false)

async function onImported() {
  await portfolio.fetchPortfolio()
  await fetchSparklines()
}

const groupPos = ref(null)
const showGroupModal = ref(false)

function openGroups(pos) {
  groupPos.value = pos
  showGroupModal.value = true
}

async function onGroupsSaved() {
  await portfolio.fetchPortfolio()
}

// addTransaction() already refreshes the portfolio store; just resync sparklines
// since positions may have appeared/disappeared.
async function onTransactionDone() {
  await fetchSparklines()
}
</script>

<template>
  <div class="holdings">
    <header class="page-header">
      <h1 class="gradient-title">Holdings</h1>
      <div class="header-actions">
        <Button
            v-tooltip.bottom="compactMode ? 'Card view' : 'Compact view'"
            :icon="compactMode ? 'pi pi-bars' : 'pi pi-list'"
            :outlined="compactMode"
            size="small"
            text
            @click="compactMode = !compactMode"
        />
        <Button
            v-tooltip.bottom="'Import from file'"
            icon="pi pi-upload"
            size="small"
            text
            @click="showImportModal = true"
        />
        <Button label="Add" outlined size="small" @click="showModal = true"/>
      </div>
    </header>

    <TotalsGrid :totals="portfolio.totals" :combined-usd="portfolio.combinedUsd" />


    <RangeBar class="page-range"/>
    <GroupModeBar v-model="groupMode" class="page-group-mode" />

    <div v-if="portfolio.loading" class="loading text-muted">Loading...</div>

    <div v-else-if="!portfolio.positions.length" class="empty">
      <i class="pi pi-briefcase"/>
      <p>No holdings yet</p>
      <Button label="Add Transaction" @click="showModal = true"/>
    </div>

    <div v-else :class="compactMode ? 'positions-compact' : 'positions-list'">
      <template v-for="section in grouped" :key="section.group ?? '_all'">
        <div v-if="section.group" class="market-header">{{ section.group }}</div>
        <PositionCard
            v-for="pos in section.items"
            :key="`${section.group ?? ''}-${pos.ticker}`"
            :pos="pos"
            :sparkline="sparklines[pos.ticker]"
            :compact="compactMode"
            @edit-groups="openGroups"
        />
      </template>
    </div>

    <AddTransactionModal v-model:visible="showModal" @hide="onTransactionDone"/>
    <GroupEditModal
        v-model:visible="showGroupModal"
        :item="groupPos"
        @saved="onGroupsSaved"
    />
    <ImportModal v-model:visible="showImportModal" mode="holdings" @imported="onImported"/>
  </div>
</template>

<style scoped>
.holdings {
  padding: 1rem;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.page-header h1 {
  font-size: 1.5rem;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.market-header {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: transparent;
  background: linear-gradient(90deg, var(--neon-blue), #7dd3fc 45%, var(--neon-green));
  -webkit-background-clip: text;
  background-clip: text;
  padding: 0.6rem 0.25rem 0.3rem;
  border-bottom: 1px solid rgba(0, 207, 255, 0.18);
  margin-bottom: 0.5rem;
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

.positions-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.positions-compact {
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--border);
}

/* Tile full cards into columns on wider screens (compact stays single-column). */
@media (min-width: 768px) {
  .positions-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 0.75rem;
    align-items: start;
  }

  /* group headers should span the full grid row */
  .positions-list > .market-header {
    grid-column: 1 / -1;
  }
}

.toggle-group {
  display: flex;
  gap: 0.25rem;
}

.toggle-btn {
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}

.toggle-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

@media (min-width: 768px) {
  .holdings {
    padding: 1.5rem;
  }
}

@media (min-width: 1280px) {
  .holdings {
    padding: 2rem;
  }
}

.page-range {
  margin-bottom: 1rem;
}

.page-group-mode {
  margin-bottom: 1rem;
}
</style>
