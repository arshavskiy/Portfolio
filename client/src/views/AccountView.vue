<script setup>
import {computed, onMounted, ref} from 'vue'
import {useRouter} from 'vue-router'
import {useAuthStore} from '@/stores/auth'
import {usePortfolioStore} from '@/stores/portfolio'
import {gainLossClass, useCurrency, usePercent} from '@/composables/useFormat'
import {useFullscreen, usePwaInstall} from '@/composables/usePwa'
import {useBreakpoint} from '@/composables/useBreakpoint'
import {useTour} from '@/composables/useTour'
import {useToast} from 'primevue/usetoast'
import Button from 'primevue/button'
import FeeProfilesModal from '@/components/modals/FeeProfilesModal.vue'
import LanguageSelect from '@/components/ui/LanguageSelect.vue'
import ThemeToggle from '@/components/ui/ThemeToggle.vue'
import {useI18n} from '@/composables/useI18n'

const router = useRouter()
const toast = useToast()
const auth = useAuthStore()
const portfolio = usePortfolioStore()
const showFeeProfiles = ref(false)
const {locale, t} = useI18n()

const {isDesktop} = useBreakpoint()
const { canInstall, installed, isIos, promptInstall } = usePwaInstall()
const { isFullscreen, supported: fsSupported, toggle: toggleFullscreen } = useFullscreen()
const {startNavPhase, resetTour} = useTour()

function goAlerts() { router.push(isDesktop.value ? '/history-alerts' : '/alerts') }
function goTransactions() { router.push(isDesktop.value ? '/history-alerts' : '/records') }
function replayTour() {
  resetTour()
  router.push('/').then(() => startNavPhase())
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

onMounted(async () => {
  auth.fetchMe().catch(() => {})
  if (!portfolio.positions.length) portfolio.fetchPortfolio().catch(() => {})
})

function logout() {
  auth.logout()
  router.push('/login')
}
</script>

<template>
  <div class="profile safe-bottom">
    <header class="page-header">
      <h1 class="gradient-title">{{ t('common.account') }}</h1>
    </header>

    <div class="profile-layout">
      <div class="main-col">
        <!-- Identity card -->
        <div class="profile-card">
<!--          <Avatar-->
<!--              :label="(auth.user?.name || auth.user?.email || '?').charAt(0).toUpperCase()"-->
<!--            size="xlarge"-->
<!--            class="avatar"-->
<!--          />-->
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
              <span class="meta-pill">
                {{ t('account.aiTokensToday') }}: {{ aiTokenUsageLabel }}
              </span>
            </div>
          </div>
          <div class="flex justify-between">
            <Button
                class="sign-out-btn w-[120px]"
                :label="t('account.signOut')"
                severity="danger"
                @click="logout"

            />
          </div>

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
          <!-- Menu -->
          <div class="menu-list">
            <button class="menu-item" @click="showFeeProfiles = true">
              <i class="pi pi-percentage menu-icon"/>
              <span>{{ t('account.feeProfiles') }}</span>
              <i class="pi pi-chevron-right text-muted" />
            </button>
            <button class="menu-item" @click="goAlerts">
              <i class="pi pi-bell menu-icon"/>
              <span>{{ t('account.priceAlerts') }}</span>
              <i class="pi pi-chevron-right text-muted" />
            </button>
            <button class="menu-item" @click="goTransactions">
              <i class="pi pi-list menu-icon"/>
              <span>{{ t('common.history') }}</span>
              <i class="pi pi-chevron-right text-muted"/>
            </button>
          </div>

          <!-- App -->
          <div class="menu-list">
            <button v-if="!installed" class="menu-item" @click="install">
              <i class="pi pi-download menu-icon"/>
              <span>{{ t('account.installApp') }}</span>
              <i class="pi pi-chevron-right text-muted" />
            </button>
            <button v-if="fsSupported" class="menu-item" @click="toggleFullscreen">
              <i class="pi pi-window-maximize menu-icon"/>
              <span>{{ isFullscreen ? t('account.exitFullscreen') : t('account.fullscreen') }}</span>
              <i class="pi pi-chevron-right text-muted" />
            </button>
            <button class="menu-item" @click="replayTour">
              <i class="pi pi-compass menu-icon"/>
              <span>{{ t('account.startTour') }}</span>
              <i class="pi pi-chevron-right text-muted" />
            </button>
            <div class="menu-item language-menu-item">
              <i class="pi pi-language menu-icon"/>
              <span>{{ t('common.language') }}</span>
              <LanguageSelect/>
            </div>
            <div class="menu-item theme-menu-item">
              <i class="pi pi-palette menu-icon"/>
              <span>{{ t('account.theme') }}</span>
              <ThemeToggle/>
            </div>
          </div>
        </div>

        <p class="legal text-muted main-legal">
          © {{ new Date().getFullYear() }} StockFolio ·
          <RouterLink to="/disclaimer">{{ t('common.disclaimer') }}</RouterLink>
          · <a alt="www.handcoded.tech"
                                                                                     href="//handcoded.tech">
          handcoded.tech </a>. {{ t('common.allRightsReserved') }}
        </p>
      </div>
    </div>

    <FeeProfilesModal v-model:visible="showFeeProfiles" />
  </div>
</template>

<style scoped>
.profile {
  padding: 1rem;
  overflow-y: auto;
  height: 100%;
}

@media (min-width: 768px) {
  .profile {
    padding: 2rem;
  }
}

@media (min-width: 1024px) {
  .profile {
    padding: 2.5rem 3rem;
  }
}

.page-header {
  margin-bottom: 1rem;
}

.profile-layout {
  display: flex;
  flex-direction: column;
}

@media (min-width: 1024px) {
  .profile-layout {
    flex-direction: row;
    align-items: flex-start;
    gap: 2rem;
    max-width: 1100px;
    margin: 0 auto;
  }

  .main-col {
    flex: 1.7;
    min-width: 0;
  }
}

/* Identity */
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

.profile-card > *:last-child {
  margin-left: auto;
}

.avatar {
  background: var(--accent);
  color: #fff;
  font-size: 1.5rem;
  flex-shrink: 0;
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

/* Stats */
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

/* Menu */
.menu-grid {
  display: flex;
  flex-direction: column;
}

@media (min-width: 1024px) {
  .menu-grid {
    flex-direction: row;
    gap: 1rem;
  }

  .menu-grid .menu-list {
    flex: 1;
    min-width: 0;
  }
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
.menu-item:last-child { border-bottom: none; }

.menu-item:active {
  background: color-mix(in srgb, var(--text-primary) 4%, transparent);
}
.menu-item span { flex: 1; }

.menu-icon {
  color: var(--accent);
  font-size: 1rem;
}

.legal { text-align: center; font-size: 0.72rem; margin-top: 0.5rem; padding-bottom: 1rem; }
</style>
