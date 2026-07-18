<script setup>
import {computed} from 'vue'
import {useRouter} from 'vue-router'
import {useAuthStore} from '@/stores/auth'
import {usePortfolioStore} from '@/stores/portfolio'
import {gainLossClass, useCurrency, usePercent} from '@/composables/useFormat'
import {useFullscreen, usePwaInstall} from '@/composables/usePwa'
import {useTour} from '@/composables/useTour'
import {useToast} from 'primevue/usetoast'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import FeeProfilesModal from '@/components/ui/FeeProfilesModal.vue'
import LanguageSelect from '@/components/ui/LanguageSelect.vue'
import {useI18n} from '@/composables/useI18n'
import {ref} from 'vue'
import TransactionsView from '@/views/TransactionsView.vue'
import AlertsView from '@/views/AlertsView.vue'
import ToggleSwitch from 'primevue/toggleswitch'

const visible = defineModel('visible', {type: Boolean, default: false})

const router = useRouter()
const toast = useToast()
const auth = useAuthStore()
const portfolio = usePortfolioStore()
const showFeeProfiles = ref(false)
const showHistory = ref(false)
const showAlerts = ref(false)
const {locale, t} = useI18n()

const {isFullscreen, supported: fsSupported, toggle: toggleFullscreen} = useFullscreen()
const {canInstall, installed, isIos, promptInstall} = usePwaInstall()
const {startTour, resetTour} = useTour()
const aiSummaryEnabled = computed({
  get: () => auth.user?.aiDailySummaryEnabled !== false,
  set: (value) => { auth.updatePreferences({aiDailySummaryEnabled: value}).catch(() => {}) },
})

function replayTour() {
  visible.value = false
  resetTour()
  startTour()
}

async function install() {
  if (canInstall.value) {
    const ok = await promptInstall()
    if (ok) toast.add({severity: 'success', summary: t('account.appInstalled'), life: 2000})
  } else if (isIos) {
    toast.add({
      severity: 'info',
      summary: t('account.addToHomeScreen'),
      detail: t('account.iosInstallDetail'),
      life: 5000,
    })
  } else {
    toast.add({
      severity: 'info',
      summary: t('account.install'),
      detail: t('account.browserInstallDetail'),
      life: 5000,
    })
  }
}

const summary = computed(() => portfolio.combinedUsd)
const positionCount = computed(() => portfolio.positions.length)
const userType = computed(() => auth.user?.userType || 'regular')
const userTypeLabel = computed(() => t(`account.userTypes.${userType.value}`))
const aiUsageSummary = computed(() => auth.user?.aiUsageSummary || {
  todayCount: 0,
  dailyLimit: userType.value === 'regular' ? 3 : null,
  unlimited: userType.value !== 'regular',
})
const aiUsageLabel = computed(() =>
  aiUsageSummary.value.unlimited
    ? `${aiUsageSummary.value.todayCount} · ${t('account.unlimited')}`
    : `${aiUsageSummary.value.todayCount}/${aiUsageSummary.value.dailyLimit}`
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
          <div class="profile-meta">
            <span class="meta-pill">
              {{ t('account.userType') }}: {{ userTypeLabel }}
            </span>
            <span class="meta-pill">
              {{ t('account.aiCallsToday') }}: {{ aiUsageLabel }}
            </span>
          </div>
        </div>
        <Button
            :label="t('account.signOut')"
            class="sign-out-btn w-[120px]"
            severity="danger"
            @click="logout"
        />
      </div>

      <!-- Portfolio snapshot -->
      <div v-if="summary" class="stats-card">
        <div class="stat">
          <span class="stat-label text-muted">{{ t('account.netWorth') }}</span>
          <span class="stat-value">{{ useCurrency(summary.value, 'USD') }}</span>
        </div>
        <div class="stat">
          <span class="stat-label text-muted">{{ t('account.totalPnl') }}</span>
          <span :class="gainLossClass(summary.pnl)" class="stat-value">
            {{ summary.pnl >= 0 ? '+' : '' }}{{ useCurrency(summary.pnl, 'USD') }}
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
          <button class="menu-item" @click="showFeeProfiles = true">
            <i class="pi pi-percentage menu-icon"/>
            <span>{{ t('account.feeProfiles') }}</span>
            <i class="pi pi-chevron-right text-muted"/>
          </button>
          <button class="menu-item" @click="showAlerts = true">
            <i class="pi pi-bell menu-icon"/>
            <span>{{ t('account.priceAlerts') }}</span>
            <i class="pi pi-chevron-right text-muted"/>
          </button>
          <button class="menu-item" @click="showHistory = true">
            <i class="pi pi-list menu-icon"/>
            <span>{{ t('common.history') }}</span>
            <i class="pi pi-chevron-right text-muted"/>
          </button>
        </div>

        <div class="menu-list">
          <button v-if="!installed" class="menu-item" @click="install">
            <i class="pi pi-download menu-icon"/>
            <span>{{ t('account.installApp') }}</span>
            <i class="pi pi-chevron-right text-muted"/>
          </button>
          <button v-if="fsSupported" class="menu-item" @click="toggleFullscreen">
            <i class="pi pi-window-maximize menu-icon"/>
            <span>{{ isFullscreen ? t('account.exitFullscreen') : t('account.fullscreen') }}</span>
            <i class="pi pi-chevron-right text-muted"/>
          </button>
          <button class="menu-item" @click="replayTour">
            <i class="pi pi-compass menu-icon"/>
            <span>{{ t('account.startTour') }}</span>
            <i class="pi pi-chevron-right text-muted"/>
          </button>
          <div class="menu-item language-menu-item">
            <i class="pi pi-language menu-icon"/>
            <span>{{ t('common.language') }}</span>
            <LanguageSelect/>
            <i class="pi pi-chevron-right text-muted"/>
          </div>
          <div class="menu-item">
            <i class="pi pi-sparkles menu-icon"/>
            <span>{{ t('account.aiDailySummary') }}</span>
            <ToggleSwitch v-model="aiSummaryEnabled"/>
          </div>
        </div>
      </div>

      <p class="legal text-muted">
        © {{ new Date().getFullYear() }} StockFolio ·
        <RouterLink to="/disclaimer" @click="visible = false">{{ t('common.disclaimer') }}</RouterLink>
        · <a alt="www.handcoded.tech" href="//handcoded.tech">handcoded.tech</a>. {{ t('common.allRightsReserved') }}
      </p>
    </div>

    <FeeProfilesModal v-model:visible="showFeeProfiles"/>

    <Dialog
        v-model:visible="showHistory"
        :draggable="false"
        :style="{ width: '95vw', maxWidth: '640px' }"
        modal
    >
      <template #header>
        <span class="gradient-title">{{ t('common.history') }}</span>
      </template>
      <TransactionsView embedded/>
    </Dialog>

    <Dialog
        v-model:visible="showAlerts"
        :draggable="false"
        :style="{ width: '95vw', maxWidth: '520px' }"
        modal
    >
      <template #header>
        <span class="gradient-title">{{ t('account.priceAlerts') }}</span>
      </template>
      <AlertsView embedded/>
    </Dialog>
  </Dialog>
</template>

<style scoped>
.profile {
  display: flex;
  flex-direction: column;
}

.profile-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 16px;
  margin-bottom: 0.75rem;
}

.sign-out-btn {
  margin-left: auto;
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
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin-top: 0.55rem;
}

.meta-pill,
.type-chip {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0.2rem 0.55rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 700;
  line-height: 1;
}

.meta-pill {
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-secondary);
}

.type-chip-regular {
  background: rgba(0, 207, 255, 0.12);
  border-color: rgba(0, 207, 255, 0.35);
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
  color: #fbbf24;
}

.type-chip-admin {
  background: rgba(239, 68, 68, 0.12);
  border-color: rgba(239, 68, 68, 0.35);
  color: #f87171;
}

.type-chip-plan {
  background: rgba(168, 85, 247, 0.14);
  border-color: rgba(168, 85, 247, 0.35);
  color: #c084fc;
}

.stats-card {
  display: grid;
  grid-template-columns: 2fr 4fr 1fr;
  gap: 0.5rem;
  padding: 1rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 16px;
  margin-bottom: 1.5rem;
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.stat:nth-child(2) {
  border-left: 1px solid var(--border);
  border-right: 1px solid var(--border);
  padding: 0 0.5rem;
}

.stat-label {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.stat-value {
  font-size: 1rem;
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
  background: rgba(255, 255, 255, 0.04);
}

.menu-item span {
  flex: 1;
}

.language-menu-item :deep(.language-select) {
  border-color: transparent;
  background: transparent;
  padding: 0;
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
</style>
