<script setup>
import {computed} from 'vue'
import {useCurrency, useShare} from '@/composables/useFormat'
import {useI18n} from '@/composables/useI18n'

// Portfolio summary sheet — metric cards plus the itemised performance rows.
// Takes the `analytics` payload from GET /portfolio/analytics (also nested
// inside GET /portfolio/x-ray) so each host page owns its own fetching.
const props = defineProps({
  analytics: {type: Object, default: null},
})

const {t} = useI18n()

const portfolioSummary = computed(() => props.analytics?.summary || {})
const hasMixedCurrencies = computed(() => (props.analytics?.allocations?.currency || []).length > 1)

const summaryMetricCards = computed(() => {
  const s = portfolioSummary.value
  const largestHolding = props.analytics?.allocations?.holding?.[0]
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
      detail: largestHolding ? useShare(largestHolding.percent) : '-',
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
  const grossPerformance = numberValue(s.unrealizedPnlUsd)
  const netPerformance = grossPerformance - numberValue(s.feesUsd)
  const investment = numberValue(s.totalCostUsd)
  const netWorth = numberValue(s.totalValueUsd)
  // Annualizing a sub-year holding period extrapolates noise — a 3-month
  // -13.82% would extrapolate to -45.30%, which isn't information. Only
  // annualize once the position has actually run a full year; otherwise
  // show the real (non-annualized) return so the row isn't misleading.
  const daysInMarket = numberValue(s.timeInMarketDays)
  const totalReturnPct = investment > 0 ? (netPerformance / investment) * 100 : 0
  const canAnnualize = daysInMarket >= 365 && investment > 0
  const annualizedPerformance = canAnnualize
    ? (Math.pow(1 + (netPerformance / Math.max(1, investment)), 365 / daysInMarket) - 1) * 100
    : null

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
      canAnnualize
        ? {label: t('xray.annualizedPerformance'), value: formatSignedPercent(annualizedPerformance), tone: toneFor(annualizedPerformance), inset: true}
        : {label: t('xray.totalPerformance'), value: formatSignedPercent(totalReturnPct), tone: toneFor(totalReturnPct), inset: true},
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
</script>

<template>
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
</template>

<style scoped>
.portfolio-summary-panel {
  margin-bottom: 0.75rem;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 14px;
}

.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.85rem 1rem 0;
}

.panel-head h2 {
  font-size: 0.95rem;
  font-weight: 600;
  line-height: 1.2;
  margin: 0;
}

.panel-head p {
  font-size: 0.78rem;
  line-height: 1.4;
  margin: 0.15rem 0 0;
}

.checked-pill {
  flex-shrink: 0;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0.15rem 0.55rem;
  color: var(--text-secondary);
  font-size: 0.68rem;
  font-weight: 600;
  white-space: nowrap;
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
  gap: 0.15rem;
  min-height: unset;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-primary);
  padding: 0.45rem 0.6rem;
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
  font-size: 0.8rem;
  font-weight: 600;
  line-height: 1.1;
  overflow-wrap: anywhere;
}

.summary-metric-card small {
  color: var(--text-secondary);
  font-size: 0.72rem;
  line-height: 1.25;
}

.metric-value-glow {
  color: var(--text-primary);
  -webkit-text-fill-color: var(--text-primary);
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
  font-size: 0.8rem;
  font-weight: 600;
  text-align: right;
  white-space: nowrap;
}

.summary-row strong.positive {
  color: var(--green);
}

.summary-row strong.negative {
  color: var(--red);
}

.summary-metric-card strong.positive {
  color: var(--green);
}

.summary-metric-card strong.negative {
  color: var(--red);
}

@media (max-width: 640px) {
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

:root.light .summary-metric-card::before {
  background: linear-gradient(90deg, #94a3b8 0%, #cbd5e1 100%);
}
</style>
