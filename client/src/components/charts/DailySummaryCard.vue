<script setup>
import {computed, ref, onBeforeUnmount, onMounted, watch} from 'vue'
import {useStorage} from '@vueuse/core'
import DOMPurify from 'dompurify'
import api from '@/composables/useApi'
import {useI18n} from '@/composables/useI18n'
import {useAuthStore} from '@/stores/auth'
import {usePortfolioStore} from '@/stores/portfolio'
import {useWatchlistStore} from '@/stores/watchlist'
import {useTickerLinkify} from '@/composables/useTickerLinkify'

const {t, locale} = useI18n()
const auth = useAuthStore()
const portfolio = usePortfolioStore()
const watchlist = useWatchlistStore()
const {knownTickers} = useTickerLinkify()
const canRefreshSummary = computed(() => !auth.isRegularUser)

function safeHtml(text) {
  if (!text) return ''
  const clean = DOMPurify.sanitize(text, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'b', 'i', 'ul', 'ol', 'li', 'span'],
    ALLOWED_ATTR: [],
  })
  if (!knownTickers.value.size) return clean
  return clean.replace(/<strong>(\^?[A-Z0-9]{1,8}(?:[.-][A-Z0-9]{1,5})?)<\/strong>/g, (_, ticker) => {
    const known = knownTickers.value.get(ticker.toUpperCase())
    if (!known) return `<strong>${ticker}</strong>`
    return `<strong><a class="summary-ticker-link" href="/position/${encodeURIComponent(known)}">${ticker}</a></strong>`
  })
}

const summary = ref('')
const generatedAt = ref(null)
const loading = ref(true)
const refreshing = ref(false)
const errored = ref(false)

// Dismissal is keyed by day so the card reappears with a fresh summary tomorrow.
function todayKey() {
  return new Date().toISOString().split('T')[0]
}
const dismissedDay = useStorage('daily-summary-dismissed-day', '')
const dismissed = ref(dismissedDay.value === todayKey())

function dismiss() {
  dismissedDay.value = todayKey()
  dismissed.value = true
}

function showAgain() {
  dismissedDay.value = ''
  dismissed.value = false
  if (!summary.value && !loading.value) load()
}

async function load(force = false) {
  if (force) refreshing.value = true
  errored.value = false
  try {
    const params = new URLSearchParams({lang: locale.value})
    if (force) params.set('force', 'true')
    const data = await api.get(`/stocks/ai-daily-summary?${params.toString()}`)
    summary.value = data?.summary || ''
    generatedAt.value = data?.generatedAt || null
  } catch {
    errored.value = true
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

function formatTime(value) {
  if (!value) return ''
  return new Date(value).toLocaleTimeString(locale.value === 'ru' ? 'ru-RU' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

onMounted(() => {
  window.addEventListener('daily-summary:show', showAgain)
  load()
  if (!portfolio.positions.length && !portfolio.loading) portfolio.fetchPortfolio().catch(() => {})
  if (!watchlist.items.length) watchlist.fetchWatchlist().catch(() => {})
})

onBeforeUnmount(() => {
  window.removeEventListener('daily-summary:show', showAgain)
})

watch(locale, () => load())
</script>

<template>
  <section v-if="!dismissed" class="summary-card">
    <div class="summary-head">
      <h2 >
        <i class="pi pi-sparkles"/>
        {{ t('dailySummary.title') }}
      </h2>
      <div class="summary-actions">
        <button v-if="canRefreshSummary" :disabled="loading || refreshing" class="summary-refresh" type="button" @click="load(true)">
          <i :class="{'pi-spin': refreshing}" class="pi pi-refresh"/>
        </button>
        <button class="summary-close" type="button" :title="t('dailySummary.dismiss')" @click="dismiss">
          <i class="pi pi-times"/>
        </button>
      </div>
    </div>

    <div v-if="loading" class="summary-skeleton">
      <div class="skeleton-line"/>
      <div class="skeleton-line"/>
      <div class="skeleton-line short"/>
    </div>

    <div v-else-if="errored" class="summary-empty">
      <i class="pi pi-exclamation-triangle"/>
      <span>{{ t('dailySummary.error') }}</span>
    </div>

    <template v-else>
      <div class="summary-text summary-html" v-html="safeHtml(summary)" />
      <span v-if="generatedAt" class="summary-time">{{ t('dailySummary.updatedAt', {time: formatTime(generatedAt)}) }}</span>
    </template>
  </section>
</template>

<style scoped>
.summary-card {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1rem;
  margin-bottom: 0.75rem;
  background: linear-gradient(135deg, rgba(0, 207, 255, 0.06) 0%, rgba(168, 85, 247, 0.06) 100%);
}

.summary-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin: 0;
}

.section-title i {
  color: var(--neon-blue);
}

.summary-actions {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-shrink: 0;
}

.summary-refresh,
.summary-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}

.summary-refresh:hover:not(:disabled) {
  color: var(--neon-blue);
  border-color: var(--neon-blue);
}

.summary-refresh:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.summary-close:hover {
  color: var(--neon-red);
  border-color: var(--neon-red);
}

.summary-text {
  margin: 0;
  color: var(--text-primary);
  font-size: 0.88rem;
  line-height: 1.6;
}

.summary-html :deep(ul) {
  margin: 0;
  padding-left: 1.2rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.summary-html :deep(li) {
  line-height: 1.55;
}

.summary-html :deep(p) {
  margin: 0;
}

.summary-ticker-link,
.summary-html :deep(.summary-ticker-link) {
  color: var(--neon-blue);
  text-decoration: none;
  border-bottom: 1px solid rgba(0, 207, 255, 0.4);
}

.summary-ticker-link:hover,
.summary-html :deep(.summary-ticker-link:hover) {
  border-bottom-color: var(--neon-blue);
}

.summary-time {
  color: var(--text-secondary);
  font-size: 0.72rem;
}

.summary-skeleton {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.skeleton-line {
  height: 12px;
  border-radius: 6px;
  background: linear-gradient(90deg, var(--bg-secondary) 25%, rgba(255,255,255,0.06) 50%, var(--bg-secondary) 75%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.4s ease-in-out infinite;
}

.skeleton-line.short {
  width: 60%;
}

@keyframes skeleton-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.summary-empty {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-secondary);
  font-size: 0.85rem;
}

.summary-empty i {
  color: var(--neon-red);
}
</style>
