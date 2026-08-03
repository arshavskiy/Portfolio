<script setup>
import {computed} from 'vue'
import {useRouter} from 'vue-router'
import {useAuthStore} from '@/stores/auth'
import {usePortfolioStore} from '@/stores/portfolio'
import {gainLossClass, useCurrency, usePercent} from '@/composables/useFormat'
import {useBreakpoint} from '@/composables/useBreakpoint'
import {usePortfolioDisplayCurrency} from '@/composables/usePortfolioDisplayCurrency'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import {useI18n} from '@/composables/useI18n'

const visible = defineModel('visible', {type: Boolean, default: false})
const emit = defineEmits(['open-settings', 'open-about'])

const router = useRouter()
const auth = useAuthStore()
const portfolio = usePortfolioStore()
const {isDesktop} = useBreakpoint()
const {locale, t} = useI18n()
const {
  convertUsd: convertPortfolioUsd,
  displayCurrencyForRate: portfolioCurrencyForRate,
} = usePortfolioDisplayCurrency()

function openSettings() {
  visible.value = false
  emit('open-settings')
}

function openAbout() {
  visible.value = false
  emit('open-about')
}

const summary = computed(() => portfolio.combinedUsd)
const summaryCurrency = computed(() => portfolioCurrencyForRate(summary.value?.ilsToUsd))
const summaryValue = computed(() => convertPortfolioUsd(summary.value?.value, summary.value?.ilsToUsd))
const summaryPnl = computed(() => convertPortfolioUsd(summary.value?.pnl, summary.value?.ilsToUsd))
const positionCount = computed(() => portfolio.positions.length)
const userType = computed(() => auth.userType)
const userTypeLabel = computed(() => t(`account.userTypes.${userType.value}`))
const aiUsageSummary = computed(() => auth.user?.aiUsageSummary || {
  todayCount: 0,
  dailyLimit: userType.value === 'regular' ? 3 : null,
  todayTokenCount: 0,
  dailyTokenLimit: 100000,
  unlimited: userType.value !== 'regular',
})
const aiUsageLabel = computed(() =>
  aiUsageSummary.value.unlimited
    ? `${aiUsageSummary.value.todayCount} · ${t('account.unlimited')}`
    : `${aiUsageSummary.value.todayCount}/${aiUsageSummary.value.dailyLimit}`
)
const aiTokenUsageLabel = computed(() =>
  aiUsageSummary.value.dailyTokenLimit == null
    ? `${(aiUsageSummary.value.todayTokenCount || 0).toLocaleString()} · ${t('account.unlimited')}`
    : `${(aiUsageSummary.value.todayTokenCount || 0).toLocaleString()}/${aiUsageSummary.value.dailyTokenLimit.toLocaleString()}`
)

const memberSince = computed(() => {
  const d = auth.user?.createdAt
  if (!d) return null
  return new Date(d).toLocaleDateString(locale.value === 'ru' ? 'ru-RU' : 'en-US', {month: 'short', year: 'numeric'})
})

function handleShow() {
  auth.fetchMe().catch(() => {})
  if (!portfolio.positions.length) portfolio.fetchPortfolio().catch(() => {})
}

function logout() {
  visible.value = false
  auth.logout()
  router.push('/login')
}
</script>

<template>
  <Dialog
      v-model:visible="visible"
      :draggable="false"
      :style="{ width: '95vw', maxWidth: '520px' }"
      modal
      @show="handleShow"
  >
    <template #header>
      <span class="gradient-title">{{ t('common.account') }}</span>
    </template>

    <div class="profile">
      <!-- Identity card -->
      <div class="profile-card">
        <div class="profile-info">
          <div class="profile-name-row">
            <p class="profile-name">{{ auth.user?.name || t('common.account') }}</p>
            <span :class="`type-chip type-chip-${userType}`">{{ userTypeLabel }}</span>
          </div>
          <p class="profile-email text-muted">
            {{ auth.user?.email || (auth.user?.username ? '@' + auth.user.username : '—') }}</p>
          <p v-if="memberSince" class="member-since text-muted">{{
              t('account.memberSince', {date: memberSince})
            }}</p>
        </div>
        <Button
            :label="t('account.signOut')"
            class="sign-out-btn w-[120px]"
            severity="danger"
            @click="logout"
        />
        <dl class="profile-meta">
          <div class="profile-meta-row">
            <dt>{{ t('account.userType') }}</dt>
            <dd>{{ userTypeLabel }}</dd>
          </div>
          <div class="profile-meta-row">
            <dt>{{ t('account.aiCallsToday') }}</dt>
            <dd>{{ aiUsageLabel }}</dd>
          </div>
          <div class="profile-meta-row">
            <dt>{{ t('account.aiTokensToday') }}</dt>
            <dd>{{ aiTokenUsageLabel }}</dd>
          </div>
        </dl>
      </div>

      <!-- Portfolio snapshot -->
      <div v-if="summary" class="stats-card">
        <div class="stat">
          <span class="stat-label text-muted">{{ t('account.netWorth') }}</span>
          <span class="stat-value">{{ useCurrency(summaryValue, summaryCurrency) }}</span>
        </div>
        <div class="stat">
          <span class="stat-label text-muted">{{ t('account.totalPnl') }}</span>
          <span :class="gainLossClass(summaryPnl)" class="stat-value">
            {{ summaryPnl >= 0 ? '+' : '' }}{{ useCurrency(summaryPnl, summaryCurrency) }}
            <span class="stat-pct">({{ usePercent(summary.pnlPercent) }})</span>
          </span>
        </div>
        <div class="stat">
          <span class="stat-label text-muted">{{ t('account.holdings') }}</span>
          <span class="stat-value">{{ positionCount }}</span>
        </div>
      </div>

      <div class="menu-grid">
        <div class="menu-list">
          <RouterLink class="menu-item" to="/records" @click="visible = false">
            <i class="pi pi-list menu-icon"/>
            <span>{{ t('nav.records') }}</span>
            <i class="pi pi-chevron-right text-muted"/>
          </RouterLink>
          <button class="menu-item" @click="openSettings">
            <i class="pi pi-cog menu-icon"/>
            <span>{{ t('common.settings') }}</span>
            <i class="pi pi-chevron-right text-muted"/>
          </button>
          <button v-if="isDesktop" class="menu-item" @click="openAbout">
            <i class="pi pi-info-circle menu-icon"/>
            <span>{{ t('common.about') }}</span>
            <i class="pi pi-chevron-right text-muted"/>
          </button>
          <RouterLink v-else class="menu-item" to="/help" @click="visible = false">
            <i class="pi pi-info-circle menu-icon"/>
            <span>{{ t('common.about') }}</span>
            <i class="pi pi-chevron-right text-muted"/>
          </RouterLink>
        </div>
      </div>

      <p class="legal text-muted">
        © {{ new Date().getFullYear() }} StockFolio ·
        <RouterLink to="/disclaimer" @click="visible = false">{{ t('common.disclaimer') }}</RouterLink>
        · <a alt="www.handcoded.tech" href="//handcoded.tech">handcoded.tech</a>. {{ t('common.allRightsReserved') }}
      </p>
    </div>
  </Dialog>
</template>

<style scoped>
.profile {
  display: flex;
  flex-direction: column;
}

.profile-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 0.75rem;
  padding: 1rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 16px;
  margin-bottom: 0.75rem;
}

.sign-out-btn {
  margin-left: auto;
  width: auto !important;
  min-width: 72px;
  max-width: 86px;
  padding-inline: 0.75rem !important;
  font-size: 0.72rem !important;
  line-height: 1.1;
}

.profile-info {
  min-width: 0;
}

.profile-name-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.profile-name {
  font-weight: 700;
  font-size: 1.15rem;
  margin: 0;
}

.profile-email {
  font-size: 0.85rem;
  margin-top: 1px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.member-since {
  font-size: 0.72rem;
  margin-top: 4px;
}

.profile-meta {
  grid-column: 1 / -1;
  display: grid;
  gap: 0.25rem;
  margin: 0.1rem 0 0;
  padding-top: 0.6rem;
  border-top: 1px solid var(--border);
  max-width: 100%;
}

.type-chip {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  min-height: 24px;
  padding: 0.2rem 0.55rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 700;
  line-height: 1.15;
}

.profile-meta-row {
  display: grid;
  grid-template-columns: minmax(108px, 0.9fr) minmax(0, 1.1fr);
  gap: 0.75rem;
  align-items: baseline;
  font-size: 0.7rem;
  line-height: 1.25;
}

.profile-meta-row dt {
  color: var(--text-secondary);
  font-weight: 600;
}

.profile-meta-row dd {
  min-width: 0;
  margin: 0;
  color: var(--text-primary);
  font-weight: 700;
  text-align: left;
  overflow-wrap: anywhere;
}

.type-chip-regular {
  background: color-mix(in srgb, var(--neon-blue) 12%, transparent);
  border-color: color-mix(in srgb, var(--neon-blue) 35%, transparent);
  color: var(--neon-blue);
}

.type-chip-pro {
  background: rgba(34, 197, 94, 0.12);
  border-color: rgba(34, 197, 94, 0.35);
  color: #4ade80;
}

.type-chip-max {
  background: rgba(245, 158, 11, 0.14);
  border-color: rgba(245, 158, 11, 0.35);
  color: var(--gold);
}

.type-chip-admin {
  background: rgba(239, 68, 68, 0.12);
  border-color: rgba(239, 68, 68, 0.35);
  color: #f87171;
}

.type-chip-plan {
  background: color-mix(in srgb, var(--purple) 14%, transparent);
  border-color: color-mix(in srgb, var(--purple) 35%, transparent);
  color: var(--purple);
}

.stats-card {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0;
  padding: 0.9rem 0;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 16px;
  margin-bottom: 1.25rem;
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: 0 0.65rem;
}

.stat:nth-child(2) {
  border-left: 1px solid var(--border);
  border-right: 1px solid var(--border);
}

.stat-label {
  font-size: 0.63rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  line-height: 1.15;
  white-space: nowrap;
}

.stat-value {
  display: block;
  max-width: 100%;
  font-size: 0.92rem;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stat-pct {
  font-size: 0.72rem;
  font-weight: 600;
}

.menu-grid {
  display: flex;
  flex-direction: column;
}

.menu-list {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 1.25rem;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  width: 100%;
  padding: 0.9rem 1rem;
  border: none;
  border-bottom: 1px solid var(--border);
  background: none;
  color: var(--text-primary);
  font-size: 0.92rem;
  cursor: pointer;
  transition: background 0.15s;
  text-align: left;
}

.menu-item:last-child {
  border-bottom: none;
}

.menu-item:active {
  background: color-mix(in srgb, var(--text-primary) 4%, transparent);
}

.menu-item span {
  flex: 1;
}

.menu-icon {
  color: var(--accent);
  font-size: 1rem;
}

.legal {
  text-align: center;
  font-size: 0.72rem;
  margin-top: 0.5rem;
}


@media (max-width: 380px) {
  .profile-card {
    grid-template-columns: 1fr;
  }

  .sign-out-btn {
    justify-self: start;
    margin-left: 0;
  }

  .stats-card {
    padding: 0.75rem 0;
  }

  .stat {
    padding: 0 0.5rem;
  }

  .stat-label {
    font-size: 0.58rem;
  }

  .stat-value {
    font-size: 0.84rem;
  }
}
</style>
