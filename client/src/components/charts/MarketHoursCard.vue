<script setup>
import {computed, onMounted, onUnmounted, ref} from 'vue'

const now = ref(new Date())
let timer = null

const MARKETS = [
  {
    key: 'us',
    name: 'NYSE',
    city: 'New York',
    timezone: 'America/New_York',
    days: [1, 2, 3, 4, 5],
    sessions: [{start: '09:30', end: '16:00'}],
  },
  {
    key: 'israel',
    name: 'TASE',
    city: 'Tel Aviv',
    timezone: 'Asia/Jerusalem',
    days: [0, 1, 2, 3, 4],
    sessions: [{start: '09:59', end: '17:25'}],
  },
  {
    key: 'uk',
    name: 'LSE',
    city: 'London',
    timezone: 'Europe/London',
    days: [1, 2, 3, 4, 5],
    sessions: [{start: '08:00', end: '16:30'}],
  },
  {
    key: 'japan',
    name: 'TSE',
    city: 'Tokyo',
    timezone: 'Asia/Tokyo',
    days: [1, 2, 3, 4, 5],
    sessions: [
      {start: '09:00', end: '11:30'},
      {start: '12:30', end: '15:30'},
    ],
  },
]

function timeParts(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const weekdayMap = {Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6}
  return {
    weekday: weekdayMap[map.weekday],
    hour: Number(map.hour),
    minute: Number(map.minute),
  }
}

function toMinutes(value) {
  const [hour, minute] = value.split(':').map(Number)
  return (hour * 60) + minute
}

function formatClock(date, timezone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function formatDuration(totalMinutes) {
  if (!Number.isFinite(totalMinutes) || totalMinutes < 0) return ''
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours <= 0) return `${minutes}m`
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${minutes}m`
}

function nextSessionOpen(market, weekday, currentMinutes, sessions) {
  for (let dayOffset = 0; dayOffset < 8; dayOffset++) {
    const day = (weekday + dayOffset) % 7
    if (!market.days.includes(day)) continue

    for (const session of sessions) {
      if (dayOffset === 0 && session.startMinutes <= currentMinutes) continue
      return {
        inMinutes: (dayOffset * 1440) + (session.startMinutes - currentMinutes),
        start: session.start,
      }
    }
  }

  return null
}

function marketState(market, date) {
  const parts = timeParts(date, market.timezone)
  const currentMinutes = (parts.hour * 60) + parts.minute
  const sessions = market.sessions.map((session) => ({
    ...session,
    startMinutes: toMinutes(session.start),
    endMinutes: toMinutes(session.end),
  }))

  const isTradingDay = market.days.includes(parts.weekday)
  const activeSession = isTradingDay
    ? sessions.find((session) => currentMinutes >= session.startMinutes && currentMinutes < session.endMinutes)
    : null

  const nextOpen = nextSessionOpen(market, parts.weekday, currentMinutes, sessions)

  let nextLabel = 'Closed'
  if (activeSession) {
    nextLabel = `Closes ${activeSession.end}`
  } else if (nextOpen) {
    nextLabel = `Opens in ${formatDuration(nextOpen.inMinutes)}`
  }

  const sessionLabel = sessions.map((session) => `${session.start}-${session.end}`).join(' , ')

  return {
    ...market,
    localTime: formatClock(date, market.timezone),
    isOpen: Boolean(activeSession),
    nextLabel,
    sessionLabel,
  }
}

const markets = computed(() => MARKETS.map((market) => marketState(market, now.value)))

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
      <h2 class="card-title">Market Hours</h2>
      <span class="text-muted head-note">Live sessions</span>
    </div>

    <div class="hours-grid">
      <article v-for="market in markets" :key="market.key" class="market-tile">
        <div class="tile-top">
          <div>
            <div class="market-name">{{ market.name }}</div>
            <div class="market-city text-muted">{{ market.city }}</div>
          </div>
          <span :class="market.isOpen ? 'state-open' : 'state-closed'" class="state-pill">
            {{ market.isOpen ? 'Open' : 'Closed' }}
          </span>
        </div>

        <div class="market-time">{{ market.localTime }}</div>
        <div class="market-meta">
          <span class="text-muted">{{ market.nextLabel }}</span>
          <span class="session">{{ market.sessionLabel }}</span>
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
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
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
