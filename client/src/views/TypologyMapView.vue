<script setup>
import {computed, onMounted, ref, watch} from 'vue'
import {useRouter} from 'vue-router'
import Button from 'primevue/button'
import api from '@/composables/useApi'
import {useI18n} from '@/composables/useI18n'
import AppLoader from '@/components/ui/AppLoader.vue'

const router = useRouter()
const {t} = useI18n()

const GROUPS = ['style', 'marketCapClass', 'volatilityClass', 'primaryIndustry']
const activeGroup = ref('style')
const map = ref(null)
const loading = ref(false)
const error = ref('')

// validated categorical palette, derived from the app's own accent/neon-blue/purple/gold —
// dimmed only where needed to pass the CVD/contrast checks against the dark card surface.
const GROUP_COLORS = {
  style: {
    growth: '#3b82f6', blend: '#0891b2', speculative: '#a855f7', value: '#b8760a', unknown: '#4b5563',
  },
  marketCapClass: {
    mega: '#3b82f6', large: '#0891b2', mid: '#a855f7', small: '#b8760a', micro: '#c2410c', unknown: '#4b5563',
  },
  volatilityClass: {
    high: '#a855f7', medium: '#0891b2', low: '#3b82f6', unknown: '#4b5563',
  },
  primaryIndustry: {unknown: '#4b5563'},
}
const FALLBACK_COLORS = ['#3b82f6', '#0891b2', '#a855f7', '#b8760a', '#c2410c', '#059669', '#dc2626']

function colorFor(group, key) {
  const palette = GROUP_COLORS[group] || {}
  if (palette[key]) return palette[key]
  // primaryIndustry has arbitrary keys — assign deterministically from a fixed order
  const keys = (map.value?.groups || []).map((g) => g.key)
  const idx = keys.indexOf(key)
  return FALLBACK_COLORS[idx % FALLBACK_COLORS.length] || '#4b5563'
}

function sizeBand(marketCap) {
  if (!marketCap) return 'xs'
  if (marketCap >= 1e12) return 'xl'
  if (marketCap >= 100e9) return 'lg'
  if (marketCap >= 10e9) return 'md'
  if (marketCap >= 1e9) return 'sm'
  return 'xs'
}

function formatCap(marketCap) {
  if (!marketCap) return null
  if (marketCap >= 1e12) return `$${(marketCap / 1e12).toFixed(1)}T`
  if (marketCap >= 1e9) return `$${(marketCap / 1e9).toFixed(0)}B`
  if (marketCap >= 1e6) return `$${(marketCap / 1e6).toFixed(0)}M`
  return null
}

const TILE_CAP = 16 // tickers shown per group before folding into "+N"

const displayGroups = computed(() => {
  if (!map.value) return []
  return map.value.groups.map((g) => {
    const sorted = [...g.tickers].sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0))
    return {
      ...g,
      color: colorFor(map.value.groupBy, g.key),
      shown: sorted.slice(0, TILE_CAP),
      overflow: Math.max(0, sorted.length - TILE_CAP),
    }
  })
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    map.value = await api.get(`/enrich/typology-map?group=${activeGroup.value}`)
  } catch (err) {
    error.value = err.message || 'Failed to load map'
    map.value = null
  } finally {
    loading.value = false
  }
}

function openTicker(ticker) {
  router.push(`/position/${encodeURIComponent(ticker)}`)
}

onMounted(load)
watch(activeGroup, load)
</script>

<template>
  <div class="typology-map safe-bottom">
    <header class="page-header">
      <div class="page-heading">
        <h1 class="gradient-title">{{ t('typologyMap.title') }}</h1>
        <span v-if="map" class="text-muted">{{
            t('typologyMap.tickerCount', {n: map.groups.reduce((s, g) => s + g.count, 0)})
          }}</span>
      </div>
      <Button icon="pi pi-arrow-left" rounded text @click="router.push('/watchlist')"/>
    </header>

    <nav class="group-tabs">
      <button
          v-for="g in GROUPS"
          :key="g"
          :class="{active: activeGroup === g}"
          class="group-tab"
          type="button"
          @click="activeGroup = g"
      >
        {{ t(`typologyMap.groups.${g}`) }}
      </button>
    </nav>

    <div v-if="loading" class="map-loading">
      <AppLoader/>
    </div>

    <div v-else-if="error" class="map-error text-muted">
      <i class="pi pi-exclamation-triangle"/> {{ error }}
    </div>

    <div v-else-if="map && !map.groups.length" class="empty-state inline">
      <i class="pi pi-info-circle"/>
      <p>{{ t('typologyMap.emptyTitle') }}</p>
      <span>{{ t('typologyMap.emptyHint') }}</span>
    </div>

    <div v-else-if="map" class="treemap">
      <div v-for="group in displayGroups" :key="group.key" class="group">
        <div :style="{background: group.color}" class="group-header">
          <span class="group-name">{{ group.key }}</span>
          <span class="group-count">{{ t('typologyMap.tickerCount', {n: group.count}) }}</span>
        </div>
        <div class="group-tiles">
          <button
              v-for="t2 in group.shown"
              :key="t2.ticker"
              :class="`size-${sizeBand(t2.marketCap)}`"
              :style="{background: group.color}"
              class="tile"
              type="button"
              @click="openTicker(t2.ticker)"
          >
            <span v-if="t2.insiderSignal === 'buying'" :title="t('typologyMap.insiderBuying')" class="status-dot buy"/>
            <span v-else-if="t2.insiderSignal === 'selling'" :title="t('typologyMap.insiderSelling')"
                  class="status-dot sell"/>
            <span class="ticker">{{ t2.ticker }}</span>
            <span v-if="formatCap(t2.marketCap)" class="cap">{{ formatCap(t2.marketCap) }}</span>
          </button>
          <div v-if="group.overflow > 0" :style="{background: group.color}" class="tile size-xs tile-overflow">
            <span class="ticker">+{{ group.overflow }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.typology-map {
  padding: 0.5rem 1rem 2rem;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
  gap: 0.5rem;
}

.page-heading h1 {
  font-size: 1.3rem;
  margin: 0 0 0.15rem;
}

.page-heading span {
  font-size: 0.8rem;
}

.group-tabs {
  display: flex;
  gap: 0.3rem;
  background: var(--bg-secondary, #111111);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 0.25rem;
  margin-bottom: 1rem;
  width: fit-content;
  overflow-x: auto;
  max-width: 100%;
}

.group-tab {
  font-size: 0.78rem;
  font-weight: 600;
  padding: 0.4rem 0.7rem;
  border-radius: 7px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  white-space: nowrap;
  cursor: pointer;
}

.group-tab.active {
  background: var(--accent);
  color: #fff;
}

.map-loading, .map-error {
  padding: 2rem 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.empty-state.inline {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  color: var(--text-secondary);
  font-size: 0.82rem;
  text-align: center;
  padding: 2.5rem 1.25rem;
}

.empty-state.inline > .pi {
  font-size: 2rem;
  opacity: 0.3;
  margin-bottom: 0.25rem;
}

.empty-state.inline p {
  margin: 0;
  font-weight: 600;
  color: var(--text-primary);
}

.empty-state.inline span {
  font-size: 0.75rem;
  line-height: 1.4;
  max-width: 280px;
}

.treemap {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.group {
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  background: var(--bg-secondary, #111111);
}

.group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.4rem 0.65rem;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #fff;
}

.group-count {
  font-weight: 500;
  opacity: 0.85;
  text-transform: none;
  letter-spacing: normal;
}

.group-tiles {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  padding: 3px;
}

.tile {
  position: relative;
  border: none;
  border-radius: 6px;
  padding: 0.4rem 0.5rem;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: flex-start;
  color: #fff;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
}

.tile .ticker {
  font-weight: 700;
  line-height: 1.1;
  white-space: nowrap;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
}

.tile .cap {
  font-size: 0.68rem;
  opacity: 0.85;
  white-space: nowrap;
}

.tile-overflow {
  justify-content: center;
  align-items: center;
  opacity: 0.55;
}

.status-dot {
  position: absolute;
  top: 0.35rem;
  right: 0.4rem;
  width: 7px;
  height: 7px;
  border-radius: 999px;
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.25);
}

.status-dot.buy {
  background: var(--neon-green);
}

.status-dot.sell {
  background: var(--neon-red);
}

.size-xl {
  width: 168px;
  height: 96px;
  font-size: 0.95rem;
}

.size-lg {
  width: 122px;
  height: 78px;
  font-size: 0.86rem;
}

.size-md {
  width: 90px;
  height: 62px;
  font-size: 0.76rem;
}

.size-sm {
  width: 68px;
  height: 48px;
  font-size: 0.68rem;
}

.size-xs {
  width: 54px;
  height: 38px;
  font-size: 0.62rem;
}

.size-xs .cap {
  display: none;
}

@media (max-width: 640px) {
  .treemap {
    gap: 5px;
  }
}
</style>
