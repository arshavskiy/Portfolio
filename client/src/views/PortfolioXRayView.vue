<script setup>
import {computed, onMounted, ref} from 'vue'
import {useRouter} from 'vue-router'
import Button from 'primevue/button'
import PremiumBadge from '@/components/ui/PremiumBadge.vue'
import AppLoader from '@/components/ui/AppLoader.vue'
import TickerArticlesModal from '@/components/ui/TickerArticlesModal.vue'
import api from '@/composables/useApi'
import {useCurrency, usePercent} from '@/composables/useFormat'
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

const summaryMetricCards = computed(() => {
  const s = portfolioSummary.value
  const largestHolding = analytics.value?.allocations?.holding?.[0]
  return [
    {
      icon: 'pi pi-dollar',
      label: t('xray.annualDividendIncome'),
      value: formatUsd(s.annualDividendIncomeUsd),
      tone: numberValue(s.annualDividendIncomeUsd) > 0 ? 'positive' : '',
    },
    {
      icon: 'pi pi-percentage',
      label: t('xray.yieldOnPortfolio'),
      value: formatSignedPercent(s.dividendIncomeYield),
      tone: numberValue(s.dividendIncomeYield) > 0 ? 'positive' : '',
    },
    {
      icon: 'pi pi-users',
      label: t('xray.positionsPayingDividends'),
      value: `${numberValue(s.dividendPayerCount)} / ${numberValue(s.positionCount)}`,
    },
    {
      icon: 'pi pi-star-fill',
      label: t('xray.largestPosition'),
      value: largestHolding?.ticker || '-',
      detail: largestHolding ? usePercent(largestHolding.percent) : '-',
    },
    {
      icon: 'pi pi-th-large',
      label: t('xray.sectorSpread'),
      value: numberValue(s.sectorCount),
      detail: t('xray.sectorsTracked', {n: numberValue(s.sectorCount)}),
    },
    {
      icon: 'pi pi-bell',
      label: t('xray.activeAlerts'),
      value: numberValue(s.activeAlertCount),
      detail: t('xray.holdingsCovered', {n: numberValue(s.positionsWithAlerts)}),
    },
  ]
})

const summarySections = computed(() => {
  const s = portfolioSummary.value
  const largestHolding = analytics.value?.allocations?.holding?.[0]
  const grossPerformance = numberValue(s.unrealizedPnlUsd)
  const netPerformance = grossPerformance - numberValue(s.feesUsd)
  const investment = numberValue(s.totalCostUsd)
  const netWorth = numberValue(s.totalValueUsd)
  const annualizedPerformance = numberValue(s.timeInMarketDays) > 0 && investment > 0
    ? (Math.pow(1 + (netPerformance / Math.max(1, investment)), 365 / Math.max(1, s.timeInMarketDays)) - 1) * 100
    : 0

  return [
    [
      {label: t('xray.timeInMarket'), value: formatTimeInMarket(s.timeInMarketDays)},
      {label: t('xray.activitiesCount', {n: numberValue(s.activityCount)}), value: '', hint: true},
    ],
    [
      {label: t('xray.buy'), value: formatUsd(s.buyTotalUsd)},
      {label: t('xray.sell'), value: formatUsd(s.sellTotalUsd)},
    ],
    [
      {label: t('xray.investment'), value: formatUsd(investment)},
      {label: t('xray.absoluteGrossPerformance'), value: formatSignedUsd(grossPerformance), tone: toneFor(grossPerformance)},
      {label: t('xray.fees'), value: formatUsd(s.feesUsd), tone: numberValue(s.feesUsd) > 0 ? 'negative' : ''},
    ],
    [
      {label: t('xray.absoluteNetPerformance'), value: formatSignedUsd(netPerformance), tone: toneFor(netPerformance)},
      {label: t('xray.netPerformanceRoai'), value: formatSignedPercent(investment > 0 ? (netPerformance / investment) * 100 : 0), tone: toneFor(netPerformance), inset: true},
    ],
    [
      {label: t('xray.totalAssets'), value: formatUsd(netWorth)},
      {label: t('xray.holdings'), value: formatUsd(s.totalValueUsd), inset: true},
      {label: t('xray.excludedFromAnalysis'), value: formatUsd(0)},
    ],
    [
      {label: t('xray.netWorth'), value: formatUsd(netWorth), strong: true},
      {label: t('xray.annualizedPerformance'), value: formatSignedPercent(annualizedPerformance), tone: toneFor(annualizedPerformance), inset: true},
    ],
    [
      {label: t('xray.dividendReceived'), value: formatUsd(s.dividendsUsd)},
    ],
  ]
})

function numberValue(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function formatUsd(value) {
  return useCurrency(numberValue(value), 'USD')
}

function formatPortfolioValue(value) {
  const usd = numberValue(value)
  const rate = numberValue(portfolioSummary.value.ilsToUsd)
  if (hasMixedCurrencies.value && rate > 0) return useCurrency(usd / rate, 'ILS')
  return useCurrency(usd, 'USD')
}

function formatSignedUsd(value) {
  const n = numberValue(value)
  return `${n > 0 ? '+' : n < 0 ? '-' : ''}${useCurrency(Math.abs(n), 'USD')}`
}

function formatSignedPercent(value) {
  const n = numberValue(value)
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`
}

function formatTimeInMarket(days) {
  if (days == null) return t('xray.noActivityYet')
  if (days <= 0) return t('xray.lessThanADay')
  if (days === 1) return t('xray.oneDay')
  if (days < 30) return t('xray.daysCount', {n: days})
  if (days < 365) return t('xray.monthsDays', {months: Math.floor(days / 30), days: days % 30})
  const years = Math.floor(days / 365)
  const months = Math.floor((days % 365) / 30)
  const base = t('xray.yearsCount', {years, plural: years > 1 ? 's' : ''})
  return months ? `${base} ${t('xray.monthsSuffix', {months})}` : base
}

function toneFor(value) {
  const n = numberValue(value)
  if (n > 0) return 'positive'
  if (n < 0) return 'negative'
  return ''
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
          <small>{{ usePercent(item.row.percent) }}</small>
        </div>
      </section>

      <section class="portfolio-summary-panel">
        <div class="panel-head">
          <div>
            <h2>{{ t('xray.summary') }}</h2>
            <p class="text-muted">{{ t('xray.summarySubtitle') }}</p>
          </div>
          <span class="checked-pill">{{ t('xray.holdingsCount', {n: analytics?.summary?.positionCount || 0}) }}</span>
        </div>
        <div class="summary-metric-grid">
          <article v-for="card in summaryMetricCards" :key="card.label" class="summary-metric-card">
            <i :class="card.icon" class="summary-metric-icon"/>
            <span>{{ card.label }}</span>
            <strong :class="[card.tone, !card.tone ? 'metric-value-glow' : '']">{{ card.value }}</strong>
            <small v-if="card.detail">{{ card.detail }}</small>
          </article>
        </div>
        <div class="summary-sheet">
          <div v-for="(section, index) in summarySections" :key="index" class="summary-section">
            <div
                v-for="row in section"
                :key="row.label"
                :class="{inset: row.inset, strong: row.strong, muted: row.muted, hint: row.hint}"
                class="summary-row"
            >
              <span>{{ row.label }}</span>
              <strong v-if="row.value" :class="row.tone">{{ row.value }}</strong>
            </div>
          </div>
        </div>
      </section>

      <section class="rules-list">
        <article v-for="rule in rules" :key="rule.key" :class="rule.status" class="rule-card">
          <div class="rule-head">
            <span class="rule-status">
              <i :class="statusMeta[rule.status]?.icon"/>
              {{ statusMeta[rule.status]?.label || rule.status }}
            </span>
            <h2>{{ rule.title }}</h2>
          </div>
          <p>{{ rule.message }}</p>
          <p class="suggestion text-muted">{{ rule.suggestion }}</p>
          <div v-if="rule.affectedTickers?.length" class="affected-row">
            <button
                v-for="ticker in rule.affectedTickers"
                :key="ticker"
                class="ticker-pill"
                type="button"
                @click="openTicker(ticker)"
            >
              {{ ticker }}
            </button>
          </div>
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
                    <b>{{ usePercent(row.allocationPercent) }}</b>
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
  margin-top: 0.5rem;
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
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.score-card,
.allocation-chip,
.rule-card,
.portfolio-summary-panel,
.signals-panel {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-secondary);
}

.score-card {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-height: 76px;
  padding: 0.85rem;
}

.score-label {
  color: var(--text-secondary);
  font-size: 0.76rem;
}

.score-card strong {
  font-size: 1.35rem;
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
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.allocation-chip {
  display: flex;
  flex-direction: column;
  gap: 0.18rem;
  padding: 0.75rem;
}

.allocation-chip strong,
.allocation-chip small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.portfolio-summary-panel {
  margin-bottom: 0.75rem;
  overflow: hidden;
}

.summary-metric-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
  padding: 0.85rem 1rem 0.1rem;
}

.summary-metric-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  min-height: 96px;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.025);
  padding: 0.65rem;
}

.summary-metric-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, var(--neon-blue) 0%, var(--purple) 100%);
  opacity: 0.65;
}

.summary-metric-icon {
  position: absolute;
  top: 0.55rem;
  right: 0.6rem;
  color: var(--neon-blue);
  font-size: 0.95rem;
  opacity: 0.4;
}

.summary-metric-card span {
  color: var(--text-secondary);
  font-size: 0.68rem;
  font-weight: 400;
  line-height: 1.2;
  padding-right: 1.35rem;
  text-transform: uppercase;
}

.summary-metric-card strong {
  color: var(--text-primary);
  font-size: 1.25rem;
  font-weight: 400;
  line-height: 1.1;
  overflow-wrap: anywhere;
}

.summary-metric-card small {
  color: var(--text-secondary);
  font-size: 0.72rem;
  line-height: 1.25;
}

.metric-value-glow {
  background: linear-gradient(135deg, #f8fafc 0%, #cbd5e1 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.summary-sheet {
  padding: 0 1rem 0.8rem;
}

.summary-section {
  padding: 0.85rem 0;
  border-bottom: 1px solid var(--border);
}

.summary-section:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}

.summary-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: baseline;
  gap: 1rem;
  min-height: 1.6rem;
  color: var(--text-primary);
  font-size: 0.9rem;
}

.summary-row + .summary-row {
  margin-top: 0.35rem;
}

.summary-row.inset span:first-child {
  padding-left: 1rem;
}

.summary-row.hint {
  min-height: 1.25rem;
  color: var(--text-secondary);
  font-size: 0.78rem;
}

.summary-row.strong span,
.summary-row.strong strong {
  font-weight: 400;
}

.summary-row.muted span,
.summary-row.muted strong {
  color: var(--text-secondary);
}

.summary-row span,
.summary-row strong {
  min-width: 0;
}

.summary-row span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.summary-row strong {
  color: var(--text-primary);
  font-size: 0.88rem;
  font-weight: 400;
  text-align: right;
  white-space: nowrap;
}

.rules-list {
  display: grid;
  gap: 0.75rem;
}

.rule-card {
  padding: 0.85rem;
}

.rule-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.45rem;
}

.rule-head h2 {
  font-size: 0.98rem;
  text-align: right;
}

.rule-status {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
  font-size: 0.78rem;
  font-weight: 400;
}

.suggestion {
  margin-top: 0.35rem;
  font-size: 0.82rem;
}

.affected-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.65rem;
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

  .score-grid,
  .allocation-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .rule-head {
    align-items: flex-start;
    flex-direction: column;
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

  .summary-sheet {
    padding-inline: 0.8rem;
  }

  .summary-metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.55rem;
    padding: 0.75rem 0.8rem 0.1rem;
  }

  .summary-metric-card {
    min-height: 90px;
    padding: 0.6rem;
  }

  .summary-metric-card strong {
    font-size: 1.08rem;
  }

  .summary-row {
    gap: 0.7rem;
    font-size: 0.84rem;
  }
}
</style>
