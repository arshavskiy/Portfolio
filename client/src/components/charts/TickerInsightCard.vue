<script setup>
import {computed, onMounted, ref, watch} from 'vue'
import Tag from 'primevue/tag'
import api from '@/composables/useApi'
import {useI18n} from '@/composables/useI18n'
import NewsArticleCard from '@/components/charts/NewsArticleCard.vue'
import AppLoader from '@/components/ui/AppLoader.vue'

const props = defineProps({
  ticker: {type: String, required: true},
})

const {t} = useI18n()

function formatShareCount(n) {
  const abs = Math.abs(n)
  if (abs >= 1e6) return `${(abs / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `${(abs / 1e3).toFixed(1)}K`
  return `${abs}`
}

function formatUsd(n) {
  if (n == null) return null
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`
  return `${sign}$${abs}`
}

const data = ref(null)
const loading = ref(false)
const error = ref('')

const STYLE_LABEL = {
  growth: 'growth', value: 'value', blend: 'blend', speculative: 'speculative', unknown: null,
}
const CAP_LABEL = {
  mega: 'mega-cap', large: 'large-cap', mid: 'mid-cap', small: 'small-cap', micro: 'micro-cap', unknown: null,
}

const typologyTags = computed(() => {
  const typo = data.value?.typology
  if (!typo) return []
  return [
    CAP_LABEL[typo.marketCapClass] && {label: CAP_LABEL[typo.marketCapClass], warn: false},
    STYLE_LABEL[typo.style] && {label: STYLE_LABEL[typo.style], warn: false},
    typo.volatilityClass === 'high' && {label: 'high-beta', warn: false},
    typo.volatilityClass === 'low' && {label: 'defensive', warn: false},
    ...(typo.tags || [])
        .filter((tg) => !['high-beta', 'defensive'].includes(tg) && !tg.endsWith('-cap') && !['growth', 'value', 'blend', 'speculative'].includes(tg))
        .map((tg) => ({label: tg.replace(/-/g, ' '), warn: tg.includes('selling') || tg.includes('squeeze')})),
  ].filter(Boolean)
})

const insiderSignalClass = computed(() => {
  const net = data.value?.summary?.insiderNet3m
  if (net == null) return ''
  return net < 0 ? 'loss' : net > 0 ? 'gain' : ''
})

const beatRateText = computed(() => {
  const br = data.value?.summary?.beatRate
  if (!br) return null
  return `${br.beats} / ${br.of}`
})

const analystDeltaText = computed(() => {
  const d = data.value?.summary?.analystDelta
  if (d == null) return null
  return d > 0 ? `+${d}` : `${d}`
})

const nextEventText = computed(() => {
  const days = data.value?.summary?.daysToNextEvent
  const ev = data.value?.nextEvent
  if (days == null || !ev) return null
  const when = ev.hour === 'amc' ? t('tickerInsight.afterClose') : ev.hour === 'bmo' ? t('tickerInsight.beforeOpen') : ''
  return {
    days,
    label: ev.type === 'earnings' ? t('tickerInsight.earnings') : ev.type,
    detail: [formatEventDate(ev.date), when].filter(Boolean).join(' · '),
  }
})

// Official Federal Reserve source — FOMC statements/decisions always land here.
// MacroEvent has no per-event URL (static seeded calendar), so this is the one
// stable link worth hardcoding rather than a field from the payload.
const FOMC_INFO_URL = 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm'

const nextMacroText = computed(() => {
  const macro = data.value?.summary?.nextMacro
  if (!macro) return null
  return {
    label: macro.label,
    detail: formatEventDate(macro.date),
    url: /fomc/i.test(macro.label) ? FOMC_INFO_URL : null,
  }
})

const fundamentalsRows = computed(() => {
  const f = data.value?.fundamentals
  if (!f) return []
  const pick = (concept) => f[concept]?.annual ?? f[concept]?.quarterly ?? null
  const rows = [
    {key: 'revenue', label: t('tickerInsight.revenue'), fact: pick('Revenues'), format: formatUsd},
    {key: 'netIncome', label: t('tickerInsight.netIncome'), fact: pick('NetIncomeLoss'), format: formatUsd},
    {key: 'eps', label: t('tickerInsight.eps'), fact: pick('EarningsPerShareDiluted'), format: (v) => `$${v.toFixed(2)}`},
    {key: 'assets', label: t('tickerInsight.assets'), fact: pick('Assets'), format: formatUsd},
    {key: 'liabilities', label: t('tickerInsight.liabilities'), fact: pick('Liabilities'), format: formatUsd},
    {key: 'equity', label: t('tickerInsight.equity'), fact: pick('StockholdersEquity'), format: formatUsd},
    {key: 'operatingCashFlow', label: t('tickerInsight.operatingCashFlow'), fact: pick('NetCashProvidedByUsedInOperatingActivities'), format: formatUsd},
    {key: 'longTermDebt', label: t('tickerInsight.longTermDebt'), fact: pick('LongTermDebtNoncurrent'), format: formatUsd},
  ]
  return rows.filter((r) => r.fact?.value != null)
})

const macroSnapshot = ref(null)

const macroRows = computed(() => {
  const series = macroSnapshot.value?.series
  if (!series) return []
  const rows = [
    {key: 'fedFunds', label: t('tickerInsight.fedFunds'), info: t('tickerInsight.fedFundsInfo'), point: series.FEDFUNDS, format: (v) => `${v.toFixed(2)}%`},
    {key: 'cpiYoy', label: t('tickerInsight.cpiYoy'), info: t('tickerInsight.cpiYoyInfo'), point: series.CPIAUCSL, format: (v) => `${v.toFixed(1)}%`},
    {key: 'corePceYoy', label: t('tickerInsight.corePceYoy'), info: t('tickerInsight.corePceYoyInfo'), point: series.PCEPILFE, format: (v) => `${v.toFixed(1)}%`},
    {key: 'unemployment', label: t('tickerInsight.unemployment'), info: t('tickerInsight.unemploymentInfo'), point: series.UNRATE, format: (v) => `${v.toFixed(1)}%`},
    {key: 'treasury10y', label: t('tickerInsight.treasury10y'), info: t('tickerInsight.treasury10yInfo'), point: series.DGS10, format: (v) => `${v.toFixed(2)}%`},
  ]
  return rows.filter((r) => r.point?.value != null)
})

async function loadMacroSnapshot() {
  if (macroSnapshot.value) return // global, not ticker-specific — fetch once per component lifetime
  try {
    macroSnapshot.value = await api.get('/enrich/macro-snapshot')
  } catch {
    macroSnapshot.value = null
  }
}

function formatEventDate(value) {
  if (!value) return ''
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return ''
  return dt.toLocaleDateString('en-US', {month: 'short', day: 'numeric'})
}

function mapHeadline(h) {
  return {
    title: h.headline,
    summary: h.llmSummary,
    url: h.url,
    publishedAt: h.publishedAt,
    symbols: [props.ticker],
  }
}

const newsArticles = ref([])
const newsPage = ref(1)
const newsHasMore = ref(false)
const newsLoadingMore = ref(false)
const headlines = computed(() => newsArticles.value.map(mapHeadline))

const hasAnySentimentData = computed(() => data.value?.summary?.sentiment != null || data.value?.summary?.momentum != null)
const analyzedArticleCount = computed(() => data.value?.summary?.articleCount7d ?? 0)

async function loadNews({loadMore = false} = {}) {
  if (loadMore) newsLoadingMore.value = true
  const page = loadMore ? newsPage.value + 1 : 1
  try {
    const result = await api.get(`/enrich/news/${encodeURIComponent(props.ticker)}?page=${page}&limit=10`)
    const articles = Array.isArray(result?.articles) ? result.articles : []
    newsArticles.value = loadMore ? [...newsArticles.value, ...articles] : articles
    newsPage.value = page
    newsHasMore.value = Boolean(result?.hasMore)
  } catch {
    if (!loadMore) newsArticles.value = []
    newsHasMore.value = false
  } finally {
    newsLoadingMore.value = false
  }
}

function loadMoreNews() {
  if (newsLoadingMore.value || !newsHasMore.value) return
  loadNews({loadMore: true})
}

const INFO = computed(() => ({
  card: t('tickerInsight.cardInfo'),
  momentum: t('tickerInsight.momentumInfo'),
  beatRate: t('tickerInsight.beatRateInfo'),
  analystTrend: t('tickerInsight.analystTrendInfo'),
  insiderActivity: t('tickerInsight.insiderActivityInfo'),
  daysToCover: t('tickerInsight.daysToCoverInfo'),
  fundamentals: t('tickerInsight.fundamentalsInfo'),
  macroContext: t('tickerInsight.macroContextInfo'),
}))

async function load() {
  loading.value = true
  error.value = ''
  newsArticles.value = []
  newsPage.value = 1
  newsHasMore.value = false
  try {
    data.value = await api.get(`/enrich/${encodeURIComponent(props.ticker)}`)
  } catch (err) {
    error.value = err.message || 'Failed to load insights'
    data.value = null
  } finally {
    loading.value = false
  }
  loadNews()
}

function openArticle(article) {
  if (!article?.url) return
  window.open(article.url, '_blank', 'noopener,noreferrer')
}

onMounted(() => {
  load()
  loadMacroSnapshot()
})
watch(() => props.ticker, load)
</script>

<template>
  <div v-if="loading" class="insight-card insight-loading">
    <div class="skeleton-line" style="width: 60%"/>
    <div class="skeleton-line" style="width: 40%"/>
  </div>

  <div v-else-if="error" class="insight-card insight-error text-muted">
    <i class="pi pi-exclamation-triangle"/> {{ error }}
  </div>

  <div v-else-if="data" class="insight-card">
    <div class="insight-head">
      <div class="insight-head-row">
        <h2 class="section-title insight-title">
          <i class="pi pi-compass"/> {{ t('tickerInsight.title') }}
          <i v-tooltip.focus.top="INFO.card" class="pi pi-info-circle info-icon" tabindex="0"/>
        </h2>
        <span v-if="hasAnySentimentData" v-tooltip.focus.top="INFO.momentum" :class="{up: data.summary.momentum > 0, down: data.summary.momentum < 0}"
              class="sentiment-pill" tabindex="0">
          <span class="dot"/>
          {{ t('tickerInsight.momentum') }} {{
            data.summary.momentum > 0 ? '+' : ''
          }}{{ data.summary.momentum?.toFixed(2) }}
        </span>
        <span v-else class="sentiment-pill muted">
          <span class="dot"/>
          {{ t('tickerInsight.noCoverage') }}
        </span>
      </div>

      <div v-if="typologyTags.length" class="tag-row">
        <Tag v-for="tag in typologyTags" :key="tag.label" :severity="tag.warn ? 'warn' : undefined" :value="tag.label"/>
      </div>
    </div>

    <div class="insight-stats">
      <div v-if="beatRateText" class="insight-stat">
        <span class="text-muted stat-label-info">{{ t('tickerInsight.beatRate') }}
          <i v-tooltip.focus.top="INFO.beatRate" class="pi pi-info-circle info-icon" tabindex="0"/></span>
        <span class="gain">{{ beatRateText }} <span class="sub">{{ t('tickerInsight.lastQuarters') }}</span></span>
      </div>
      <div v-if="analystDeltaText" class="insight-stat">
        <span class="text-muted stat-label-info">{{ t('tickerInsight.analystTrend') }}
          <i v-tooltip.focus.top="INFO.analystTrend" class="pi pi-info-circle info-icon" tabindex="0"/></span>
        <span :class="data.summary.analystDelta > 0 ? 'gain' : data.summary.analystDelta < 0 ? 'loss' : ''">
          {{ analystDeltaText }} <span class="sub">{{ t('tickerInsight.buyRated') }}</span>
        </span>
      </div>
      <div v-if="data.summary.insiderNet3m != null" class="insight-stat">
        <span class="text-muted stat-label-info">{{ t('tickerInsight.insiderActivity') }}
          <i v-tooltip.focus.top="INFO.insiderActivity" class="pi pi-info-circle info-icon" tabindex="0"/></span>
        <span :class="insiderSignalClass">
          {{ data.summary.insiderNet3m > 0 ? '+' : '-' }}{{
            formatShareCount(data.summary.insiderNet3m)
          }} {{ t('tickerInsight.shares') }}
        </span>
      </div>
      <div v-if="data.summary.daysToCover != null" class="insight-stat">
        <span class="text-muted stat-label-info">{{ t('tickerInsight.daysToCover') }}
          <i v-tooltip.focus.top="INFO.daysToCover" class="pi pi-info-circle info-icon" tabindex="0"/></span>
        <span :class="data.summary.daysToCover >= 4 ? 'loss' : ''">{{ data.summary.daysToCover.toFixed(1) }}</span>
      </div>
    </div>

    <div v-if="nextEventText || nextMacroText" class="upcoming">
      <div v-if="nextEventText" class="upcoming-row">
        <span :class="{soon: nextEventText.days <= 14}"
              class="upcoming-badge">{{ t('tickerInsight.inDays', {n: nextEventText.days}) }}</span>
        <span class="upcoming-text">{{ nextEventText.label }} <span class="text-muted">· {{
            nextEventText.detail
          }}</span></span>
      </div>
      <div v-if="nextMacroText" class="upcoming-row">
        <span class="upcoming-badge">{{ t('tickerInsight.macro') }}</span>
        <span class="upcoming-text">
          <a v-if="nextMacroText.url" :href="nextMacroText.url" class="upcoming-link" rel="noopener noreferrer" target="_blank">{{ nextMacroText.label }}</a>
          <template v-else>{{ nextMacroText.label }}</template>
          <span class="text-muted">· {{ nextMacroText.detail }}</span>
        </span>
      </div>
    </div>

    <div v-if="fundamentalsRows.length" class="fundamentals-block">
      <span class="text-muted stat-label-info fundamentals-title">{{ t('tickerInsight.fundamentals') }}
        <i v-tooltip.focus.top="INFO.fundamentals" class="pi pi-info-circle info-icon" tabindex="0"/></span>
      <div class="fundamentals-row">
        <div v-for="row in fundamentalsRows" :key="row.key" class="fundamentals-cell">
          <span class="text-muted sub">{{ row.label }}</span>
          <span class="fundamentals-value">{{ row.format(row.fact.value) }}</span>
          <span class="text-muted fundamentals-period">{{ row.fact.period }}</span>
        </div>
      </div>
    </div>

    <div v-if="headlines.length" class="insight-headlines">
      <NewsArticleCard v-for="h in headlines" :key="h.url" :article="h" @open="openArticle"/>
      <button
          v-if="newsHasMore"
          :disabled="newsLoadingMore"
          class="news-load-more"
          type="button"
          @click="loadMoreNews"
      >
        <AppLoader v-if="newsLoadingMore"/>
        <span v-else>{{ t('newsPage.loadMore') }}</span>
      </button>
    </div>
    <p v-else-if="analyzedArticleCount === 0" class="pending-note text-muted">
      <i class="pi pi-clock"/> {{ t('tickerInsight.pendingAnalysis') }}
    </p>

    <p class="insight-disclaimer text-muted">{{ t('tickerInsight.disclaimer') }}</p>
  </div>
</template>

<style scoped>
.insight-card {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-secondary, #111111);
  margin: 1rem 0;
  overflow: hidden;
}

.stat-label-info {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}

.info-icon {
  font-size: 0.72rem;
  opacity: 0.55;
  cursor: pointer;
}

.info-icon:hover {
  opacity: 1;
  color: var(--accent);
}

.info-icon:focus {
  opacity: 1;
  color: var(--accent);
  outline: none;
}

.insight-loading {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.insight-error {
  padding: 1rem 0.95rem;
  font-size: 0.82rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.skeleton-line {
  height: 1rem;
  border-radius: 6px;
  background: linear-gradient(90deg, var(--border) 25%, #333 50%, var(--border) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.insight-head {
  padding: 0.85rem 0.95rem 0.7rem;
  border-bottom: 1px solid var(--border);
}

.insight-head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  flex-wrap: wrap;
  margin-bottom: 0.55rem;
}

.insight-title {
  font-size: 0.9rem;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.insight-title > .pi-compass {
  color: var(--accent);
  font-size: 0.85rem;
}

.sentiment-pill {
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.22rem 0.55rem;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  border: 1px solid var(--border);
  color: var(--text-secondary);
  background: rgba(148, 163, 184, 0.06);
  cursor: default;
}

.sentiment-pill .dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: currentColor;
}

.sentiment-pill.up {
  color: var(--neon-green);
  background: rgba(0, 255, 136, 0.06);
}

.sentiment-pill.down {
  color: var(--neon-red);
  background: rgba(255, 51, 102, 0.06);
}

.sentiment-pill.muted {
  color: var(--text-secondary);
}

.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.insight-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
}

.insight-stat {
  padding: 0.6rem 0.95rem;
  border-bottom: 1px solid var(--border);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.insight-stat:nth-child(2n) {
  border-right: none;
}

.insight-stat:nth-last-child(-n+2) {
  border-bottom: none;
}

.insight-stat .sub {
  font-size: 0.7rem;
  color: var(--text-secondary);
  font-weight: 500;
}

.insight-stat > span:last-child {
  font-size: 0.9rem;
  font-weight: 700;
}

.upcoming {
  padding: 0.7rem 0.95rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  border-bottom: 1px solid var(--border);
}

.upcoming-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.upcoming-badge {
  font-size: 0.68rem;
  font-weight: 700;
  padding: 0.2rem 0.45rem;
  border-radius: 6px;
  background: rgba(148, 163, 184, 0.08);
  color: var(--text-secondary);
  border: 1px solid var(--border);
  white-space: nowrap;
}

.upcoming-badge.soon {
  background: rgba(251, 191, 36, 0.12);
  color: var(--gold);
  border-color: rgba(251, 191, 36, 0.28);
}

.upcoming-text {
  font-size: 0.82rem;
}

.upcoming-link {
  color: inherit;
  text-decoration: underline;
  text-decoration-color: var(--border);
  text-underline-offset: 2px;
}

.upcoming-link:hover {
  color: var(--neon-blue);
  text-decoration-color: currentColor;
}

.fundamentals-block,
.macro-strip {
  padding: 0.6rem 0.95rem;
  border-bottom: 1px solid var(--border);
}

.fundamentals-title,
.macro-strip-title {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  margin-bottom: 0.45rem;
}

.fundamentals-row,
.macro-strip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.9rem;
}

.fundamentals-cell,
.macro-strip-cell {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 4.5rem;
}

.fundamentals-cell .sub,
.macro-strip-cell .sub {
  font-size: 0.68rem;
}

.fundamentals-value,
.macro-strip-value {
  font-size: 0.88rem;
  font-weight: 700;
}

.fundamentals-period {
  font-size: 0.65rem;
}

.insight-headlines {
  padding: 0.7rem 0.95rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.news-load-more {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 42px;
  margin-top: 0.25rem;
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.5rem;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}

.news-load-more:hover:not(:disabled) {
  color: var(--neon-blue);
  border-color: var(--neon-blue);
}

.news-load-more:disabled {
  cursor: not-allowed;
}

.pending-note {
  padding: 0.65rem 0.95rem;
  font-size: 0.78rem;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0;
}

.insight-disclaimer {
  font-size: 0.68rem;
  padding: 0.65rem 0.95rem;
  border-top: 1px solid var(--border);
  line-height: 1.4;
  margin: 0;
}
</style>
