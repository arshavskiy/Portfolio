import {defineStore} from 'pinia'
import {computed, ref} from 'vue'
import api from '@/composables/useApi'
import {useLocaleStore} from '@/stores/locale'

// Russian locale gets native-language articles (GNews on the server side).
function langParam() {
  try {
    const locale = useLocaleStore().locale
    return locale === 'ru' ? '&lang=ru' : ''
  } catch {
    return ''
  }
}

export const DEFAULT_NEWS_TOPICS = [
  {value: 'for-you', label: 'For You'},
  {value: 'markets', label: 'Markets'},
  {value: 'tech', label: 'Tech'},
  {value: 'financials', label: 'Financials'},
  {value: 'crypto', label: 'Crypto'},
  {value: 'energy', label: 'Energy'},
  {value: 'israel', label: 'Israel'},
  {value: 'positive', label: 'Positive'},
]

export const useNewsStore = defineStore('news', () => {
  const topics = ref(DEFAULT_NEWS_TOPICS)
  const feedsByTopic = ref({})
  const previewByTopic = ref({})
  const pageByTopic = ref({})
  const hasMoreByTopic = ref({})
  const loadingByTopic = ref({})
  const loadingMoreByTopic = ref({})

  const topicValues = computed(() => topics.value.map((item) => item.value))

  function getFeed(topic) {
    return feedsByTopic.value[topic] || []
  }

  function getPreview(topic) {
    return previewByTopic.value[topic] || []
  }

  function isLoading(topic) {
    return Boolean(loadingByTopic.value[topic])
  }

  function isLoadingMore(topic) {
    return Boolean(loadingMoreByTopic.value[topic])
  }

  function hasMore(topic) {
    return hasMoreByTopic.value[topic] ?? true
  }

  async function fetchPreview(topic = 'for-you', limit = 4, {force = false} = {}) {
    if (!force && previewByTopic.value[topic]?.length) return previewByTopic.value[topic]

    loadingByTopic.value = {...loadingByTopic.value, [topic]: true}
    try {
      const data = await api.get(`/stocks/news?topic=${encodeURIComponent(topic)}&limit=${limit}${langParam()}`)
      previewByTopic.value = {...previewByTopic.value, [topic]: data.articles || []}
      if (data.topics?.length) topics.value = data.topics
      return previewByTopic.value[topic]
    } finally {
      loadingByTopic.value = {...loadingByTopic.value, [topic]: false}
    }
  }

  async function fetchFeed(topic = 'for-you', {reset = false, limit = 3} = {}) {
    if (loadingByTopic.value[topic] || loadingMoreByTopic.value[topic]) return getFeed(topic)
    if (!reset && hasMoreByTopic.value[topic] === false) return getFeed(topic)

    const nextPage = reset ? 1 : (pageByTopic.value[topic] || 1)
    if (reset) {
      loadingByTopic.value = {...loadingByTopic.value, [topic]: true}
      feedsByTopic.value = {...feedsByTopic.value, [topic]: []}
      hasMoreByTopic.value = {...hasMoreByTopic.value, [topic]: true}
      pageByTopic.value = {...pageByTopic.value, [topic]: 1}
    } else {
      loadingMoreByTopic.value = {...loadingMoreByTopic.value, [topic]: true}
    }

    try {
      const data = await api.get(
        `/stocks/news?topic=${encodeURIComponent(topic)}&limit=${limit}&page=${nextPage}${langParam()}`
      )
      const nextArticles = data.articles || []
      const current = reset ? [] : getFeed(topic)
      feedsByTopic.value = {...feedsByTopic.value, [topic]: [...current, ...nextArticles]}
      hasMoreByTopic.value = {...hasMoreByTopic.value, [topic]: Boolean(data.hasMore)}
      pageByTopic.value = {...pageByTopic.value, [topic]: nextArticles.length ? nextPage + 1 : nextPage}
      if (data.topics?.length) topics.value = data.topics
      return feedsByTopic.value[topic]
    } finally {
      loadingByTopic.value = {...loadingByTopic.value, [topic]: false}
      loadingMoreByTopic.value = {...loadingMoreByTopic.value, [topic]: false}
    }
  }

  return {
    topics,
    topicValues,
    getFeed,
    getPreview,
    isLoading,
    isLoadingMore,
    hasMore,
    fetchPreview,
    fetchFeed,
  }
})
