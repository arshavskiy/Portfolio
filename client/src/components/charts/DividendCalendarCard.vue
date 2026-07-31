<script setup>
import {computed, onMounted, ref} from 'vue'
import api from '@/composables/useApi'
import {useTickerCurrency} from '@/composables/useFormat'
import {useNavigateToPosition} from '@/composables/useNavigateToPosition'
import {useI18n} from '@/composables/useI18n'

const {t, locale} = useI18n()
const {openPosition} = useNavigateToPosition()
const props = defineProps({
  hideLoading: {type: Boolean, default: false},
})

const events = ref([])
const loading = ref(true)

onMounted(async () => {
  try {
    const data = await api.get('/portfolio/dividends/calendar')
    events.value = data?.events || []
  } catch {
    events.value = []
  } finally {
    loading.value = false
  }
})

const upcoming = computed(() => events.value.slice(0, 6))

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString(locale.value === 'ru' ? 'ru-RU' : 'en-US', {
    month: 'short',
    day: 'numeric',
  })
}

function isPast(d) {
  return d && new Date(d).getTime() < Date.now() - 86400000
}

function daysUntil(d) {
  if (!d) return null
  const days = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000)
  return days >= 0 ? days : null
}

function exDivLabel(event) {
  const days = daysUntil(event.exDividendDate)
  if (days === 0) return t('dividendCalendar.today')
  if (days === 1) return t('dividendCalendar.tomorrow')
  if (days != null && days <= 14) return t('dividendCalendar.inDays', {days})
  return formatDate(event.exDividendDate)
}
</script>

<template>
  <section v-if="(loading && !props.hideLoading) || upcoming.length" class="div-calendar-card">
    <h2 class="section-title">{{ t('dividendCalendar.title') }}</h2>

    <div v-if="loading && !upcoming.length && !props.hideLoading" class="cal-list">
      <div v-for="n in 3" :key="n" class="cal-row skeleton"/>
    </div>

    <div v-else class="cal-list">
      <button
          v-for="event in upcoming"
          :key="event.ticker"
          class="cal-row"
          type="button"
          @click="openPosition(event.ticker, event.companyName)"
      >
        <div class="cal-left">
          <span class="ticker">{{ event.ticker }}</span>
          <span class="company text-muted">{{ event.companyName || event.ticker }}</span>
        </div>
        <div class="cal-dates">
          <div v-if="event.exDividendDate" class="cal-date">
            <span class="date-label text-muted">{{ t('dividendCalendar.exDiv') }}</span>
            <span :class="{past: isPast(event.exDividendDate)}" class="date-value">{{ exDivLabel(event) }}</span>
          </div>
          <div v-if="event.dividendDate" class="cal-date">
            <span class="date-label text-muted">{{ t('dividendCalendar.payDate') }}</span>
            <span class="date-value">{{ formatDate(event.dividendDate) }}</span>
          </div>
        </div>
        <div class="cal-right">
          <span v-if="event.estimatedPayout != null" class="payout gain">
            +{{ useTickerCurrency(event.estimatedPayout, event.ticker) }}
          </span>
          <span v-if="event.lastDividendValue != null" class="per-share text-muted">
            {{ useTickerCurrency(event.lastDividendValue, event.ticker) }} {{ t('dividendCalendar.perShare') }}
          </span>
        </div>
      </button>
    </div>
  </section>
</template>

<style scoped>
.div-calendar-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 0.9rem 1rem 0.6rem;
  margin-bottom: 0.75rem;
}

.section-title {
  margin: 0 0 0.6rem;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.cal-list {
  display: flex;
  flex-direction: column;
}

.cal-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.6rem 0;
  border: none;
  border-bottom: 1px solid var(--border);
  background: none;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.cal-row:last-child {
  border-bottom: none;
}

.cal-left {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.ticker {
  font-weight: 700;
  font-size: 0.88rem;
}

.company {
  font-size: 0.7rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 120px;
}

.cal-dates {
  display: flex;
  gap: 0.9rem;
}

.cal-date {
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: flex-start;
}

.date-label {
  font-size: 0.62rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.date-value {
  font-size: 0.8rem;
  font-weight: 600;
}

.date-value.past {
  opacity: 0.5;
  text-decoration: line-through;
}

.cal-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.payout {
  font-size: 0.85rem;
  font-weight: 700;
}

.per-share {
  font-size: 0.68rem;
}

.skeleton {
  min-height: 44px;
  border-radius: 10px;
  border-bottom: none;
  margin-bottom: 6px;
  background: linear-gradient(90deg, var(--bg-card) 25%, #1a1a1a 50%, var(--bg-card) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}

@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}
</style>
