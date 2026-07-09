<script setup>
import {computed, onMounted, onUnmounted, ref} from 'vue'
import {getMarketHoursState, MARKET_HOURS_LIST} from '@/composables/useMarketHours'
import {useI18n} from '@/composables/useI18n'

const now = ref(new Date())
const {locale, t} = useI18n()
let timer = null

const markets = computed(() => MARKET_HOURS_LIST.map((market) => getMarketHoursState(market, now.value)))

function localDuration(value = '') {
  return locale.value === 'ru'
      ? value.replace(/(\d+)d/g, '$1д').replace(/(\d+)h/g, '$1ч').replace(/(\d+)m/g, '$1м')
      : value
}

function displayMarketHoursLabel(value = '') {
  const patterns = [
    [/^Regular in (.+)$/u, 'dashboard.regularIn'],
    [/^Pre-Market in (.+)$/u, 'dashboard.preMarketIn'],
    [/^After-Hours in (.+)$/u, 'dashboard.afterHoursIn'],
    [/^Closed in (.+)$/u, 'dashboard.closedIn'],
    [/^Pre until (.+)$/u, 'dashboard.preUntil'],
    [/^Pre in (.+)$/u, 'dashboard.preIn'],
    [/^Regular until (.+)$/u, 'dashboard.regularUntil'],
    [/^Post until (.+)$/u, 'dashboard.postUntil'],
    [/^Opens in (.+)$/u, 'dashboard.opensIn'],
  ]
  for (const [pattern, key] of patterns) {
    const match = value.match(pattern)
    if (match) return t(key, {duration: localDuration(match[1])})
  }
  const exact = {
    Open: 'common.open',
    Closed: 'dashboard.closed',
    'Pre-Market Trading': 'dashboard.preMarketTrading',
    'Before Trade': 'dashboard.beforeTrade',
    'After-Hours Trading': 'dashboard.afterHoursTrading',
    'After Trade': 'dashboard.afterTrade',
  }[value]
  return exact ? t(exact) : value
}

function displaySessionLabel(value = '') {
  return value.replace('Pre-Market', t('dashboard.preMarketSession'))
}

onMounted(() => {
  timer = setInterval(() => {
    now.value = new Date()
  }, 60000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <section class="hours-card">
    <div class="hours-head">
      <h2 class="card-title">{{ t('dashboard.marketHours') }}</h2>
      <span class="text-muted head-note">{{ t('dashboard.liveSessions') }}</span>
    </div>

    <div class="hours-grid">
      <article v-for="market in markets" :key="market.key" class="market-tile">
        <div class="tile-top">
          <div>
            <div class="market-name">{{ market.name }}</div>
            <div class="market-city text-muted">{{ market.city }}</div>
          </div>
          <span :class="market.isOpen ? 'state-open' : 'state-closed'" class="state-pill">
            {{ market.isOpen ? t('common.open') : t('dashboard.closed') }}
          </span>
        </div>

        <div class="market-time">{{ market.localTime }}</div>
        <div class="market-meta">
          <span class="text-muted">{{ displayMarketHoursLabel(market.nextLabel) }}</span>
          <span class="session" v-html="displaySessionLabel(market.sessionLabel)"/>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.hours-card {
  background: radial-gradient(circle at top right, rgba(0, 207, 255, 0.08), transparent 32%), var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 0.9rem 1rem;
  margin-bottom: 0.75rem;
}

.hours-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.card-title {
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary);
  margin: 0;
}

.head-note {
  font-size: 0.72rem;
}

.hours-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.55rem;
}

.market-tile {
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 12px;
  padding: 0.75rem;
  background: rgba(15, 23, 42, 0.2);
  min-height: 112px;
}

.tile-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.5rem;
}

.market-name {
  font-size: 0.82rem;
  font-weight: 800;
  color: var(--text-primary);
}

.market-city {
  font-size: 0.68rem;
  margin-top: 2px;
}

.state-pill {
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 0.64rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.state-open {
  color: #022c22;
  background: #86efac;
}

.state-closed {
  color: #fee2e2;
  background: rgba(224, 45, 74, 0.22);
}

.market-time {
  font-size: 1.2rem;
  font-weight: 700;
  line-height: 1;
  color: var(--text-primary);
  margin-top: 0.8rem;
}

.market-meta {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  margin-top: 0.55rem;
}

.market-meta .text-muted,
.session {
  font-size: 0.68rem;
}

.session {
  color: #93c5fd;
}

@media (min-width: 768px) {
  .hours-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
</style>
