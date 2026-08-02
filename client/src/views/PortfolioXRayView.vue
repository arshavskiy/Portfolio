<script setup>
import {computed, onMounted, ref} from 'vue'
import {useRouter} from 'vue-router'
import Button from 'primevue/button'
import PremiumBadge from '@/components/ui/PremiumBadge.vue'
import AppLoader from '@/components/ui/AppLoader.vue'
import TickerArticlesModal from '@/components/ui/TickerArticlesModal.vue'
import api from '@/composables/useApi'
import {useCurrency, usePercent, useShare} from '@/composables/useFormat'
import {useI18n} from '@/composables/useI18n'

const router = useRouter()
const {t} = useI18n()

const loading = ref(false)
const error = ref('')
const data = ref(null)

const rules = computed(() => data.value?.rules || [])
const summary = computed(() => data.value?.summary || {pass: 0, warn: 0, fail: 0, total: 0})
const analytics = computed(() => data.value?.analytics || null)
const portfolioSummary = computed(() => analytics.value?.summary || {})

const statusMeta = computed(() => ({
  pass: {icon: 'pi pi-check-circle', label: t('xray.pass')},
  warn: {icon: 'pi pi-exclamation-triangle', label: t('xray.watch')},
  fail: {icon: 'pi pi-times-circle', label: t('xray.risk')},
}))

const topAllocations = computed(() => {
  const allocations = analytics.value?.allocations || {}
  return [
    {title: t('xray.topHolding'), row: allocations.holding?.[0], labelKey: 'ticker'},
    {title: t('xray.topSector'), row: allocations.sector?.[0], labelKey: 'sector'},
    {title: t('xray.topCurrency'), row: allocations.currency?.[0], labelKey: 'currency'},
    {title: t('xray.topMarket'), row: allocations.market?.[0], labelKey: 'market'},
  ].filter((item) => item.row)
})

const hasMixedCurrencies = computed(() => (analytics.value?.allocations?.currency || []).length > 1)

function numberValue(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function formatPortfolioValue(value) {
  const usd = numberValue(value)
  const rate = numberValue(portfolioSummary.value.ilsToUsd)
  if (hasMixedCurrencies.value && rate > 0) return useCurrency(usd / rate, 'ILS')
  return useCurrency(usd, 'USD')
}

function signalClass(row) {
  if (!row.hasInsightData && !row.hasAnalystResearch) return 'muted'
  if (row.rating === 'SELL' || row.valuation === 'Overvalued' || row.daysToCover >= 4 || row.momentum < -0.15 || row.analystDelta < 0)
    return 'negative'
  if (row.rating === 'BUY' || row.valuation === 'Undervalued' || row.momentum > 0.15 || row.analystDelta > 0)
    return 'positive'
  return 'neutral'
}

function signalLabel(row) {
  const cls = signalClass(row)
  if (cls === 'negative') return t('xray.statusWatch')
  if (cls === 'positive') return t('xray.statusSupportive')
  if (cls === 'muted') return t('xray.statusNoCoverage')
  return t('xray.statusNeutral')
}

function formatMomentum(value) {
  if (value == null) return t('xray.noMomentum')
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}`
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    data.value = await api.get('/portfolio/x-ray')
  } catch (err) {
    error.value = err.message || t('xray.loadFailed')
  } finally {
    loading.value = false
  }
}

function openTicker(ticker) {
  router.push(`/position/${encodeURIComponent(ticker)}`)
}

const articlesModalTicker = ref('')
const articlesModalVisible = ref(false)

function openArticlesModal(row) {
  if (!row?.hasInsightData) return
  articlesModalTicker.value = row.ticker
  articlesModalVisible.value = true
}

onMounted(load)
</script>

<template>
  <main class="xray-page safe-bottom">
    <header class="xray-header">
      <div>
        <div class="title-row">
          <h1 class="gradient-title">{{ t('xray.title') }}</h1>
          <PremiumBadge :label="t('common.premium')" :title="t('common.premiumFeature')" compact/>
        </div>
        <p class="text-muted">{{ t('xray.subtitle') }}</p>
      </div>
      <Button :disabled="loading" icon="pi pi-refresh" rounded text @click="load"/>
    </header>

    <div v-if="loading" class="loading-state">
      <AppLoader/>
      <span class="text-muted">{{ t('xray.scanning') }}</span>
    </div>

    <p v-else-if="error" class="error-state">
      <i class="pi pi-exclamation-triangle"/>
      {{ error }}
    </p>

    <template v-else-if="data">
      <section class="score-grid">
        <div class="score-card risk">
          <span class="score-label">{{ t('xray.risk') }}</span>
          <strong>{{ summary.fail }}</strong>
        </div>
        <div class="score-card watch">
          <span class="score-label">{{ t('xray.watch') }}</span>
          <strong>{{ summary.warn }}</strong>
        </div>
        <div class="score-card pass">
          <span class="score-label">{{ t('xray.pass') }}</span>
          <strong>{{ summary.pass }}</strong>
        </div>
        <div class="score-card">
          <span class="score-label">{{ t('xray.value') }}</span>
          <strong>{{ formatPortfolioValue(analytics?.summary?.totalValueUsd || 0) }}</strong>
        </div>
      </section>

      <section v-if="topAllocations.length" class="allocation-strip">
        <div v-for="item in topAllocations" :key="item.title" class="allocation-chip">
          <span class="text-muted">{{ item.title }}</span>
          <strong>{{ item.row[item.labelKey] }}</strong>
          <small>{{ useShare(item.row.percent) }}</small>
        </div>
      </section>

      <section class="rules-list">
        <article v-for="rule in rules" :key="rule.key" :class="rule.status" class="rule-card">
          <div class="rule-head">
            <h2>{{ rule.title }}</h2>
            <span class="rule-status">
              <i :class="statusMeta[rule.status]?.icon"/>
              {{ statusMeta[rule.status]?.label || rule.status }}
            </span>
          </div>
          <p>{{ rule.message }}</p>
          <p v-if="rule.consequences?.length" class="consequences text-muted">
            {{ t('xray.alsoDrives') }} {{ rule.consequences.map((c) => c.title).join(' · ') }}
          </p>
          <p class="suggestion text-muted">{{ rule.suggestion }}</p>
        </article>
      </section>

      <section v-if="data.tickerSignals?.length" class="signals-panel">
        <div class="panel-head">
          <div>
            <h2>{{ t('xray.tickerSignalsTitle') }}</h2>
            <p class="text-muted">{{ t('xray.tickerSignalsSubtitle') }}</p>
          </div>
          <span class="checked-pill">{{ t('xray.checkedCount', {n: data.tickerSignals.length}) }}</span>
        </div>
        <div class="signals-table-wrap">
          <table class="signals-table">
            <thead>
              <tr>
                <th>{{ t('xray.colTicker') }}</th>
                <th>{{ t('xray.colStatus') }}</th>
                <th>{{ t('xray.colAllocation') }}</th>
                <th>{{ t('xray.colMomentum') }}</th>
                <th>{{ t('xray.colRating') }}</th>
                <th>{{ t('xray.colValuation') }}</th>
                <th>{{ t('xray.colArticles') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                  v-for="row in data.tickerSignals"
                  :key="row.ticker"
                  :class="signalClass(row)"
                  class="signal-row"
                  role="button"
                  tabindex="0"
                  @click="openTicker(row.ticker)"
                  @keydown.enter="openTicker(row.ticker)"
                  @keydown.space.prevent="openTicker(row.ticker)"
              >
                <td class="signal-ticker">{{ row.ticker }}</td>
                <td><span class="signal-state">{{ signalLabel(row) }}</span></td>
                <td>
                  <div class="signal-allocation">
                    <span class="allocation-meter" aria-hidden="true">
                      <span :style="{width: `${Math.min(100, Math.max(0, row.allocationPercent || 0))}%`}"/>
                    </span>
                    <b>{{ useShare(row.allocationPercent) }}</b>
                  </div>
                </td>
                <td>
                  <b :class="{negative: row.momentum < 0, positive: row.momentum > 0}">{{ formatMomentum(row.momentum) }}</b>
                </td>
                <td>{{ row.rating || t('xray.noRating') }}</td>
                <td>{{ row.valuation || t('xray.noValuation') }}</td>
                <td>
                  <button
                      v-if="row.hasInsightData"
                      class="articles-link"
                      type="button"
                      @click.stop="openArticlesModal(row)"
                  >
                    {{ t('xray.articlesCount', {n: row.articleCount7d || 0}) }}
                  </button>
                  <span v-else>{{ t('xray.noInsight') }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>

    <TickerArticlesModal v-model:visible="articlesModalVisible" :ticker="articlesModalTicker"/>
  </main>
</template>

<style scoped>
.xray-page {
  min-height: 100%;
  padding: 1rem;
  background: var(--bg-primary);
  color: var(--text-primary);
}

@media (min-width: 1024px) {
  .xray-page {
    max-width: 1180px;
    margin: 0 auto;
    padding: 1.5rem 2rem 2rem;
  }
}

.xray-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.25rem;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

h1,
h2,
p {
  margin: 0;
}

.xray-header h1 {
  font-size: 1.5rem;
}

.score-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.4rem;
  margin-bottom: 0.4rem;
}

.score-card,
.allocation-chip,
.rule-card,
.signals-panel {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-secondary);
}

.score-card {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-height: unset;
  padding: 0.45rem 0.65rem;
}

.score-label {
  color: var(--text-secondary);
  font-size: 0.68rem;
}

.score-card strong {
  font-size: 0.8rem;
  font-weight: 600;
}

.score-card.risk strong,
.rule-card.fail .rule-status,
.negative {
  color: var(--red, #ef4444);
}

.score-card.watch strong,
.rule-card.warn .rule-status {
  color: #facc15;
}

.score-card.pass strong,
.rule-card.pass .rule-status,
.positive {
  color: var(--green, #22c55e);
}

.allocation-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.4rem;
  margin-bottom: 0.4rem;
}

.allocation-chip {
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
  padding: 0.45rem 0.65rem;
}

.allocation-chip span {
  font-size: 0.68rem;
}

.allocation-chip strong {
  font-size: 0.8rem;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.allocation-chip small {
  font-size: 0.72rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rules-list {
  display: grid;
  gap: 0.45rem;
}

.rule-card {
  padding: 0.55rem 0.75rem;
}

.rule-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
  overflow: hidden;
}

.rule-head h2 {
  font-size: 0.88rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  flex: 1;
}

.rule-card p {
  font-size: 0.78rem;
  line-height: 1.4;
  margin: 0;
}

.rule-status {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  flex-shrink: 0;
  font-size: 0.72rem;
  font-weight: 400;
}

.consequences {
  margin-top: 0.2rem;
  font-size: 0.72rem;
}

.suggestion {
  margin-top: 0.2rem;
  font-size: 0.75rem;
}

.affected-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-top: 0.4rem;
}

.ticker-pill {
  border: 1px solid color-mix(in srgb, var(--neon-blue) 35%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--neon-blue) 10%, transparent);
  color: var(--neon-blue);
  font-size: 0.75rem;
  font-weight: 400;
  padding: 0.25rem 0.55rem;
}

.signals-panel {
  margin-top: 0.75rem;
  overflow: hidden;
}

.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.8rem 0.9rem;
  border-bottom: 1px solid var(--border);
}

.panel-head h2 {
  font-size: 1rem;
}

.panel-head p {
  margin-top: 0.2rem;
  font-size: 0.78rem;
}

.checked-pill {
  flex-shrink: 0;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-secondary);
  font-size: 0.72rem;
  font-weight: 400;
  padding: 0.25rem 0.55rem;
}

.signals-table-wrap {
  overflow-x: auto;
  padding: 0.85rem;
}

.signals-table {
  width: 100%;
  min-width: 640px;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.signals-table th {
  padding: 0.5rem 0.65rem;
  border-bottom: 1px solid var(--border);
  color: var(--text-secondary);
  font-size: 0.68rem;
  font-weight: 400;
  text-align: left;
  text-transform: uppercase;
  white-space: nowrap;
}

.signal-row {
  cursor: pointer;
  transition: background 0.15s;
}

.signal-row:hover {
  background: color-mix(in srgb, var(--neon-blue) 6%, transparent);
}

.signal-row td {
  padding: 0.6rem 0.65rem;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}

.signal-ticker {
  font-weight: 400;
}

.signal-row.positive .signal-ticker {
  color: var(--green, #22c55e);
}

.signal-row.negative .signal-ticker {
  color: var(--red, #ef4444);
}

.signal-row.muted {
  opacity: 0.78;
}

.signal-state {
  display: inline-flex;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-secondary);
  font-size: 0.68rem;
  font-weight: 400;
  padding: 0.2rem 0.5rem;
  text-transform: uppercase;
}

.signal-row.positive .signal-state {
  background: rgba(34, 197, 94, 0.12);
  color: var(--green, #22c55e);
}

.signal-row.negative .signal-state {
  background: rgba(239, 68, 68, 0.12);
  color: var(--red, #ef4444);
}

.signal-allocation {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.allocation-meter {
  display: block;
  width: 60px;
  height: 5px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.07);
  flex: 0 0 auto;
}

.allocation-meter span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--neon-blue), #facc15);
}

.articles-link {
  color: var(--neon-blue);
  font-size: inherit;
  font-weight: 400;
  text-decoration: none;
}

.articles-link:hover {
  text-decoration: underline;
}

.loading-state,
.error-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  min-height: 220px;
}

.error-state {
  color: var(--red, #ef4444);
}

@media (max-width: 760px) {
  .xray-page {
    padding: 0.8rem 0.8rem 5.5rem;
  }

  .score-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .allocation-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .rule-head {
    align-items: center;
  }

  .rule-head h2 {
    text-align: left;
  }

  .signals-table-wrap {
    padding: 0.7rem;
  }

  .panel-head {
    flex-direction: column;
  }

  .checked-pill {
    align-self: flex-start;
  }

}
</style>
