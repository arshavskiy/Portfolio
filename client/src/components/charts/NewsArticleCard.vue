<script setup>
import { useI18n } from "@/composables/useI18n";

defineProps({
  article: { type: Object, required: true },
});

const emit = defineEmits(["open"]);
const { t } = useI18n();

function fmtDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
</script>

<template>
  <article class="article-card" @click="emit('open', article)">
    <div class="article-main">
      <h2>{{ article.title }}</h2>
      <div class="article-meta">
        <span class="source">{{
          article.source || t("newsPage.marketNews")
        }}</span>
        <span v-if="fmtDate(article.publishedAt)" class="text-muted">{{
          fmtDate(article.publishedAt)
        }}</span>
      </div>
    </div>

    <div v-if="article.symbols?.length" class="symbol-row">
      <span
        v-for="symbol in article.symbols.slice(0, 2)"
        :key="symbol"
        class="symbol-pill"
        >{{ symbol }}</span
      >
    </div>
    <div v-else class="symbol-row symbol-row-empty">
      <span class="symbol-pill muted-pill">News</span>
    </div>
  </article>
</template>

<style scoped>
.article-card {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  background: transparent;
  border: 0;
  /* border-top: 1px solid #f0ebe7; */
  border-radius: 0;
  padding: 0.75rem 1rem;
  cursor: pointer;
  transition: background 0.15s;
}

.article-card:hover {
  background: var(--bg-secondary);
}

.article-card:active {
  background: var(--bg-card);
}

.article-main {
  min-width: 0;
  flex: 1;
}

.article-meta {
  display: flex;
  gap: 0.35rem;
  flex-wrap: wrap;
  align-items: center;
  margin-bottom: 0.32rem;
  font-size: 0.64rem;
}

.source {
  min-width: 0;
  color: var(--text-secondary);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

h2 {
  color: var(--text-primary);
  font-size: 0.88rem;
  font-weight: 600;
  line-height: 1.22;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.symbol-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  flex-shrink: 0;
  justify-content: flex-end;
}

.symbol-pill {
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  padding: 0.18rem 0.52rem;
  font-size: 0.66rem;
  font-weight: 700;
  white-space: nowrap;
}

.muted-pill {
  color: var(--text-muted, var(--text-secondary));
}

.symbol-row-empty {
  opacity: 0.75;
}
</style>
