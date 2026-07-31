<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { useStorage } from "@vueuse/core";
import { useRouter } from "vue-router";
import { DEFAULT_NEWS_TOPICS, useNewsStore } from "@/stores/news";
import { useI18n } from "@/composables/useI18n";
import NewsArticleCard from "@/components/charts/NewsArticleCard.vue";

const router = useRouter();
const news = useNewsStore();
const { t } = useI18n();
const topic = useStorage("desktop-news-topic", "for-you");
const scrollRef = ref(null);
const FEED_LIMIT = 3;
const props = defineProps({
  hideLoading: { type: Boolean, default: false },
});
const articles = computed(() => news.getFeed(topic.value));
const loading = computed(
  () => news.isLoading(topic.value) && !articles.value.length,
);
const loadingMore = computed(() => news.isLoadingMore(topic.value));
const hasMore = computed(() => news.hasMore(topic.value));
const topics = computed(() =>
  news.topics?.length ? news.topics : DEFAULT_NEWS_TOPICS,
);

function openArticle(article) {
  if (!article?.url) return;
  window.open(article.url, "_blank", "noopener,noreferrer");
}

function setTopic(value) {
  if (value === topic.value) return;
  topic.value = value;
}

async function loadFeed({ reset = false } = {}) {
  await news.fetchFeed(topic.value, { reset, limit: FEED_LIMIT });
}

async function handleScroll() {
  const el = scrollRef.value;
  if (!el || loadingMore.value || loading.value || !hasMore.value) return;
  const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
  if (remaining > 80) return;
  await loadFeed();
}

async function loadMore() {
  if (loading.value || loadingMore.value || !hasMore.value) return;
  await loadFeed();
}

onMounted(() => {
  loadFeed({ reset: true })
    .then(() => nextTick(handleScroll))
    .catch(() => {});
});

watch(topic, (value) => {
  loadFeed({ reset: true })
    .then(() =>
      nextTick(() => {
        if (scrollRef.value) scrollRef.value.scrollTop = 0;
        handleScroll();
      }),
    )
    .catch(() => {});
});

onBeforeUnmount(() => {
  if (scrollRef.value) scrollRef.value.onscroll = null;
});
</script>

<template>
  <section v-if="(loading && !props.hideLoading) || articles.length" class="news-card">
    <div class="news-head">
      <div class="news-title-wrap">
        <h2 class="card-title"><i class="pi pi-globe" /> News</h2>
      </div>
      <button class="view-all" @click="router.push('/news')">
        {{ t("dashboard.viewAll") }}
      </button>
    </div>

    <div class="topic-strip">
      <button
        v-for="item in topics"
        :key="item.value"
        class="topic-chip"
        :class="{ active: topic === item.value }"
        type="button"
        @click="setTopic(item.value)"
      >
        {{ item.label }}
      </button>
    </div>

    <div v-if="loading && !articles.length && !props.hideLoading" class="news-grid">
      <div v-for="n in 4" :key="n" class="article-tile skeleton" />
    </div>

    <div
      v-else
      ref="scrollRef"
      class="news-feed"
      @scroll.passive="handleScroll"
    >
      <div class="news-grid">
        <NewsArticleCard
          v-for="article in articles"
          :key="article.url || article.title"
          :article="article"
          @open="openArticle"
        />
      </div>
      <div v-if="loadingMore" class="news-loading-more">Loading more...</div>
    </div>
    <!-- <div v-if="!loading && articles.length" class="news-load-more">
      <button
        :disabled="!hasMore || loadingMore"
        type="button"
        @click="loadMore"
      >
        {{ hasMore ? "Load more" : "No more news" }}
      </button>
    </div> -->
  </section>
</template>

<style scoped>
.news-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 0.85rem 0;
  margin-bottom: 0.75rem;
}

.news-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;
  margin-bottom: 0.45rem;
  padding: 0 1rem;
}

.news-title-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.card-title {
  font-size: 1rem;
  font-weight: 750;
  color: var(--text-primary);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.card-title i {
  color: var(--accent);
  font-size: 0.82rem;
}

.news-subtitle {
  color: var(--text-secondary);
  font-size: 0.74rem;
  font-weight: 500;
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

.topic-strip {
  display: flex;
  gap: 0.38rem;
  overflow-x: auto;
  padding-bottom: 0.45rem;
  margin-bottom: 0.5rem;
  padding-inline: 1rem;
  scrollbar-width: none;
}

.topic-strip::-webkit-scrollbar {
  display: none;
}

.topic-chip {
  flex: 0 0 auto;
  background: #fff;
  border: 1px solid var(--border);
  color: var(--text-secondary);
  border-radius: 8px;
  padding: 0.36rem 0.7rem;
  font-size: 0.74rem;
  font-weight: 700;
  cursor: pointer;
}

.topic-chip.active {
  color: #2563eb;
  border-color: rgba(37, 99, 235, 0.4);
  background: #f8fbff;
}

.view-all:active {
  color: var(--neon-blue);
  border-color: var(--neon-blue);
}

.news-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0;
}

.news-feed {
  max-height: 130px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(148, 163, 184, 0.35) transparent;
}

.news-feed::-webkit-scrollbar {
  width: 6px;
}

.news-feed::-webkit-scrollbar-track {
  background: transparent;
}

.news-feed::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.35);
}

.news-loading-more {
  padding: 0.8rem 1rem 0.95rem;
  color: var(--text-secondary);
  font-size: 0.75rem;
  text-align: center;
}

.news-load-more {
  display: flex;
  justify-content: center;
  padding: 0.15rem 1rem 1rem;
}

.news-load-more button {
  min-height: 34px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #fff;
  color: var(--text-primary);
  padding: 0 0.9rem;
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
}

.news-load-more button:disabled {
  color: var(--text-secondary);
  background: #faf7f4;
  cursor: default;
}

.skeleton {
  height: 50px;
  background: #f4efea;
  border-top: 1px solid #ece4dd;
}
</style>
