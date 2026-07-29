<script setup>
import {computed, ref, watch} from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import api from '@/composables/useApi'
import AppLoader from '@/components/ui/AppLoader.vue'
import {useI18n} from '@/composables/useI18n'

const props = defineProps({
  visible: Boolean,
  ticker: {type: String, default: ''},
})
const emit = defineEmits(['update:visible'])

const {t} = useI18n()

const loading = ref(false)
const error = ref('')
const articles = ref([])
const page = ref(1)
const hasMore = ref(false)
const loadingMore = ref(false)

const SOURCE_META = {
  yahoo: {label: 'Yahoo Finance', icon: 'pi pi-chart-line'},
  finnhub: {label: 'Finnhub', icon: 'pi pi-database'},
  'globes-capital-market': {label: 'Globes', icon: 'pi pi-globe'},
  'globes-all': {label: 'Globes', icon: 'pi pi-globe'},
  'bizportal-analyst-tags': {label: 'Bizportal', icon: 'pi pi-briefcase'},
  'bizportal-capital-market': {label: 'Bizportal', icon: 'pi pi-briefcase'},
}

function sourceMeta(rawSource) {
  const key = String(rawSource || '').replace(/^(rss|html):/, '')
  return SOURCE_META[key] || {label: rawSource || '', icon: 'pi pi-file'}
}

const headlines = computed(() => articles.value.map((a) => ({
  title: a.headline,
  url: a.url,
  publishedAt: a.publishedAt,
  source: sourceMeta(a.source),
})))

function fmtDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('en-US', {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'})
}

async function load({loadMore = false} = {}) {
  if (loadMore) loadingMore.value = true
  else {
    loading.value = true
    error.value = ''
  }
  const nextPage = loadMore ? page.value + 1 : 1
  try {
    const result = await api.get(`/enrich/news/${encodeURIComponent(props.ticker)}?page=${nextPage}&limit=10`)
    const items = Array.isArray(result?.articles) ? result.articles : []
    articles.value = loadMore ? [...articles.value, ...items] : items
    page.value = nextPage
    hasMore.value = Boolean(result?.hasMore)
  } catch (err) {
    if (!loadMore) {
      articles.value = []
      error.value = err.message || t('xray.articlesLoadFailed')
    }
    hasMore.value = false
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

function loadMoreArticles() {
  if (loadingMore.value || !hasMore.value) return
  load({loadMore: true})
}

watch(() => props.visible, (v) => {
  if (v && props.ticker) load()
})
</script>

<template>
  <Dialog
      :draggable="false"
      :visible="visible"
      class="articles-modal"
      modal
      @update:visible="(v) => emit('update:visible', v)"
  >
    <template #header>
      <span class="modal-title">{{ ticker }} <span class="text-muted">{{ t('xray.articlesModalTitle') }}</span></span>
    </template>

    <div v-if="loading" class="loading-state">
      <AppLoader/>
    </div>

    <p v-else-if="error" class="error-state">
      <i class="pi pi-exclamation-triangle"/>
      {{ error }}
    </p>

    <div v-else-if="!headlines.length" class="empty-state text-muted">
      <p>{{ t('xray.noArticlesFound', {ticker}) }}</p>
      <p class="empty-hint">{{ t('xray.noArticlesHint') }}</p>
    </div>

    <div v-else class="articles-list">
      <a
          v-for="h in headlines"
          :key="h.url"
          :href="h.url"
          class="article-link"
          rel="noopener noreferrer"
          target="_blank"
      >
        <span class="article-link-title">{{ h.title }}</span>
        <span class="article-link-meta">
          <span v-if="h.source?.label" class="source-pill">
            <i :class="h.source.icon"/>
            {{ h.source.label }}
          </span>
          <span v-if="fmtDate(h.publishedAt)" class="text-muted">{{ fmtDate(h.publishedAt) }}</span>
        </span>
      </a>
      <Button
          v-if="hasMore"
          :disabled="loadingMore"
          class="load-more"
          text
          @click="loadMoreArticles"
      >
        <AppLoader v-if="loadingMore"/>
        <span v-else>{{ t('newsPage.loadMore') }}</span>
      </Button>
    </div>
  </Dialog>
</template>

<style scoped>
.modal-title {
  font-size: 1rem;
}

.loading-state,
.error-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-height: 120px;
  text-align: center;
}

.error-state {
  color: var(--red, #ef4444);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  min-height: 120px;
  text-align: center;
}

.empty-hint {
  font-size: 0.78rem;
  opacity: 0.8;
}

.articles-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  max-height: 70vh;
  overflow-y: auto;
}

.article-link {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.6rem 0.1rem;
  border-bottom: 1px solid var(--border);
  color: var(--neon-blue);
  text-decoration: none;
}

.article-link:hover .article-link-title {
  text-decoration: underline;
}

.article-link-title {
  color: var(--text-primary);
  font-size: 0.9rem;
  line-height: 1.35;
}

.article-link-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.72rem;
}

.source-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0.12rem 0.5rem;
  color: var(--text-secondary);
  font-size: 0.68rem;
  line-height: 1.4;
}

.source-pill i {
  font-size: 0.68rem;
}

.load-more {
  align-self: center;
}
</style>

<style>
.articles-modal {
  width: 92vw;
  max-width: 520px;
}
</style>
