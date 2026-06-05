<script setup>
import {computed, onMounted, ref} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import Button from 'primevue/button'
import api from '@/composables/useApi'

const route = useRoute()
const router = useRouter()
const article = ref(null)
const loading = ref(false)
const error = ref('')

const publishedAt = computed(() => {
  if (!article.value?.publishedAt) return ''
  const date = new Date(article.value.publishedAt)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
})

function loadFallback() {
  const raw = sessionStorage.getItem(`news-article:${route.params.id}`)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function loadArticle() {
  loading.value = true
  error.value = ''
  article.value = loadFallback()

  try {
    const data = await api.get(`/stocks/news/article/${encodeURIComponent(route.params.id)}`)
    article.value = data.article
  } catch (err) {
    if (!article.value) error.value = err.message || 'Article not found'
  } finally {
    loading.value = false
  }
}

function openOriginal() {
  if (!article.value?.url) return
  window.open(article.value.url, '_blank', 'noopener,noreferrer')
}

onMounted(loadArticle)
</script>

<template>
  <div class="article-page safe-bottom">
    <header class="article-nav">
      <Button icon="pi pi-arrow-left" rounded text @click="router.back()" />
      <Button
        v-if="article?.url"
        icon="pi pi-external-link"
        rounded
        text
        @click="openOriginal"
      />
    </header>

    <div v-if="loading && !article" class="article-shell skeleton" />

    <div v-else-if="error" class="empty">
      <i class="pi pi-exclamation-triangle" />
      <p>{{ error }}</p>
      <Button label="Back to News" outlined @click="router.push('/news')" />
    </div>

    <article v-else-if="article" class="article-shell">
      <div class="article-glow" />

      <div class="article-meta">
        <span class="source">{{ article.source || 'Market News' }}</span>
        <span v-if="publishedAt" class="text-muted">{{ publishedAt }}</span>
      </div>

      <h1>{{ article.title }}</h1>

      <div v-if="article.tags?.length" class="tag-row">
        <span v-for="tag in article.tags" :key="tag" class="topic-pill">{{ tag }}</span>
      </div>

      <div v-if="article.symbols?.length" class="symbol-row">
        <span v-for="symbol in article.symbols" :key="symbol" class="symbol-pill">{{ symbol }}</span>
      </div>

      <p v-if="article.summary" class="summary text-muted">{{ article.summary }}</p>

      <div class="article-actions">
        <Button icon="pi pi-external-link" label="Open original" outlined @click="openOriginal" />
      </div>
    </article>
  </div>
</template>

<style scoped>
.article-page {
  padding: 1rem;
}

.article-nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.article-shell {
  position: relative;
  overflow: hidden;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 1.1rem 1.15rem;
}

.article-glow {
  position: absolute;
  top: 0;
  left: 0;
  width: 3px;
  height: 100%;
  background: linear-gradient(180deg, var(--neon-blue), #a855f7, var(--neon-red));
}

.article-meta {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: center;
  margin-bottom: 0.7rem;
  font-size: 0.72rem;
}

.source {
  min-width: 0;
  color: var(--neon-blue);
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

h1 {
  color: var(--text-primary);
  font-size: 1.35rem;
  line-height: 1.2;
  margin: 0;
}

.summary {
  font-size: 0.95rem;
  line-height: 1.55;
  margin-top: 1rem;
}

.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.85rem;
}

.topic-pill {
  border: 1px solid rgba(0, 207, 255, 0.35);
  border-radius: 999px;
  color: var(--neon-blue);
  padding: 2px 8px;
  font-size: 0.72rem;
  font-weight: 800;
}

.symbol-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.5rem;
}

.symbol-pill {
  border: 1px solid rgba(0, 255, 136, 0.35);
  border-radius: 6px;
  color: var(--neon-green);
  padding: 2px 7px;
  font-size: 0.72rem;
  font-weight: 800;
}

.article-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 1.25rem;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 3rem 1rem;
  color: var(--text-secondary);
  text-align: center;
}

.empty i {
  font-size: 2.4rem;
}

.skeleton {
  height: 280px;
  background: linear-gradient(90deg, var(--bg-card) 25%, #1a1a1a 50%, var(--bg-card) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}

@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}

@media (min-width: 768px) {
  .article-page {
    padding: 1.5rem;
  }

  h1 {
    font-size: 1.7rem;
  }
}

@media (min-width: 1280px) {
  .article-page {
    padding: 2rem;
  }
}
</style>
