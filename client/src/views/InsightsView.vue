<script setup>
import {computed, onMounted, ref} from 'vue'
import {storeToRefs} from 'pinia'
import {useStorage} from '@vueuse/core'
import {usePortfolioStore} from '@/stores/portfolio'
import {gainLossClass, useCurrency, usePercent} from '@/composables/useFormat'
import {useI18n} from '@/composables/useI18n'
import AskPortfolioPanel from '@/components/ui/AskPortfolioPanel.vue'
import PremiumBadge from '@/components/ui/PremiumBadge.vue'

const portfolio = usePortfolioStore()
const {positions, combinedUsd, loading, returnMetrics, riskExposure, dividendFrequencies} = storeToRefs(portfolio)
const {t} = useI18n()

// Only offer the toggle when the portfolio actually mixes USD and ILS
// positions — same persisted key/pattern as PortfolioStatsCard's toggle.
const hasMixedCurrency = computed(() => {
  const currencies = new Set(positions.value.map((p) => (p.ticker?.toUpperCase().endsWith('.TA') ? 'ILS' : 'USD')))
  return currencies.size > 1
})
const displayCurrency = useStorage('holdings-combined-currency', 'ILS')
const activeCurrency = computed(() => (hasMixedCurrency.value ? displayCurrency.value : 'USD'))

function displayAmount(usdValue) {
  if (activeCurrency.value !== 'ILS') return useCurrency(usdValue, 'USD')
  const rate = numberValue(combinedUsd.value?.ilsToUsd)
  if (!rate) return useCurrency(usdValue, 'USD')
  return useCurrency(usdValue / rate, 'ILS')
}

const activeTab = ref('assistant')
const shockPercent = ref(-10)

const tabs = computed(() => [
  {key: 'assistant', icon: 'pi pi-comments', label: t('insights.title')},
])

const assistantStats = computed(() => [
  {
    icon: 'pi pi-briefcase',
    label: t('insights.assistantStats.positions'),
    value: positions.value.length,
  },
  {
    icon: 'pi pi-wallet',
    label: t('insights.assistantStats.value'),
    value: displayAmount(portfolioValueUsd.value),
  },
  {
    icon: 'pi pi-percentage',
    label: t('insights.assistantStats.incomeYield'),
    value: incomeYield.value == null ? '-' : usePercent(incomeYield.value),
    tone: incomeYield.value > 0 ? 'positive' : '',
  },
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

// Fallback when Yahoo's trailing-12mo dividend history doesn't give us
// enough data to detect real cadence — quarterly is the most common payout
// schedule among dividend payers, spread evenly from the current month.
const DEFAULT_DIVIDEND_FREQUENCY = 4

const dividendPositions = computed(() =>
    positions.value
        .map((position) => {
          const annualNative = numberValue(position.dividendRate) * numberValue(position.shares)
          const annualUsd = annualNative * fxRate(position)
          const detected = dividendFrequencies.value[position.ticker?.toUpperCase()]
          const frequency = detected?.frequency || DEFAULT_DIVIDEND_FREQUENCY
          return {
            ...position,
            annualNative,
            annualUsd,
            frequency,
            payoutMonths: detected?.months || null, // real months, when known
            perPaymentNative: annualNative / frequency,
            perPaymentUsd: annualUsd / frequency,
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

// Places each position's estimated payment only in the months matching its
// real payout cadence. When Yahoo's dividend history gives us the actual
// calendar months a ticker has paid in, those are used directly; otherwise
// payments are spaced evenly by frequency starting from the current month.
const forecastMonths = computed(() => {
  const formatter = new Intl.DateTimeFormat(undefined, {month: 'short', year: 'numeric'})
  return Array.from({length: 12}, (_, index) => {
    const date = new Date()
    date.setMonth(date.getMonth() + index)
    const items = dividendPositions.value
        .filter((position) => position.payoutMonths
            ? position.payoutMonths.includes(date.getMonth())
            : index % Math.max(1, Math.round(12 / position.frequency)) === 0)
        .map((position) => ({
          ticker: position.ticker,
          amountUsd: position.perPaymentUsd,
          amountNative: position.perPaymentNative,
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
  if (!Object.keys(dividendFrequencies.value).length) portfolio.fetchDividendFrequencies().catch(() => {
  })
})
</script>

<template>
  <main class="insights-page safe-bottom">
    <header v-if="false" class="assistant-hero">
      <div class="assistant-hero-copy">
        <div class="assistant-title-row">
          <span class="assistant-mark">
            <i class="pi pi-comments"/>
          </span>
          <div>
            <h1>{{ t('insights.title') }}</h1>
            <p>{{ t('insights.subtitle') }}</p>
          </div>
          <PremiumBadge :label="t('common.premium')" :title="t('common.premiumFeature')" compact/>
        </div>
      </div>

      <div v-if="false" class="assistant-context-grid">
        <article v-for="stat in assistantStats" :key="stat.label" class="assistant-context-card">
          <i :class="stat.icon"/>
          <span>{{ stat.label }}</span>
          <strong :class="stat.tone">{{ stat.value }}</strong>
        </article>
      </div>
    </header>

    <header class="insights-header assistant-page-header">
      <h1 class="gradient-title">Assistant AI</h1>
    </header>

    <section class="assistant-chat-shell">
      <div class="assistant-chat-head">
        <div>
          <h2>{{ t('insights.assistantChatTitle') }}</h2>
          <p>{{ t('insights.assistantChatSubtitle') }}</p>
        </div>
      </div>
      <AskPortfolioPanel/>
    </section>

    <section v-if="activeTab === 'income'" class="insights-section">
      <div class="section-heading section-heading-row">
        <h2>{{ t('insights.dividendIncomeTitle') }}</h2>
        <button
            v-if="hasMixedCurrency"
            class="currency-toggle"
            type="button"
            :title="t('dashboard.switchCurrency', {currency: displayCurrency === 'ILS' ? 'USD' : 'ILS'})"
            @click="displayCurrency = displayCurrency === 'ILS' ? 'USD' : 'ILS'"
        >
          {{ displayCurrency === 'ILS' ? '$' : '₪' }}
        </button>
      </div>
      <div class="metric-grid">
        <article class="metric-card metric-card-accent">
          <i class="pi pi-dollar metric-icon"/>
          <span>{{ t('insights.annualIncome') }}</span>
          <strong class="metric-value-glow">{{ displayAmount(annualIncomeUsd) }}</strong>
        </article>
        <article class="metric-card metric-card-accent">
          <i class="pi pi-percentage metric-icon"/>
          <span>{{ t('insights.incomeYield') }}</span>
          <strong :class="incomeYield != null ? gainLossClass(incomeYield) : ''">
            {{ incomeYield == null ? '—' : usePercent(incomeYield) }}
          </strong>
        </article>
        <article class="metric-card metric-card-accent">
          <i class="pi pi-users metric-icon"/>
          <span>{{ t('insights.dividendPayers') }}</span>
          <strong class="metric-value-glow">{{ dividendPositions.length }} / {{ positions.length }}</strong>
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
                <strong>{{ displayAmount(month.totalUsd) }}</strong>
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
              <strong>{{ displayAmount(position.annualUsd) }}</strong>
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
        <article class="metric-card metric-card-accent">
          <i class="pi pi-star-fill metric-icon"/>
          <span>{{ t('insights.largestPosition') }}</span>
          <strong class="metric-value-glow">{{ largestPosition?.ticker || '—' }}</strong>
          <small>{{
              largestPosition ? t('insights.ofPortfolio', {value: usePercent(largestPosition.allocation)}) : '—'
            }}</small>
        </article>
        <article class="metric-card metric-card-accent">
          <i class="pi pi-th-large metric-icon"/>
          <span>{{ t('insights.sectorSpread') }}</span>
          <strong class="metric-value-glow">{{ sectorCount }}</strong>
          <small>{{ t('insights.sectorsTracked', {count: sectorCount}) }}</small>
        </article>
        <article class="metric-card metric-card-accent">
          <i class="pi pi-percentage metric-icon"/>
          <span>{{ t('insights.dividendCoverage') }}</span>
          <strong class="metric-value-glow">{{
              usePercent((dividendPositions.length / positions.length) * 100)
            }}</strong>
          <small>{{
              t('insights.payersOfTotal', {payers: dividendPositions.length, total: positions.length})
            }}</small>
        </article>
        <article class="metric-card metric-card-accent">
          <i class="pi pi-wallet metric-icon"/>
          <span>{{ t('insights.moneyWeightedReturn') }}</span>
          <strong :class="returnMetrics?.irr != null ? gainLossClass(returnMetrics.irr) : ''">
            {{ returnMetrics?.irr == null ? '—' : usePercent(returnMetrics.irr) }}
          </strong>
          <small>{{ t('insights.moneyWeightedReturnHint') }}</small>
        </article>
        <article class="metric-card metric-card-accent">
          <i class="pi pi-chart-line metric-icon"/>
          <span>{{ t('insights.timeWeightedReturn') }}</span>
          <strong :class="returnMetrics?.twr != null ? gainLossClass(returnMetrics.twr) : ''">
            {{ returnMetrics?.twr == null ? '—' : usePercent(returnMetrics.twr) }}
          </strong>
          <small>{{ t('insights.timeWeightedReturnHint') }}</small>
        </article>
        <article class="metric-card metric-card-accent">
          <i class="pi pi-bolt metric-icon"/>
          <span>{{ t('insights.weightedBeta') }}</span>
          <strong class="metric-value-glow">{{
              riskExposure?.weightedBeta == null ? '—' : riskExposure.weightedBeta.toFixed(2)
            }}</strong>
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
          <strong class="loss">{{ shockPercent }}%</strong>
        </div>
        <div v-if="stressTest" class="metric-grid">
          <article class="metric-card metric-card-accent">
            <i class="pi pi-shield metric-icon"/>
            <span>{{ t('insights.projectedValue') }}</span>
            <strong class="metric-value-glow">{{ displayAmount(stressTest.projectedValue) }}</strong>
          </article>
          <article class="metric-card metric-card-accent">
            <i class="pi pi-arrow-down-left metric-icon"/>
            <span>{{ t('insights.projectedChange') }}</span>
            <strong :class="gainLossClass(stressTest.projectedChange)">
              {{ displayAmount(stressTest.projectedChange) }}
            </strong>
          </article>
        </div>
      </div>
    </section>

  </main>
</template>

<style scoped>
.insights-page {
  min-height: 100%;
  padding: 1rem;
  color: var(--text-primary);
  background: var(--bg-primary);
}

.assistant-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(280px, 0.8fr);
  gap: 0.85rem;
  align-items: stretch;
  margin-bottom: 0.85rem;
}

.assistant-hero-copy,
.assistant-context-card {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-secondary);
}

.assistant-hero-copy {
  display: flex;
  align-items: center;
  min-height: 118px;
  padding: 1rem;
  overflow: hidden;
  position: relative;
}

.assistant-hero-copy::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 2px;
  background: linear-gradient(90deg, #00cfff 0%, #a855f7 100%);
  opacity: 0.75;
}

.assistant-title-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
}

.assistant-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--neon-blue);
  background: transparent;
}

.assistant-title-row h1,
.assistant-chat-head h2 {
  margin: 0;
}

.assistant-title-row h1 {
  font-size: 1.1rem;
  font-weight: 800;
  letter-spacing: 0;
}

.assistant-title-row p,
.assistant-chat-head p {
  margin: 0.25rem 0 0;
  color: var(--text-secondary);
  line-height: 1.45;
}

.assistant-context-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.65rem;
}

.assistant-context-card {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 0.4rem;
  min-height: 118px;
  padding: 0.75rem;
  overflow: hidden;
}

.assistant-context-card i {
  position: absolute;
  top: 0.65rem;
  right: 0.7rem;
  color: var(--neon-blue);
  opacity: 0.36;
}

.assistant-context-card span {
  color: var(--text-secondary);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  line-height: 1.2;
  padding-right: 1.2rem;
  text-transform: uppercase;
}

.assistant-context-card strong {
  color: var(--text-primary);
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.1;
  overflow-wrap: anywhere;
}

.assistant-chat-shell {
  position: relative;
  padding: 0;
}

.assistant-chat-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
  padding: 0 0.25rem;
}

.assistant-chat-head h2 {
  color: var(--text-secondary);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.assistant-chat-shell :deep(.ask-chat) {
  max-height: calc(100dvh - 18rem);
}

.assistant-chat-shell :deep(.ask-form textarea) {
  background: var(--bg-primary);
}

.insights-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  margin-bottom: 1.25rem;
}

.insights-header > div {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  width: 100%;
}

.insights-header h1 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 800;
  line-height: 1.15;
  flex-shrink: 0;
}

.section-heading-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.currency-toggle {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}

.currency-toggle:hover {
  border-color: var(--neon-blue);
  color: var(--neon-blue);
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
  display: flex;
  gap: 0.5rem;
  margin: 0;
}

.insights-tabs button {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  gap: 0.35rem;
  min-height: 36px;
  padding: 0.35rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-secondary);
  font-size: 0.78rem;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: color 0.2s, background 0.2s, border-color 0.2s;
}

.insights-tabs button:hover {
  color: var(--text-primary);
  border-color: var(--neon-blue);
}

.insights-tabs button.active {
  color: var(--neon-blue);
  background: rgba(0, 207, 255, 0.1);
  border-color: var(--neon-blue);
}

.insights-tabs button.active i {
  filter: none;
}

.report-card button {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  cursor: pointer;
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

.overview-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
  margin-top: 1.5rem;
}

.overview-card {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1.25rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-secondary);
  transition: border-color 0.2s, box-shadow 0.2s;
}

.overview-card:hover {
  border-color: var(--neon-blue);
  box-shadow: 0 4px 16px rgba(0, 207, 255, 0.08);
}

.overview-card i {
  font-size: 1.75rem;
  color: var(--neon-blue);
}

.overview-card h3 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-primary);
}

.overview-card p {
  margin: 0;
  font-size: 0.78rem;
  color: var(--text-secondary);
  line-height: 1.5;
}

.overview-btn {
  align-self: flex-start;
  padding: 0.5rem 1rem;
  border: 1px solid var(--neon-blue);
  border-radius: 6px;
  background: rgba(0, 207, 255, 0.1);
  color: var(--neon-blue);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}

.overview-btn:hover {
  background: var(--neon-blue);
  color: var(--bg-primary);
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
}

.metric-card,
.forecast-panel,
.contributors-panel,
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
  position: relative;
  overflow: hidden;
  transition: border-color 0.2s, transform 0.15s, box-shadow 0.2s;
}

.metric-card:hover {
  border-color: rgba(0, 207, 255, 0.35);
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0, 207, 255, 0.08);
}

.metric-card-accent::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, #00cfff 0%, #a855f7 100%);
  opacity: 0.5;
  transition: opacity 0.2s;
}

.metric-card-accent:hover::before {
  opacity: 1;
}

.metric-icon {
  position: absolute;
  top: 0.55rem;
  right: 0.6rem;
  color: var(--neon-blue);
  font-size: 0.95rem;
  opacity: 0.35;
}

.metric-value-glow {
  background: linear-gradient(135deg, #f8fafc 0%, #cbd5e1 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.metric-card span {
  color: var(--text-secondary);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding-right: 1.3rem;
}

.metric-card strong {
  font-size: 1.15rem;
  font-weight: 700;
  line-height: 1.15;
}

.income-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(260px, 0.9fr);
  gap: 0.75rem;
  max-height: calc(100dvh - 20rem);
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
  padding-right: 0.25rem;
  scrollbar-gutter: stable;
  overscroll-behavior: contain;
}

.forecast-panel,
.contributors-panel,
.report-card {
  padding: 0.85rem;
}

.section-heading h2,
.report-card h3 {
  margin: 0;
  padding-left: 0.65rem;
  border-left: 3px solid transparent;
  border-image: linear-gradient(180deg, #00cfff 0%, #a855f7 100%) 1;
  font-size: 0.95rem;
  font-weight: 700;
}

.section-heading p,
.report-card p {
  margin: 0.35rem 0 0;
  font-size: 0.78rem;
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
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0;
  border-top: 1px solid var(--border);
}

.month-total,
.contributor-row > div,
.right-value {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.month-total span {
  font-size: 0.72rem;
  font-weight: 600;
}

.month-total strong {
  font-size: 0.85rem;
  font-weight: 700;
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
  font-size: 0.72rem;
  font-weight: 600;
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
  font-size: 0.78rem;
  font-weight: 600;
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
  font-size: 0.78rem;
  font-weight: 600;
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
  font-size: 0.78rem;
  font-weight: 600;
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
  .assistant-hero {
    grid-template-columns: 1fr;
    gap: 0.65rem;
  }

  .assistant-hero-copy {
    min-height: 106px;
    padding: 0.85rem;
  }

  .assistant-title-row {
    align-items: flex-start;
    gap: 0.65rem;
  }

  .assistant-title-row h1 {
    font-size: 1.1rem;
  }

  .assistant-title-row p,
  .assistant-chat-head p {
    font-size: 0.82rem;
  }

  .assistant-context-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.5rem;
  }

  .assistant-context-card:last-child {
    grid-column: 1 / -1;
  }

  .assistant-context-card {
    min-height: 86px;
    padding: 0.6rem;
  }

  .assistant-context-card span {
    font-size: 0.6rem;
  }

  .assistant-context-card strong {
    font-size: 0.92rem;
  }

  .assistant-chat-shell {
    padding: 0;
  }

  .assistant-chat-shell :deep(.ask-chat) {
    max-height: 58vh;
  }

  .overview-grid {
    grid-template-columns: 1fr;
  }

  .income-layout {
    grid-template-columns: 1fr;
  }

  .insights-page {
    padding: 0.75rem;
  }

  .insights-header {
    flex-direction: column;
    align-items: flex-start;
    margin-bottom: 0.75rem;
  }

  .insights-header > div {
    align-items: flex-start;
    gap: 0.75rem;
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
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    gap: 0.35rem;
    padding-right: 0.25rem;
  }

  .insights-tabs::-webkit-scrollbar {
    height: 4px;
  }

  .insights-tabs::-webkit-scrollbar-track {
    background: transparent;
  }

  .insights-tabs::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 2px;
  }

  .insights-tabs button {
    min-height: 36px;
    padding: 0.35rem 0.65rem;
    font-size: 0.72rem;
  }

  .insights-tabs button i {
    font-size: 0.95rem;
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
    font-size: 1rem;
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
    padding: 0.6rem;
  }

  .section-heading h2,
  .report-card h3 {
    font-size: 0.9rem;
  }

  .section-heading p,
  .report-card p {
    font-size: 0.78rem;
  }

  .month-row {
    gap: 0.5rem;
    padding: 0.45rem 0;
  }

  .month-total {
    flex-shrink: 0;
  }

  .month-tickers {
    justify-content: flex-end;
  }

  .month-tickers span {
    padding: 0.15rem 0.35rem;
    font-size: 0.68rem;
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
