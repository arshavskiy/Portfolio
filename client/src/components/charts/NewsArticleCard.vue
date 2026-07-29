<script setup>
import {useI18n} from '@/composables/useI18n'

defineProps({
  article: {type: Object, required: true},
})

const emit = defineEmits(['open'])
const {t} = useI18n()

function fmtDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <article class="article-card" @click="emit('open', article)">
    <div class="article-glow" />
    <div class="article-meta">
      <span class="source">{{ article.source || t('newsPage.marketNews') }}</span>
      <span v-if="fmtDate(article.publishedAt)" class="text-muted">{{ fmtDate(article.publishedAt) }}</span>
    </div>

    <h2>{{ article.title }}</h2>
    <p v-if="article.summary" class="summary text-muted">{{ article.summary }}</p>

    <!--    <div v-if="article.tags?.length" class="tag-row">-->
    <!--      <span v-for="tag in article.tags" :key="tag" class="topic-pill">{{ tag }}</span>-->
    <!--    </div>-->

    <div v-if="article.symbols?.length" class="symbol-row">
      <span v-for="symbol in article.symbols" :key="symbol" class="symbol-pill">{{ symbol }}</span>
    </div>
  </article>
</template>

<style scoped>
.article-card {
  position: relative;
  overflow: hidden;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 0.85rem 0.95rem;
  cursor: pointer;
  transition: border-color 0.15s, transform 0.15s, box-shadow 0.15s;
}

.article-card:hover {
  border-color: color-mix(in srgb, var(--neon-blue) 55%, transparent);
  box-shadow: 0 0 14px color-mix(in srgb, var(--neon-blue) 12%, transparent), inset 0 0 10px color-mix(in srgb, var(--neon-blue) 3%, transparent);
}

.article-card:active {
  transform: scale(0.995);
}

.article-glow {
  position: absolute;
  top: 0;
  left: 0;
  width: 3px;
  height: 100%;
  background: linear-gradient(180deg, var(--neon-blue), var(--purple), var(--neon-red));
  opacity: 0.85;
}

.article-meta {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: center;
  margin-bottom: 0.45rem;
  font-size: 0.68rem;
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

h2 {
  color: var(--text-primary);
  font-size: 1rem;
  line-height: 1.28;
  margin: 0;
}

.summary {
  font-size: 0.82rem;
  line-height: 1.42;
  margin-top: 0.45rem;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.65rem;
}

.topic-pill {
  border: 1px solid color-mix(in srgb, var(--neon-blue) 35%, transparent);
  border-radius: 999px;
  color: var(--neon-blue);
  padding: 2px 8px;
  font-size: 0.68rem;
  font-weight: 800;
}

.symbol-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.45rem;
}

.symbol-pill {
  border: 1px solid color-mix(in srgb, var(--neon-green) 35%, transparent);
  border-radius: 6px;
  color: var(--neon-green);
  padding: 2px 6px;
  font-size: 0.68rem;
  font-weight: 800;
}
</style>
