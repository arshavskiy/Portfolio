import {defineStore} from 'pinia'
import {ref} from 'vue'
import api from '@/composables/useApi'

export const useMarketDataStore = defineStore('market-data', () => {
  const marketGroups = ref(['US'])
  const marketsByGroup = ref({})
  const marketLoadingByGroup = ref({})

  const trendingGroups = ref(['US'])
  const trendingByGroup = ref({})
  const trendingLoadingByGroup = ref({})

  async function fetchMarkets(group = 'US', {force = false} = {}) {
    if (!force && marketsByGroup.value[group]?.length) return marketsByGroup.value[group]

    marketLoadingByGroup.value = {...marketLoadingByGroup.value, [group]: true}
    try {
      const data = await api.get(`/stocks/markets?group=${encodeURIComponent(group)}`)
      marketsByGroup.value = {...marketsByGroup.value, [group]: data.indices || []}
      if (data.groups?.length) marketGroups.value = data.groups
      return marketsByGroup.value[group]
    } finally {
      marketLoadingByGroup.value = {...marketLoadingByGroup.value, [group]: false}
    }
  }

  async function fetchTrending(group = 'US', {force = false} = {}) {
    if (!force && trendingByGroup.value[group]?.length) return trendingByGroup.value[group]

    trendingLoadingByGroup.value = {...trendingLoadingByGroup.value, [group]: true}
    try {
      const data = await api.get(`/stocks/trending?group=${encodeURIComponent(group)}`)
      trendingByGroup.value = {...trendingByGroup.value, [group]: data.items || []}
      if (data.groups?.length) trendingGroups.value = data.groups
      return trendingByGroup.value[group]
    } finally {
      trendingLoadingByGroup.value = {...trendingLoadingByGroup.value, [group]: false}
    }
  }

  return {
    marketGroups,
    marketsByGroup,
    marketLoadingByGroup,
    trendingGroups,
    trendingByGroup,
    trendingLoadingByGroup,
    fetchMarkets,
    fetchTrending,
  }
})
