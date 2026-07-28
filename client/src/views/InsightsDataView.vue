<script setup>
import {computed, onMounted, ref} from 'vue'
import {useRouter} from 'vue-router'
import api from '@/composables/useApi'
import {usePercent} from '@/composables/useFormat'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'

const router = useRouter()

const loading = ref(false)
const error = ref('')
const data = ref(null)
const ticker = ref('')
const source = ref(null)

const sourceOptions = computed(() => [
  {label: 'All sources', value: null},
  ...(data.value?.sources || []).map((row) => ({
    label: row.source,
    value: row.source,
  })),
])

const summaryCards = computed(() => {
  const s = data.value?.summary || {}
  return [
    {label: 'Articles', value: s.articleCount ?? 0},
    {label: 'Analyzed', value: s.analyzedArticleCount ?? 0},
    {label: 'Pending', value: s.pendingArticleCount ?? 0},
    {label: 'TASE articles', value: s.taseArticleCount ?? 0},
    {label: 'Insight rows', value: s.insightRows ?? 0},
  ]
})

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function sentimentClass(value) {
  if (value == null) return ''
  return value >= 0 ? 'gain' : 'loss'
}

function sentimentText(value) {
  if (value == null) return '-'
  return Number(value).toFixed(2)
}

function queryString() {
  const params = new URLSearchParams()
  if (ticker.value.trim()) params.set('ticker', ticker.value.trim().toUpperCase())
  if (source.value) params.set('source', source.value)
  params.set('limit', '30')
  return params.toString()
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    data.value = await api.get(`/enrich/data/overview?${queryString()}`)
  } catch (err) {
    error.value = err.message || 'Failed to load insights data'
  } finally {
    loading.value = false
  }
}

function clearFilters() {
  ticker.value = ''
  source.value = null
  load()
}

function openTicker(symbol) {
  if (!symbol) return
  router.push(`/position/${encodeURIComponent(symbol)}`)
}

function openArticle(article) {
  if (article?.url) window.open(article.url, '_blank', 'noopener,noreferrer')
}

onMounted(load)
</script>

<template>
  <main class="insights-data-page safe-bottom">
    <header class="page-top">
      <div>
        <p class="eyebrow">stockfolio-insights DB</p>
        <h1>Insights Data</h1>
      </div>
      <Button icon="pi pi-refresh" :loading="loading" rounded text @click="load" />
    </header>

    <section class="filters">
      <div class="filter-field">
        <label>Ticker</label>
        <InputText v-model="ticker" placeholder="POLI.TA, AAPL..." @keydown.enter="load" />
      </div>
      <div class="filter-field">
        <label>Source</label>
        <Select v-model="source" :options="sourceOptions" option-label="label" option-value="value" />
      </div>
      <div class="filter-actions">
        <Button label="Apply" icon="pi pi-filter" size="small" @click="load" />
        <Button label="Clear" icon="pi pi-times" outlined size="small" @click="clearFilters" />
      </div>
    </section>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-else-if="loading && !data" class="text-muted">Loading insights data...</p>

    <template v-if="data">
      <section class="metric-grid">
        <div v-for="card in summaryCards" :key="card.label" class="metric">
          <span>{{ card.label }}</span>
          <strong>{{ card.value }}</strong>
        </div>
      </section>

      <section class="data-grid">
        <div class="panel">
          <h2>Sources</h2>
          <div v-if="data.sources.length" class="stack">
            <div v-for="row in data.sources" :key="row.source" class="list-row">
              <span>{{ row.source }}</span>
              <small>{{ row.analyzed }} analyzed / {{ row.count }} total</small>
            </div>
          </div>
          <p v-else class="empty-note">No sources found.</p>
        </div>

        <div class="panel">
          <h2>Top Tickers</h2>
          <div v-if="data.topTickers.length" class="ticker-cloud">
            <button
              v-for="row in data.topTickers"
              :key="row.ticker"
              type="button"
              @click="openTicker(row.ticker)"
            >
              <span>{{ row.ticker }}</span>
              <small>{{ row.articles }} articles</small>
            </button>
          </div>
          <p v-else class="empty-note">No analyzed ticker tags yet.</p>
        </div>
      </section>

      <section class="panel">
        <h2>Recent Insight Rows</h2>
        <div v-if="data.insights.length" class="table-list">
          <div v-for="row in data.insights" :key="`${row.ticker}-${row.date}`" class="insight-row">
            <button class="ticker-link" type="button" @click="openTicker(row.ticker)">{{ row.ticker }}</button>
            <span>{{ row.date }}</span>
            <span>{{ row.articleCount }} articles</span>
            <span :class="sentimentClass(row.avgSentiment)">Sent {{ sentimentText(row.avgSentiment) }}</span>
            <span :class="sentimentClass(row.momentum)">Mom {{ usePercent(row.momentum) }}</span>
            <small>{{ (row.topThemes || []).join(', ') || 'No themes' }}</small>
          </div>
        </div>
        <p v-else class="empty-note">No TickerInsight rows found.</p>
      </section>

      <section class="panel">
        <h2>Recent Articles</h2>
        <div v-if="data.articles.length" class="article-list">
          <article v-for="article in data.articles" :key="article.url" class="article-row">
            <button class="article-title" type="button" @click="openArticle(article)">
              {{ article.headline }}
            </button>
            <div class="article-meta">
              <span>{{ article.source }}</span>
              <span>{{ formatDate(article.publishedAt) }}</span>
              <span :class="{gain: article.analyzed, loss: !article.analyzed}">
                {{ article.analyzed ? 'analyzed' : 'pending' }}
              </span>
            </div>
            <div v-if="article.tickers?.length" class="chips">
              <button v-for="symbol in article.tickers" :key="symbol" type="button" @click="openTicker(symbol)">
                {{ symbol }}
              </button>
            </div>
            <p v-if="article.llmSummary" class="summary">{{ article.llmSummary }}</p>
          </article>
        </div>
        <p v-else class="empty-note">No articles found.</p>
      </section>

      <section v-if="data.pendingArticles.length" class="panel">
        <h2>Pending Analysis</h2>
        <div class="article-list compact">
          <article v-for="article in data.pendingArticles" :key="article.url" class="article-row">
            <button class="article-title" type="button" @click="openArticle(article)">
              {{ article.headline }}
            </button>
            <div class="article-meta">
              <span>{{ article.source }}</span>
              <span>{{ formatDate(article.publishedAt) }}</span>
            </div>
          </article>
        </div>
      </section>
    </template>
  </main>
</template>

<style scoped>
.insights-data-page {
  padding: 1rem;
  max-width: 1180px;
  margin: 0 auto;
}

.page-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.eyebrow {
  margin: 0 0 0.25rem;
  color: var(--text-secondary);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.page-top h1 {
  margin: 0;
  font-size: 1.45rem;
  color: var(--text-primary);
}

.filters {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  gap: 0.75rem;
  align-items: end;
  margin-bottom: 1rem;
}

.filter-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.filter-field label {
  color: var(--text-secondary);
  font-size: 0.78rem;
}

.filter-actions {
  display: flex;
  gap: 0.5rem;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.65rem;
  margin-bottom: 1rem;
}

.metric,
.panel {
  border: 1px solid var(--border);
  background: rgba(255,255,255,0.03);
  border-radius: 8px;
}

.metric {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.75rem;
}

.metric span,
.empty-note,
.summary {
  color: var(--text-secondary);
}

.metric strong {
  color: var(--text-primary);
  font-size: 1.3rem;
}

.data-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.panel {
  padding: 0.85rem;
  margin-bottom: 0.75rem;
}

.panel h2 {
  margin: 0 0 0.75rem;
  font-size: 0.92rem;
}

.stack,
.article-list,
.table-list {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.list-row,
.insight-row,
.article-row {
  border-top: 1px solid rgba(255,255,255,0.08);
  padding-top: 0.55rem;
}

.list-row {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
}

.list-row small,
.article-meta,
.insight-row small {
  color: var(--text-secondary);
  font-size: 0.74rem;
}

.ticker-cloud,
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.ticker-cloud button,
.chips button,
.ticker-link,
.article-title {
  border: none;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
}

.ticker-cloud button,
.chips button {
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.35rem 0.5rem;
  display: inline-flex;
  gap: 0.4rem;
  align-items: center;
}

.ticker-cloud button:hover,
.chips button:hover,
.ticker-link:hover,
.article-title:hover {
  color: var(--neon-blue);
}

.insight-row {
  display: grid;
  grid-template-columns: 0.9fr 0.8fr 0.8fr 0.8fr 0.8fr 1.4fr;
  gap: 0.5rem;
  align-items: center;
  font-size: 0.82rem;
}

.ticker-link {
  padding: 0;
  text-align: left;
  font-weight: 800;
}

.article-title {
  padding: 0;
  text-align: left;
  font-size: 0.9rem;
  font-weight: 700;
}

.article-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin: 0.35rem 0;
}

.summary {
  margin: 0.4rem 0 0;
  font-size: 0.8rem;
}

.compact .article-row {
  padding-top: 0.4rem;
}

.error {
  color: var(--neon-red);
}

@media (max-width: 760px) {
  .insights-data-page {
    padding: 0.85rem;
  }

  .filters,
  .data-grid,
  .metric-grid,
  .insight-row {
    grid-template-columns: 1fr;
  }

  .filter-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .list-row {
    flex-direction: column;
    gap: 0.2rem;
  }
}
</style>
