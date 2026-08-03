<script setup>
import {computed, defineAsyncComponent, onMounted, onUnmounted} from 'vue'
import draggable from 'vuedraggable'
import {storeToRefs} from 'pinia'
import {useDashboardStore} from '@/stores/dashboard'
import {useAuthStore} from '@/stores/auth'
import {useDashboardLayout} from '@/composables/useDashboardLayout'
import PortfolioStatsCard from '@/components/ui/PortfolioStatsCard.vue'
import AppLoader from '@/components/ui/AppLoader.vue'
import {gainLossClass, usePercent} from '@/composables/useFormat'
import {useI18n} from '@/composables/useI18n'

const DailySummaryCard      = defineAsyncComponent(() => import('@/components/charts/DailySummaryCard.vue'))
const BreakdownCard         = defineAsyncComponent(() => import('@/components/charts/BreakdownCard.vue'))
const PortfolioHistoryChart = defineAsyncComponent(() => import('@/components/charts/PortfolioHistoryChart.vue'))
const PortfolioCompareChart = defineAsyncComponent(() => import('@/components/charts/PortfolioCompareChart.vue'))
const MarketsCard           = defineAsyncComponent(() => import('@/components/charts/MarketsCard.vue'))
const TrendingCard          = defineAsyncComponent(() => import('@/components/charts/TrendingCard.vue'))
const WatchlistMoversCard   = defineAsyncComponent(() => import('@/components/charts/WatchlistMoversCard.vue'))
const DividendCalendarCard  = defineAsyncComponent(() => import('@/components/charts/DividendCalendarCard.vue'))
const IncomeProjectionChart = defineAsyncComponent(() => import('@/components/charts/IncomeProjectionChart.vue'))

const dashboard = useDashboardStore()
const auth = useAuthStore()
const {t} = useI18n()
const {cards, editMode, toggleCard, toggleEditMode, resetLayout} = useDashboardLayout()

const aiSummaryEnabled = computed(() => auth.user?.aiDailySummaryEnabled !== false)
const {
  ready,
  portfolioPositions,
  portfolioCombinedUsd,
  watchlistMoversItems,
  watchlistMoversLoading,
  showTrending,
  history,
  historyLoading,
  historyRange,
  incomeMonths,
  incomeTotals,
  incomeLoading,
} = storeToRefs(dashboard)

const historyChangePercent = computed(() => portfolioCombinedUsd.value?.pnlPercent ?? null)

const HISTORY_RANGES = [
  {label: '1D', value: '1d'},
  {label: '1W', value: '1wk'},
  {label: '1M', value: '1mo'},
  {label: '3M', value: '3mo'},
  {label: '6M', value: '6mo'},
]

onMounted(async () => {
  try { await dashboard.initialize() } catch {}
})
onUnmounted(() => dashboard.stopClock())

</script>

<template>
  <div class="dashboard">
    <header class="dash-header">
      <h1 class="gradient-title">{{ t('common.dashboard') }}</h1>
    </header>

    <div v-if="!ready" class="dash-loader">
      <AppLoader/>
    </div>

    <template v-else>

      <!-- edit mode -->
      <div v-if="editMode" class="edit-container">
        <draggable
          v-model="cards"
          item-key="id"
          :animation="200"
          handle=".drag-handle"
          ghost-class="card-ghost"
          class="edit-list"
        >
          <template #item="{element: card}">
            <div class="edit-row" :class="{
              'edit-row-hidden': !card.visible,
              'edit-row-locked': card.premium && !auth.canUsePremiumFeatures,
            }">
              <i class="pi pi-bars drag-handle"/>
              <span class="edit-label">{{ card.label }}</span>
              <i v-if="card.premium && !auth.canUsePremiumFeatures" class="pi pi-crown label-crown"/>
              <button
                class="visibility-btn"
                :class="{
                  'vis-off': !card.visible,
                  'vis-disabled': card.alwaysOn || (card.premium && !auth.canUsePremiumFeatures),
                }"
                :disabled="card.alwaysOn || (card.premium && !auth.canUsePremiumFeatures)"
                @click.stop="toggleCard(card.id)"
              >
                <i :class="card.visible ? 'pi pi-eye' : 'pi pi-eye-slash'"/>
              </button>
            </div>
          </template>
        </draggable>
      </div>

      <div v-if="editMode" class="reset-wrap">
        <button class="reset-btn" @click="resetLayout">
          <i class="pi pi-refresh"/>
          {{ t('dashboard.resetLayout') }}
        </button>
      </div>

      <!-- normal mode: real cards -->
      <template v-else>
        <template v-for="card in cards" :key="card.id">
          <template v-if="card.id === 'stats' && card.visible">
            <PortfolioStatsCard />
          </template>
          <template v-else-if="card.id === 'ai-summary' && card.visible && aiSummaryEnabled">
            <DailySummaryCard />
          </template>
          <template v-else-if="card.id === 'markets' && card.visible">
            <MarketsCard />
          </template>
          <template v-else-if="card.id === 'movers' && card.visible">
            <WatchlistMoversCard :items="watchlistMoversItems" :loading="watchlistMoversLoading"/>
          </template>
          <template v-else-if="card.id === 'breakdown' && card.visible">
            <BreakdownCard :combined-usd="portfolioCombinedUsd" :positions="portfolioPositions"/>
          </template>
          <template v-else-if="card.id === 'trending' && card.visible && showTrending">
            <TrendingCard />
          </template>
          <template v-else-if="card.id === 'history' && card.visible">
            <section class="history-card">
              <div class="history-head">
                <div class="history-title-row">
                  <h2 class="section-title">{{ t('dashboard.portfolioValue') }}</h2>
                  <div v-if="historyChangePercent != null" :class="gainLossClass(historyChangePercent)" class="history-change">
                    {{ usePercent(historyChangePercent) }}
                  </div>
                </div>
                <div v-if="portfolioPositions.length" class="toggle-group">
                  <button
                    v-for="opt in HISTORY_RANGES"
                    :key="opt.value"
                    :class="{active: historyRange === opt.value}"
                    class="toggle-btn"
                    @click="dashboard.setHistoryRange(opt.value)"
                  >{{ opt.label }}</button>
                </div>
              </div>
              <template v-if="portfolioPositions.length">
                <PortfolioHistoryChart
                  :key="historyRange"
                  :data="history"
                  :day-pnl="portfolioCombinedUsd?.dayPnl"
                  :loading="historyLoading"
                  :range="historyRange"
                />
              </template>
              <div v-else class="history-empty">
                <i class="pi pi-chart-line history-empty-icon"/>
                <span>{{ t('dashboard.historyEmpty') }}</span>
              </div>
            </section>
          </template>
          <template v-else-if="card.id === 'income' && card.visible && auth.canUsePremiumFeatures">
            <IncomeProjectionChart :data="incomeMonths" :loading="incomeLoading" :totals="incomeTotals"/>
          </template>
          <template v-else-if="card.id === 'compare' && card.visible">
            <PortfolioCompareChart :positions="portfolioPositions" :range="historyRange"/>
          </template>
          <template v-else-if="card.id === 'calendar' && card.visible && portfolioPositions.length">
            <DividendCalendarCard />
          </template>
        </template>

        <div v-if="!portfolioPositions.length" class="empty text-muted">
          {{ t('dashboard.empty') }}
        </div>
      </template>

      <div class="edit-home-wrap">
        <button class="edit-home-btn" :class="{active: editMode}" @click="toggleEditMode">
          <i :class="editMode ? 'pi pi-check' : 'pi pi-sliders-h'"/>
          {{ editMode ? t('dashboard.done') : t('dashboard.editHome') }}
        </button>
      </div>

    </template>
  </div>
</template>

<style scoped>
.dashboard { padding: 1rem; }

.dash-loader {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 50vh;
  margin-top: 140px;
}

.dash-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.25rem;
}

.dash-header h1 { font-size: 1.5rem; }

/* ── edit mode ── */
.edit-container {
  margin-bottom: 0.25rem;
}

.edit-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.edit-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 0.85rem 1rem;
  cursor: grab;
  user-select: none;
}

.edit-row:active { cursor: grabbing; }

.edit-row-hidden {
  opacity: 0.45;
  border-style: dashed;
}

.edit-row-locked {
  opacity: 0.55;
}

.label-crown {
  font-size: 0.7rem;
  color: #f59e0b;
  flex-shrink: 0;
}

.drag-handle {
  color: var(--text-secondary);
  font-size: 1rem;
  flex-shrink: 0;
}

.edit-label {
  flex: 1;
  font-size: 0.9rem;
  font-weight: 500;
}

.visibility-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--accent);
  font-size: 1.1rem;
  padding: 8px;
  line-height: 1;
  border-radius: 6px;
}

.visibility-btn.vis-off {
  color: var(--text-secondary);
}

.visibility-btn.vis-disabled {
  opacity: 0.3;
  cursor: not-allowed;
}


/* ghost while dragging */
.card-ghost {
  opacity: 0.3;
  background: var(--accent);
  border-radius: 14px;
}

/* ── history card ── */
.history-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 0.9rem 1rem;
  margin-bottom: 1.75rem;
}

.history-head { padding: 0 0.25rem; }

.history-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 2rem 1rem;
  color: var(--text-secondary);
  font-size: 0.85rem;
  opacity: 0.7;
}

.history-empty-icon {
  font-size: 1.75rem;
  opacity: 0.4;
}

.history-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.history-change { font-size: 0.8rem; font-weight: 600; }

.section-title {
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-secondary);
  margin: 0;
}

.history-card .toggle-btn { padding: 3px 8px; font-size: 0.72rem; }

.toggle-group {
  display: flex;
  gap: 0.25rem;
  flex-wrap: wrap;
  margin-top: 0.5rem;
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

.reset-wrap {
  display: flex;
  justify-content: center;
  padding: 0.25rem 0 0.75rem;
}

.reset-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.78rem;
  font-weight: 500;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  padding: 6px 12px;
  cursor: pointer;
  opacity: 0.7;
}

.reset-btn:active { opacity: 1; }

/* ── edit home button ── */
.edit-home-wrap {
  display: flex;
  justify-content: center;
  padding: 1rem 0 0.5rem;
}

.edit-home-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.85rem;
  font-weight: 600;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 20px;
  color: var(--text-secondary);
  padding: 7px 20px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}

.edit-home-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.empty {
  display: block;
  padding: 2rem 0;
  font-size: 0.9rem;
  text-align: center;
}

@media (min-width: 768px) { .dashboard { padding: 1.5rem; } }
@media (min-width: 1280px) { .dashboard { padding: 2rem; } }
</style>
