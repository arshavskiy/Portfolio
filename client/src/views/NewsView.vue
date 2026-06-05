<script setup>
import {computed, nextTick, onMounted, onUnmounted, ref, watch} from 'vue'
import {useStorage} from '@vueuse/core'
import api from '@/composables/useApi'
import NewsArticleCard from '@/components/charts/NewsArticleCard.vue'

const FALLBACK_TOPICS = [
  {value: 'for-you', label: 'For You'},
  {value: 'markets', label: 'Markets'},
  {value: 'tech', label: 'Tech'},
  {value: 'financials', label: 'Financials'},
  {value: 'crypto', label: 'Crypto'},
  {value: 'energy', label: 'Energy'},
  {value: 'israel', label: 'Israel'},
  {value: 'positive', label: 'Positive'},
]

const topic = useStorage('news-topic', 'for-you')
const topics = ref(FALLBACK_TOPICS)
const articles = ref([])
const loading = ref(false)
const loadingMore = ref(false)
const hasMore = ref(true)
const error = ref('')
const page = ref(1)
const sentinelRef = ref(null)
let observer = null

const PAGE_SIZE = 3

const activeTopic = computed(() => topics.value.find((item) => item.value === topic.value))

async function loadNews({reset = false} = {}) {
  if (loading.value || loadingMore.value) return
  if (!reset && !hasMore.value) return

  if (reset) {
    page.value = 1
    hasMore.value = true
    articles.value = []
    loading.value = true
  } else {
    loadingMore.value = true
  }

  error.value = ''
  try {
    const data = await api.get(
      `/stocks/news?topic=${encodeURIComponent(topic.value)}&limit=${PAGE_SIZE}&page=${page.value}`
    )
    const nextArticles = data.articles || []
    articles.value = reset ? nextArticles : [...articles.value, ...nextArticles]
    hasMore.value = Boolean(data.hasMore)
    if (nextArticles.length) page.value += 1
    if (data.topics?.length) topics.value = data.topics
  } catch (err) {
    if (reset) articles.value = []
    error.value = err.message || 'Unable to load news'
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

function setTopic(value) {
  if (value === topic.value) return
  topic.value = value
}

function openArticle(article) {
  if (!article.url) return
  window.open(article.url, '_blank', 'noopener,noreferrer')
}

function setupInfiniteScroll() {
  observer?.disconnect()
  if (!sentinelRef.value) return

  observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) loadNews()
  }, {
    root: sentinelRef.value.closest('.main-content'),
    rootMargin: '320px 0px',
    threshold: 0,
  })
  observer.observe(sentinelRef.value)
}

watch(topic, () => loadNews({reset: true}))
onMounted(async () => {
  await loadNews({reset: true})
  await nextTick()
  setupInfiniteScroll()
})
onUnmounted(() => observer?.disconnect())
</script>

<template>
  <div class="news-page safe-bottom">
    <header class="page-header">
      <div>
        <h1 class="gradient-title">News</h1>
        <p class="text-muted">{{ activeTopic?.label || 'Markets' }} feed</p>
      </div>
    </header>

    <div class="topic-strip">
      <button
        v-for="item in topics"
        :key="item.value"
        class="topic-chip"
        :class="{ active: topic === item.value }"
        @click="setTopic(item.value)"
      >
        {{ item.label }}
      </button>
    </div>

    <div v-if="loading && !articles.length" class="news-list">
      <div v-for="n in 8" :key="n" class="article-card skeleton" />
    </div>

    <div v-else-if="error" class="empty">
      <i class="pi pi-exclamation-triangle" />
      <p>{{ error }}</p>
    </div>

    <div v-else-if="!articles.length" class="empty">
      <i class="pi pi-globe" />
      <p>No stories found for this topic</p>
    </div>

    <div v-else class="news-list">
      <NewsArticleCard
        v-for="article in articles"
        :key="article.url || article.title"
        :article="article"
        @open="openArticle"
      />
    </div>

    <div ref="sentinelRef" class="scroll-sentinel">
      <span v-if="loadingMore" class="news-loader" aria-label="Loading more articles" />
    </div>
  </div>
</template>

<style scoped>
.news-page {
  padding: 1rem;
}

.page-header {
  margin-bottom: 1rem;
}

.page-header h1 {
  font-size: 1.5rem;
}

.page-header p {
  font-size: 0.82rem;
  margin-top: 0.15rem;
}

.topic-strip {
  display: flex;
  gap: 0.4rem;
  overflow-x: auto;
  padding-bottom: 0.65rem;
  margin-bottom: 0.4rem;
  scrollbar-width: none;
}

.topic-strip::-webkit-scrollbar {
  display: none;
}

.topic-chip {
  flex: 0 0 auto;
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  border-radius: 8px;
  padding: 0.45rem 0.75rem;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, box-shadow 0.15s;
}

.topic-chip.active {
  color: var(--neon-blue);
  border-color: rgba(0, 207, 255, 0.7);
  box-shadow: 0 0 12px rgba(0, 207, 255, 0.2), inset 0 0 8px rgba(0, 207, 255, 0.04);
}

.news-list {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.65rem;
  padding: 3rem 1rem;
  text-align: center;
  color: var(--text-secondary);
}

.empty i {
  font-size: 2.4rem;
}

.skeleton {
  height: 118px;
  background: linear-gradient(90deg, var(--bg-card) 25%, #1a1a1a 50%, var(--bg-card) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}

.scroll-sentinel {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 56px;
  padding: 1rem 0;
}

.news-loader {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid rgba(0, 207, 255, 0.14);
  border-top-color: var(--neon-blue);
  border-right-color: #a855f7;
  box-shadow: 0 0 12px rgba(0, 207, 255, 0.22), inset 0 0 8px rgba(168, 85, 247, 0.08);
  animation: newsSpin 0.75s linear infinite;
}

@keyframes newsSpin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}

@media (min-width: 768px) {
  .news-page {
    padding: 1.5rem;
  }

  .news-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
  }

}

@media (min-width: 1280px) {
  .news-page {
    padding: 2rem;
  }
}
</style>
