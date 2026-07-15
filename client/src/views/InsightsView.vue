<script setup>
import {computed, onMounted, ref} from 'vue'
import {storeToRefs} from 'pinia'
import {usePortfolioStore} from '@/stores/portfolio'
import {useCurrency, usePercent, useTickerCurrency, gainLossClass} from '@/composables/useFormat'
import {useI18n} from '@/composables/useI18n'
import AskPortfolioPanel from '@/components/ui/AskPortfolioPanel.vue'

const portfolio = usePortfolioStore()
const {positions, combinedUsd, loading, returnMetrics, riskExposure} = storeToRefs(portfolio)
const {t} = useI18n()

const activeTab = ref('income')
const scenarioTicker = ref('')
const scenarioAmount = ref(500)
const shockPercent = ref(-10)

const tabs = computed(() => [
  {key: 'income', icon: 'pi pi-calendar', label: t('insights.tabs.income')},
  {key: 'health', icon: 'pi pi-chart-pie', label: t('insights.tabs.health')},
  {key: 'scenario', icon: 'pi pi-calculator', label: t('insights.tabs.scenario')},
])

const reportCards = computed(() => [
  {icon: 'pi pi-receipt', title: t('insights.taxSummary'), text: t('insights.taxSummaryText')},
  {icon: 'pi pi-percentage', title: t('insights.dividendReport'), text: t('insights.dividendReportText')},
])

function numberValue(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function dividendYield(position) {
  const yieldValue = numberValue(position.dividendYield)
  if (yieldValue > 0) return yieldValue
  const rate = numberValue(position.dividendRate)
  const price = numberValue(position.currentPrice)
  return rate > 0 && price > 0 ? (rate / price) * 100 : 0
}

function fxRate(position) {
  if (position.currency !== 'ILS') return 1
  return numberValue(combinedUsd.value?.ilsToUsd) || 0
}

const portfolioValueUsd = computed(() => {
  if (numberValue(combinedUsd.value?.value) > 0) return numberValue(combinedUsd.value.value)
  return positions.value.reduce((sum, position) => sum + numberValue(position.valueUsd || position.value), 0)
})

const dividendPositions = computed(() =>
    positions.value
        .map((position) => {
          const annualNative = numberValue(position.dividendRate) * numberValue(position.shares)
          const annualUsd = annualNative * fxRate(position)
          return {
            ...position,
            annualNative,
            annualUsd,
            monthlyUsd: annualUsd / 12,
            yieldValue: dividendYield(position),
          }
        })
        .filter((position) => position.annualNative > 0 || position.yieldValue > 0)
        .sort((a, b) => b.annualUsd - a.annualUsd || a.ticker.localeCompare(b.ticker))
)

const annualIncomeUsd = computed(() =>
    dividendPositions.value.reduce((sum, position) => sum + position.annualUsd, 0)
)

const incomeYield = computed(() =>
    portfolioValueUsd.value > 0 ? (annualIncomeUsd.value / portfolioValueUsd.value) * 100 : null
)

const forecastMonths = computed(() => {
  const formatter = new Intl.DateTimeFormat(undefined, {month: 'short', year: 'numeric'})
  return Array.from({length: 12}, (_, index) => {
    const date = new Date()
    date.setMonth(date.getMonth() + index)
    const items = dividendPositions.value.map((position) => ({
      ticker: position.ticker,
      amountUsd: position.monthlyUsd,
      amountNative: position.annualNative / 12,
      currency: position.currency,
      yieldValue: position.yieldValue,
    }))

    return {
      key: `${date.getFullYear()}-${date.getMonth()}`,
      label: formatter.format(date),
      totalUsd: items.reduce((sum, item) => sum + item.amountUsd, 0),
      items,
    }
  })
})

const largestPosition = computed(() => {
  if (!positions.value.length || portfolioValueUsd.value <= 0) return null
  return positions.value
      .map((position) => ({
        ...position,
        allocation: (numberValue(position.valueUsd || position.value) / portfolioValueUsd.value) * 100,
      }))
      .sort((a, b) => b.allocation - a.allocation)[0]
})

const sectorCount = computed(() =>
    new Set(positions.value.map((position) => position.sector).filter(Boolean)).size
)

const scenarioPosition = computed(() => {
  const selected = scenarioTicker.value || positions.value[0]?.ticker
  return positions.value.find((position) => position.ticker === selected) || positions.value[0] || null
})

const scenario = computed(() => {
  const position = scenarioPosition.value
  if (!position) return null

  const amount = Math.max(0, numberValue(scenarioAmount.value))
  const price = numberValue(position.currentPrice)
  const shares = price > 0 ? amount / price : 0
  const amountUsd = amount * fxRate(position)
  const currentValueUsd = numberValue(position.valueUsd || position.value)
  const nextPortfolioValue = portfolioValueUsd.value + amountUsd
  const nextAllocation = nextPortfolioValue > 0 ? ((currentValueUsd + amountUsd) / nextPortfolioValue) * 100 : 0
  const incomeDelta = numberValue(position.dividendRate) * shares * fxRate(position)

  return {
    position,
    shares,
    nextAllocation,
    incomeDelta,
  }
})

const stressTest = computed(() => {
  const exposure = riskExposure.value
  if (!exposure?.weightedBeta || !exposure.totalValueUsd) return null
  const shockFraction = shockPercent.value / 100
  const projectedValue = exposure.totalValueUsd * (1 + exposure.weightedBeta * shockFraction)
  return {
    projectedValue,
    projectedChange: projectedValue - exposure.totalValueUsd,
  }
})

onMounted(() => {
  if (!positions.value.length && !loading.value) portfolio.fetchPortfolio().catch(() => {
  })
  if (!returnMetrics.value) portfolio.fetchReturnMetrics().catch(() => {
  })
  if (!riskExposure.value) portfolio.fetchRiskExposure().catch(() => {
  })
})
</script>

<template>
  <main class="insights-page safe-bottom">
    <header class="insights-header">
      <div>
        <h1 class="gradient-title">{{ t('insights.title') }}</h1>
        <p class="subtitle">{{ t('insights.subtitle') }}</p>
      </div>
    </header>

    <AskPortfolioPanel/>

    <nav aria-label="Portfolio insights sections" class="insights-tabs">
      <button
          v-for="tab in tabs"
          :key="tab.key"
          :class="{active: activeTab === tab.key}"
          type="button"
          @click="activeTab = tab.key"
      >
        <i :class="tab.icon"/>
        <span>{{ tab.label }}</span>
      </button>
    </nav>

    <div class="tab-body">
      <section v-if="loading && !positions.length" class="empty-state">
        <i class="pi pi-spin pi-spinner"/>
        <p>{{ t('common.loading') }}</p>
      </section>

      <section v-else-if="!positions.length" class="empty-state">
        <i class="pi pi-chart-line"/>
        <p>{{ t('insights.empty') }}</p>
      </section>

      <template v-else>
        <section v-if="activeTab === 'income'" class="insights-section">
          <div class="metric-grid">
            <article class="metric-card">
              <span>{{ t('insights.annualIncome') }}</span>
              <strong>{{ useCurrency(annualIncomeUsd, 'USD') }}</strong>
            </article>
            <article class="metric-card">
              <span>{{ t('insights.incomeYield') }}</span>
              <strong>{{ incomeYield == null ? '—' : usePercent(incomeYield) }}</strong>
            </article>
            <article class="metric-card">
              <span>{{ t('insights.dividendPayers') }}</span>
              <strong>{{ dividendPositions.length }} / {{ positions.length }}</strong>
            </article>
          </div>

          <div v-if="!dividendPositions.length" class="empty-state inline">
            <i class="pi pi-percentage"/>
            <p>{{ t('insights.noDividendIncome') }}</p>
            <span>{{ t('insights.noDividendIncomeHint') }}</span>
          </div>

          <div v-else class="income-layout">
            <section class="forecast-panel">
              <div class="section-heading">
                <h2>{{ t('insights.monthlyForecast') }}</h2>
                <p>{{ t('insights.monthlyForecastHint') }}</p>
              </div>
              <div class="month-list">
                <article v-for="month in forecastMonths" :key="month.key" class="month-row">
                  <div class="month-total">
                    <span>{{ month.label }}</span>
                    <strong>{{ useCurrency(month.totalUsd, 'USD') }}</strong>
                  </div>
                  <div class="month-tickers">
                  <span v-for="item in month.items.slice(0, 4)" :key="item.ticker">
                    {{ item.ticker }} {{ useCurrency(item.amountNative, item.currency) }}
                  </span>
                  </div>
                </article>
              </div>
            </section>

            <aside class="contributors-panel">
              <div class="section-heading">
                <h2>{{ t('insights.topContributors') }}</h2>
              </div>
              <article v-for="position in dividendPositions.slice(0, 6)" :key="position.ticker" class="contributor-row">
                <div>
                  <strong>{{ position.ticker }}</strong>
                  <span>{{ position.companyName || position.sector || '—' }}</span>
                </div>
                <div class="right-value">
                  <strong>{{ useCurrency(position.annualUsd, 'USD') }}</strong>
                  <span>{{ usePercent(position.yieldValue) }}</span>
                </div>
              </article>
            </aside>
          </div>
        </section>

        <section v-else-if="activeTab === 'health'" class="insights-section">
          <div class="section-heading">
            <h2>{{ t('insights.portfolioHealth') }}</h2>
          </div>
          <div class="metric-grid">
            <article class="metric-card">
              <span>{{ t('insights.largestPosition') }}</span>
              <strong>{{ largestPosition?.ticker || '—' }}</strong>
              <small>{{
                  largestPosition ? t('insights.ofPortfolio', {value: usePercent(largestPosition.allocation)}) : '—'
                }}</small>
            </article>
            <article class="metric-card">
              <span>{{ t('insights.sectorSpread') }}</span>
              <strong>{{ sectorCount }}</strong>
              <small>{{ t('insights.sectorsTracked', {count: sectorCount}) }}</small>
            </article>
            <article class="metric-card">
              <span>{{ t('insights.dividendCoverage') }}</span>
              <strong>{{ usePercent((dividendPositions.length / positions.length) * 100) }}</strong>
              <small>{{
                  t('insights.payersOfTotal', {payers: dividendPositions.length, total: positions.length})
                }}</small>
            </article>
            <article class="metric-card">
              <span>{{ t('insights.moneyWeightedReturn') }}</span>
              <strong>{{ returnMetrics?.irr == null ? '—' : usePercent(returnMetrics.irr) }}</strong>
              <small>{{ t('insights.moneyWeightedReturnHint') }}</small>
            </article>
            <article class="metric-card">
              <span>{{ t('insights.timeWeightedReturn') }}</span>
              <strong>{{ returnMetrics?.twr == null ? '—' : usePercent(returnMetrics.twr) }}</strong>
              <small>{{ t('insights.timeWeightedReturnHint') }}</small>
            </article>
            <article class="metric-card">
              <span>{{ t('insights.weightedBeta') }}</span>
              <strong>{{ riskExposure?.weightedBeta == null ? '—' : riskExposure.weightedBeta.toFixed(2) }}</strong>
              <small>{{ t('insights.weightedBetaHint') }}</small>
            </article>
          </div>

          <div v-if="riskExposure?.sectors?.length" class="risk-section">
            <div class="section-heading">
              <h2>{{ t('insights.sectorBreakdown') }}</h2>
            </div>
            <div class="sector-bars">
              <article v-for="sector in riskExposure.sectors" :key="sector.sector" class="sector-row">
                <div class="sector-row-head">
                  <span>{{ sector.sector }}</span>
                  <span>{{ usePercent(sector.percent) }}</span>
                </div>
                <div class="sector-bar-track">
                  <div :style="{width: sector.percent + '%'}" class="sector-bar-fill"/>
                </div>
              </article>
            </div>

            <div class="section-heading">
              <h2>{{ t('insights.stressTest') }}</h2>
              <p>{{ t('insights.stressTestHint') }}</p>
            </div>
            <div class="shock-control">
              <span>{{ t('insights.marketShock') }}</span>
              <input v-model.number="shockPercent" max="0" min="-50" step="5" type="range">
              <strong>{{ shockPercent }}%</strong>
            </div>
            <div v-if="stressTest" class="metric-grid">
              <article class="metric-card">
                <span>{{ t('insights.projectedValue') }}</span>
                <strong>{{ useCurrency(stressTest.projectedValue, 'USD') }}</strong>
              </article>
              <article class="metric-card">
                <span>{{ t('insights.projectedChange') }}</span>
                <strong :class="gainLossClass(stressTest.projectedChange)">
                  {{ useCurrency(stressTest.projectedChange, 'USD') }}
                </strong>
              </article>
            </div>
          </div>
        </section>

        <section v-else-if="activeTab === 'reports'" class="insights-section">
          <div class="section-heading">
            <h2>{{ t('insights.reportsTitle') }}</h2>
            <p>{{ t('insights.reportsSubtitle') }}</p>
          </div>

          <div class="report-grid">
            <article v-for="card in reportCards" :key="card.title" class="report-card">
              <i :class="card.icon"/>
              <h3>{{ card.title }}</h3>
              <p>{{ card.text }}</p>
              <button disabled type="button">{{ t('insights.planned') }}</button>
            </article>
          </div>
        </section>

        <section v-else class="insights-section scenario-section">
          <div class="section-heading">
            <h2>{{ t('insights.scenarioTitle') }}</h2>
            <p>{{ t('insights.scenarioSubtitle') }}</p>
          </div>

          <div class="scenario-controls">
            <label>
              <span>{{ t('insights.selectTicker') }}</span>
              <select v-model="scenarioTicker">
                <option v-for="position in positions" :key="position.ticker" :value="position.ticker">
                  {{ position.ticker }}
                </option>
              </select>
            </label>
            <label>
              <span>{{ t('insights.investAmount') }}</span>
              <input v-model.number="scenarioAmount" min="0" step="50" type="number">
            </label>
          </div>

          <div v-if="scenario" class="metric-grid">
            <article class="metric-card">
              <span>{{ t('insights.estimatedShares') }}</span>
              <strong>{{ scenario.shares.toFixed(3) }}</strong>
              <small>{{ useTickerCurrency(scenario.position.currentPrice, scenario.position.ticker) }}</small>
            </article>
            <article class="metric-card">
              <span>{{ t('insights.newAllocation') }}</span>
              <strong>{{ usePercent(scenario.nextAllocation) }}</strong>
              <small>{{ scenario.position.ticker }}</small>
            </article>
            <article class="metric-card">
              <span>{{ t('insights.incomeDelta') }}</span>
              <strong>{{ useCurrency(scenario.incomeDelta, 'USD') }}</strong>
              <small>{{ t('insights.annualIncome') }}</small>
            </article>
          </div>
        </section>
      </template>
    </div>
  </main>
</template>

<style scoped>
.insights-page {
  min-height: 100%;
  padding: 1rem;
  color: var(--text-primary);
  background: var(--bg-primary);
}

.insights-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.insights-header h1 {
  margin: 0;
  font-size: 1.75rem;
}

.subtitle,
.section-heading p,
.empty-state span,
.metric-card small,
.contributor-row span,
.right-value span,
.report-card p {
  color: var(--text-secondary);
}

.subtitle {
  max-width: 720px;
  margin: 0.4rem 0 0;
  line-height: 1.5;
}

.insights-tabs {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.35rem;
  margin-bottom: 0;
}

.report-card button {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  cursor: pointer;
}

.insights-tabs button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  min-height: 44px;
  padding: 0.55rem 0.7rem;
  border: 1px solid var(--border);
  border-bottom: none;
  border-radius: 8px 8px 0 0;
  background: var(--bg-primary);
  color: var(--text-secondary);
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
  transition: color 0.2s, background 0.2s;
}

.insights-tabs button:hover {
  color: var(--text-primary);
}

.insights-tabs button.active {
  color: var(--neon-blue);
  background: var(--bg-secondary);
  position: relative;
}

.insights-tabs button.active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 1px;
  background: var(--bg-secondary);
}

.tab-body {
  border: 1px solid var(--border);
  border-radius: 0 8px 8px 8px;
  background: var(--bg-secondary);
  padding: 1rem;
}

.insights-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  animation: insights-fade-in 0.25s ease;
}

@keyframes insights-fade-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.metric-grid,
.report-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
}

.metric-card,
.forecast-panel,
.contributors-panel,
.report-card,
.empty-state {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-secondary);
}

.metric-card {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 0.5rem;
  transition: border-color 0.2s, transform 0.15s;
}

.metric-card:hover {
  border-color: rgba(0, 207, 255, 0.35);
  transform: translateY(-2px);
}

.metric-card span {
  color: var(--text-secondary);
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
}

.metric-card strong {
  font-size: 1.45rem;
}

.income-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(260px, 0.9fr);
  gap: 0.75rem;
}

.forecast-panel,
.contributors-panel,
.report-card {
  padding: 1rem;
}

.section-heading h2,
.report-card h3 {
  margin: 0;
}

.section-heading p,
.report-card p {
  margin: 0.35rem 0 0;
  line-height: 1.45;
}

.month-list,
.contributors-panel {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.section-heading + .month-list,
.section-heading + .contributor-row {
  margin-top: 0.85rem;
}

.month-row,
.contributor-row {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 0;
  border-top: 1px solid var(--border);
}

.month-total,
.contributor-row > div,
.right-value {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.month-tickers {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.35rem;
}

.month-tickers span {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  padding: 0.2rem 0.45rem;
  color: var(--text-secondary);
  font-size: 0.75rem;
}

.right-value {
  align-items: flex-end;
  text-align: right;
}

.empty-state {
  display: grid;
  place-items: center;
  gap: 0.5rem;
  min-height: 220px;
  padding: 1.5rem;
  text-align: center;
}

.empty-state.inline {
  min-height: 160px;
}

.empty-state i {
  color: var(--neon-blue);
  font-size: 2rem;
  opacity: 0.75;
}

.report-card {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.report-card i {
  color: var(--neon-blue);
  font-size: 1.35rem;
}

.report-card button {
  align-self: flex-start;
  padding: 0.45rem 0.75rem;
  cursor: not-allowed;
  opacity: 0.7;
}

.scenario-controls {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 240px));
  gap: 0.75rem;
}

.risk-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.sector-bars {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.sector-row {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.sector-row-head {
  display: flex;
  justify-content: space-between;
  font-size: 0.82rem;
}

.sector-bar-track {
  height: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.sector-bar-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #00cfff 0%, #a855f7 100%);
  transition: width 0.4s ease;
}

.shock-control {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.shock-control span {
  color: var(--text-secondary);
  font-size: 0.8rem;
  font-weight: 700;
  white-space: nowrap;
}

.shock-control input[type='range'] {
  flex: 1;
  accent-color: var(--neon-blue);
}

.scenario-controls label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  color: var(--text-secondary);
  font-size: 0.8rem;
  font-weight: 700;
}

.scenario-controls select,
.scenario-controls input {
  min-height: 42px;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0 0.7rem;
  color: var(--text-primary);
  background: var(--bg-secondary);
}

@media (min-width: 1024px) {
  .insights-page {
    padding: 1.5rem 2rem 2rem;
  }
}

@media (max-width: 760px) {
  .report-grid,
  .income-layout,
  .scenario-controls {
    grid-template-columns: 1fr;
  }

  .insights-page {
    padding: 0.75rem;
  }

  .insights-header {
    margin-bottom: 0.75rem;
  }

  .insights-header h1 {
    font-size: 1.45rem;
  }

  .subtitle {
    margin-top: 0.25rem;
    font-size: 0.82rem;
    line-height: 1.4;
  }

  .insights-tabs {
    display: flex;
    grid-template-columns: unset;
    overflow-x: auto;
    scroll-snap-type: x proximity;
    -webkit-overflow-scrolling: touch;
    gap: 0.25rem;
    margin-inline: -0.75rem;
    padding-inline: 0.75rem;
  }

  .insights-tabs::-webkit-scrollbar {
    display: none;
  }

  .insights-tabs button {
    flex: 0 0 auto;
    scroll-snap-align: start;
    min-height: 40px;
    padding: 0.45rem 0.55rem;
    font-size: 0.7rem;
    gap: 0.3rem;
  }

  .insights-tabs button i {
    font-size: 1.05rem;
  }

  .tab-body {
    margin-inline: -0.75rem;
    border-right: none;
    border-left: none;
    border-radius: 0;
    padding: 0.75rem;
  }

  .insights-section {
    gap: 0.75rem;
  }

  .metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.55rem;
  }

  .metric-card {
    min-height: 96px;
    padding: 0.65rem;
  }

  .metric-card span {
    font-size: 0.68rem;
    line-height: 1.25;
  }

  .metric-card strong {
    font-size: 1.15rem;
    line-height: 1.15;
    overflow-wrap: anywhere;
  }

  .metric-card small {
    font-size: 0.72rem;
    line-height: 1.3;
  }

  .forecast-panel,
  .contributors-panel,
  .report-card {
    padding: 0.8rem;
  }

  .section-heading h2,
  .report-card h3 {
    font-size: 1rem;
  }

  .section-heading p,
  .report-card p {
    font-size: 0.82rem;
  }

  .month-row {
    flex-direction: column;
    gap: 0.55rem;
    padding: 0.65rem 0;
  }

  .month-tickers {
    justify-content: flex-start;
  }

  .contributor-row {
    gap: 0.65rem;
  }

  .contributor-row > div:first-child {
    min-width: 0;
  }

  .contributor-row > div:first-child span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .right-value {
    flex-shrink: 0;
  }

  .shock-control {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.4rem 0.65rem;
  }

  .shock-control input[type='range'] {
    grid-column: 1 / -1;
    order: 3;
  }
}

@media (max-width: 380px) {
  .metric-grid {
    grid-template-columns: 1fr;
  }
}
</style>
