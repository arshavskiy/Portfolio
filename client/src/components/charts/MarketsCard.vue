<script setup>
import {computed, onMounted, ref, watch} from 'vue'
import {storeToRefs} from 'pinia'
import {useNavigateToPosition} from '@/composables/useNavigateToPosition'
import {useStorage} from '@vueuse/core'
import {useMarketDataStore} from '@/stores/marketData'
import {useI18n} from '@/composables/useI18n'
import SparklineChart from '@/components/charts/SparklineChart.vue'
import MarketMetaList from '@/components/ui/MarketMetaList.vue'

const {openPosition} = useNavigateToPosition()
const {t} = useI18n()
const marketData = useMarketDataStore()
const {marketGroups, marketsByGroup, marketLoadingByGroup} = storeToRefs(marketData)
const group = useStorage('dashboard-markets-group', 'US')
const pinnedGroups = useStorage('dashboard-markets-pinned-groups', [])
const moreOpen = ref(false)
const defaultPrimaryGroups = ['Israel', 'US']

const groups = computed(() => marketGroups.value)
const indices = computed(() => marketsByGroup.value[group.value] || [])
const visibleIndices = computed(() => indices.value.filter(hasIndexData))
const loading = computed(() => Boolean(marketLoadingByGroup.value[group.value]))
const visibleGroups = computed(() => groups.value.filter((name) => {
  const loaded = Object.prototype.hasOwnProperty.call(marketsByGroup.value, name)
  return !loaded || (marketsByGroup.value[name] || []).some(hasIndexData) || marketLoadingByGroup.value[name]
}))
const primaryGroups = computed(() => {
  const ordered = [...defaultPrimaryGroups, ...pinnedGroups.value]
  return [...new Set(ordered)].filter((name) => visibleGroups.value.includes(name))
})
const extraGroups = computed(() => visibleGroups.value.filter((name) => !primaryGroups.value.includes(name)))
const isExtraGroupActive = computed(() => extraGroups.value.includes(group.value))
function selectGroup(g) {
  if (!defaultPrimaryGroups.includes(g) && !pinnedGroups.value.includes(g)) {
    pinnedGroups.value = [...pinnedGroups.value, g]
  }
  group.value = g
  moreOpen.value = false
}

function openIndex(idx) {
  openPosition(idx.symbol)
}

function fmt(n) {
  if (n == null) return '—'
  return n.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})
}

function pct(n) {
  if (n == null) return ''
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}

function hasIndexData(idx) {
  return Number.isFinite(idx?.price) || Number.isFinite(idx?.changePercent) || idx?.history?.length
}

function displayMarketGroup(name) {
  const key = {
    US: 'dashboard.marketGroupUS',
    Israel: 'dashboard.marketGroupIsrael',
    Crypto: 'dashboard.marketGroupCrypto',
    Europe: 'dashboard.marketGroupEurope',
    Asia: 'dashboard.marketGroupAsia',
    Bonds: 'dashboard.marketGroupBonds',
    Energy: 'dashboard.marketGroupEnergy',
    Futures: 'dashboard.marketGroupFutures',
  }[name]
  return key ? t(key) : name || t('dashboard.marketGroupOther')
}

onMounted(() => {
  marketData.fetchMarkets(group.value).catch(() => {})
})

watch(group, (nextGroup) => {
  marketData.fetchMarkets(nextGroup).catch(() => {})
  if (!extraGroups.value.includes(nextGroup)) moreOpen.value = false
})

watch([visibleIndices, loading, visibleGroups], ([currentIndices, isLoading, availableGroups]) => {
  if (isLoading || currentIndices.length || !Object.prototype.hasOwnProperty.call(marketsByGroup.value, group.value)) return
  const fallback = availableGroups.find((name) => name !== group.value)
  if (fallback) group.value = fallback
})

</script>

<template>
  <section class="markets-card">
    <div class="markets-head">
      <div class="markets-topline">
        <div class="market-tabs">
          <button
              v-for="g in primaryGroups"
              :key="g"
              :class="{ active: group === g }"
              class="market-tab"
              @click="selectGroup(g)"
          >{{ displayMarketGroup(g) }}
          </button>
          <div v-if="extraGroups.length" class="market-more">
            <button
              :class="{ active: moreOpen || isExtraGroupActive }"
              class="market-tab market-tab-plus"
              type="button"
              @click="moreOpen = !moreOpen"
            >+</button>
            <div v-if="moreOpen" class="market-more-menu">
              <button
                v-for="g in extraGroups"
                :key="g"
                :class="{ active: group === g }"
                class="market-more-item"
                type="button"
                @click="selectGroup(g)"
              >{{ displayMarketGroup(g) }}
              </button>
            </div>
          </div>
        </div>
        <MarketMetaList/>
      </div>
    </div>

    <div v-if="loading && !visibleIndices.length" class="markets-grid">
      <div v-for="n in 6" :key="n" class="index-tile skeleton"/>
    </div>

    <div v-else-if="visibleIndices.length" class="markets-grid">
      <div v-for="idx in visibleIndices" :key="idx.symbol" class="index-tile" @click="openIndex(idx)">
        <div class="idx-name">{{ idx.name }}</div>
        <div class="idx-spark">
          <SparklineChart
              v-if="idx.history?.length"
              :data="idx.history"
              :pnl-percent="idx.changePercent || 0"
          />
        </div>
        <div class="idx-price">{{ fmt(idx.price) }}</div>
        <div :class="(idx.changePercent ?? 0) >= 0 ? 'up' : 'down'" class="idx-change">
          {{ idx.change >= 0 ? '+' : '' }}{{ fmt(idx.changePercent) }}
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.markets-card {
  background: var(--bg-card);
  padding: 0.9rem 1rem;
  padding-left: 0;
  margin-bottom: 0.75rem;

}
.markets-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.card-title {
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary);
  margin: 0;
}

.markets-topline {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  width: 100%;
  flex-wrap: wrap;
}
.market-tabs { display: flex; gap: 2px; position: relative; }
.market-tab {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  border-radius: 6px;
  padding: 4px 9px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.market-tab.active { background: var(--accent); color: #fff; }

.market-more {
  position: relative;
}

.market-tab-plus {
  min-width: 28px;
  padding-left: 0;
  padding-right: 0;
}

.market-more-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  min-width: 92px;
  padding: 0.3rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-secondary);
  box-shadow: 0 10px 24px color-mix(in srgb, var(--text-primary) 12%, transparent);
  display: flex;
  flex-direction: column;
  gap: 2px;
  z-index: 6;
}

.market-more-item {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  border-radius: 8px;
  padding: 6px 8px;
  font-size: 0.74rem;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.market-more-item.active,
.market-more-item:hover {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--text-primary);
}

.markets-grid {
  display: flex;
  overflow-x: scroll;
  scrollbar-width: thin;
  scrollbar-color: rgba(148, 163, 184, 0.35) transparent;
  padding-bottom: 10px;
}

.markets-grid::-webkit-scrollbar {
  height: 3px;
}

.markets-grid::-webkit-scrollbar-track {
  background: transparent;
}

.markets-grid::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.35);
  border-radius: 999px;
}

.index-tile {
  padding: 0.3rem 0.3rem;
  min-width: 90px;
  min-height: 98px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  cursor: pointer;
  border-radius: 8px;
  transition: background 0.15s;
}
.index-tile:hover { background: rgba(255, 255, 255, 0.03); }
.index-tile:active { background: rgba(255, 255, 255, 0.06); }
.idx-name { font-size: 0.78rem; font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.idx-price {
  font-size: 0.85rem;
}
.idx-spark { height: 40px; margin: 1px 0; overflow: hidden; }
.idx-change { font-size: 0.72rem; font-weight: 600; }
.idx-change.up { color: var(--neon-green); }
.idx-change.down { color: var(--neon-red); }

.skeleton {
  background: linear-gradient(90deg, var(--bg-card) 25%, #1a1a1a 50%, var(--bg-card) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}
@keyframes shimmer { to { background-position: -200% 0; } }
</style>
