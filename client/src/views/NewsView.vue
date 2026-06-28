<script setup>
import {computed, nextTick, onMounted, onUnmounted, ref, watch} from 'vue'
import {useStorage} from '@vueuse/core'
import {useRouter} from 'vue-router'
import {storeToRefs} from 'pinia'
import {DEFAULT_NEWS_TOPICS, useNewsStore} from '@/stores/news'
import NewsArticleCard from '@/components/charts/NewsArticleCard.vue'
import AppLoader from '@/components/ui/AppLoader.vue'

const router = useRouter()
const news = useNewsStore()
const {topics} = storeToRefs(news)

const topic = useStorage('news-topic', 'for-you')
const error = ref('')
const sentinelRef = ref(null)
let observer = null

const PAGE_SIZE = 3

if (!topics.value.length) {
  topics.value = DEFAULT_NEWS_TOPICS
}

const articles = computed(() => news.getFeed(topic.value))
const loading = computed(() => news.isLoading(topic.value) && !articles.value.length)
const loadingMore = computed(() => news.isLoadingMore(topic.value))
const hasMore = computed(() => news.hasMore(topic.value))
const activeTopic = computed(() => topics.value.find((item) => item.value === topic.value))

async function loadNews({reset = false} = {}) {
  error.value = ''
  try {
    await news.fetchFeed(topic.value, {reset, limit: PAGE_SIZE})
  } catch (err) {
    error.value = err.message || 'Unable to load news'
  }
}

function setTopic(value) {
  if (value === topic.value) return
  topic.value = value
}

function openArticle(article) {
  if (!article?.url) return
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
watch(() => articles.value.length, async () => {
  await nextTick()
  setupInfiniteScroll()
})

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
      <AppLoader v-if="loadingMore"/>
      <button
        v-else-if="hasMore && !loading"
        class="load-more-btn"
        type="button"
        @click="loadNews()"
      >
        Load more
      </button>
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

.load-more-btn {
  border: 1px solid rgba(0, 207, 255, 0.35);
  background: rgba(15, 23, 42, 0.92);
  color: var(--text-primary);
  border-radius: 999px;
  padding: 0.7rem 1rem;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  transition: border-color 0.15s, transform 0.15s, box-shadow 0.15s;
}

.load-more-btn:hover {
  border-color: rgba(0, 207, 255, 0.8);
  box-shadow: 0 0 14px rgba(0, 207, 255, 0.15);
  transform: translateY(-1px);
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
