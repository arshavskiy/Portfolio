<script setup>
import {onMounted, ref} from 'vue'
import {useRouter} from 'vue-router'
import api from '@/composables/useApi'
import NewsArticleCard from '@/components/charts/NewsArticleCard.vue'

const router = useRouter()
const articles = ref([])
const loading = ref(false)

async function loadNews() {
  loading.value = true
  try {
    const data = await api.get('/stocks/news?topic=for-you&limit=4')
    articles.value = data.articles || []
  } catch {
    articles.value = []
  } finally {
    loading.value = false
  }
}

function openArticle(article) {
  if (!article.id) return
  sessionStorage.setItem(`news-article:${article.id}`, JSON.stringify(article))
  router.push(`/news/article/${article.id}`)
}

onMounted(loadNews)
</script>

<template>
  <section v-if="loading || articles.length" class="news-card">
    <div class="news-head">
      <h2 class="card-title"><i class="pi pi-globe" /> For You</h2>
      <button class="view-all" @click="router.push('/news')">View all</button>
    </div>

    <div v-if="loading && !articles.length" class="news-grid">
      <div v-for="n in 4" :key="n" class="article-tile skeleton" />
    </div>

    <div v-else class="news-grid">
      <NewsArticleCard
        v-for="article in articles"
        :key="article.url || article.title"
        :article="article"
        @open="openArticle"
      />
    </div>
  </section>
</template>

<style scoped>
.news-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 0.9rem 1rem;
  margin-bottom: 0.75rem;
}

.news-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.card-title {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-secondary);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.card-title i {
  color: var(--accent);
  font-size: 0.8rem;
}

.view-all {
  background: none;
  border: 1px solid var(--border);
  border-radius: 7px;
  color: var(--text-secondary);
  padding: 4px 8px;
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
}

.view-all:active {
  color: var(--neon-blue);
  border-color: var(--neon-blue);
}

.news-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.6rem;
}

.skeleton {
  height: 180px;
  background: linear-gradient(90deg, var(--bg-card) 25%, #1a1a1a 50%, var(--bg-card) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}

@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}

@media (min-width: 720px) {
  .news-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
