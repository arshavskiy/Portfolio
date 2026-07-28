<script setup>
import {computed, ref, watch} from 'vue'
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
import PremiumBadge from '@/components/ui/PremiumBadge.vue'
import ThemeToggle from '@/components/ui/ThemeToggle.vue'
import {useI18n} from '@/composables/useI18n'
import TransactionsView from '@/views/TransactionsView.vue'
import AlertsView from '@/views/AlertsView.vue'
import ToggleSwitch from 'primevue/toggleswitch'
import Textarea from 'primevue/textarea'

const visible = defineModel('visible', {type: Boolean, default: false})

const router = useRouter()
const toast = useToast()
const auth = useAuthStore()
const portfolio = usePortfolioStore()
const showFeeProfiles = ref(false)
const showHistory = ref(false)
const showAlerts = ref(false)
const historyView = ref(null)
const {locale, t} = useI18n()

const {isFullscreen, supported: fsSupported, toggle: toggleFullscreen} = useFullscreen()
const {canInstall, installed, isIos, promptInstall} = usePwaInstall()
const {startNavPhase, resetTour} = useTour()
const aiSummaryEnabled = computed({
  get: () => auth.user?.aiDailySummaryEnabled !== false,
  set: (value) => {
    if (value) {
      localStorage.removeItem('daily-summary-dismissed-day')
      window.dispatchEvent(new Event('daily-summary:show'))
    }
    auth.updatePreferences({aiDailySummaryEnabled: value}).catch(() => {})
  },
})

const canCustomizePrompt = computed(() => ['pro', 'max', 'admin'].includes(userType.value))
const customPromptDraft = ref(auth.user?.aiDailySummaryCustomPrompt || '')
const customPromptSaving = ref(false)
watch(() => auth.user?.aiDailySummaryCustomPrompt, (value) => {
  customPromptDraft.value = value || ''
})
async function saveCustomPrompt() {
  if (customPromptDraft.value === (auth.user?.aiDailySummaryCustomPrompt || '')) return
  customPromptSaving.value = true
  try {
    await auth.updatePreferences({aiDailySummaryCustomPrompt: customPromptDraft.value})
  } catch {
    toast.add({severity: 'error', summary: t('account.customPromptSaveFailed'), life: 3000})
  } finally {
    customPromptSaving.value = false
  }
}

function replayTour() {
  visible.value = false
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
          </div>
          <div class="menu-item theme-menu-item">
            <i class="pi pi-palette menu-icon"/>
            <span>{{ t('account.theme') }}</span>
            <ThemeToggle/>
          </div>
          <div v-if="auth.canUsePremiumFeatures" class="menu-item">
            <i class="pi pi-sparkles menu-icon"/>
            <span>{{ t('account.aiDailySummary') }}</span>
            <ToggleSwitch v-model="aiSummaryEnabled"/>
          </div>
        </div>

        <div v-if="canCustomizePrompt" class="custom-prompt-card">
          <label class="custom-prompt-label" for="custom-prompt">
            <i class="pi pi-pencil menu-icon"/>
            {{ t('account.customPrompt') }}
            <PremiumBadge :label="t('common.premium')" :title="t('common.premiumFeature')" compact/>
          </label>
          <Textarea
              id="custom-prompt"
              v-model="customPromptDraft"
              :placeholder="t('account.customPromptPlaceholder')"
              autoResize
              class="custom-prompt-input"
              maxlength="500"
              rows="2"
              @blur="saveCustomPrompt"
          />
          <span class="custom-prompt-hint text-muted">{{ t('account.customPromptHint') }}</span>
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
        class="history-dialog"
        :draggable="false"
        :style="{ width: '95vw', maxWidth: '640px' }"
        modal
    >
      <template #header>
        <div class="history-dialog-head">
          <span class="gradient-title">{{ t('common.history') }}</span>
          <Button
              :disabled="!historyView?.canExport"
              class="history-export-btn"
              icon="pi pi-download"
              outlined
              rounded
              size="small"
              @click="historyView?.exportActive()"
          />
        </div>
      </template>
      <TransactionsView ref="historyView" embedded/>
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

.custom-prompt-card {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.9rem 1rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  margin-bottom: 1.25rem;
}

.custom-prompt-label {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  font-size: 0.92rem;
  font-weight: 600;
}

.custom-prompt-input {
  width: 100%;
  font-size: 0.85rem;
}

.custom-prompt-hint {
  font-size: 0.7rem;
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

:deep(.history-dialog .p-dialog-header) {
  align-items: center;
  min-height: 56px;
  padding: 1rem 1.25rem 0.4rem;
}

:deep(.history-dialog .p-dialog-title) {
  display: flex;
  align-items: center;
  width: 100%;
}

.history-dialog-head {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  gap: 0.75rem;
}

:deep(.history-export-btn.p-button) {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  background: color-mix(in srgb, var(--accent) 10%, var(--bg-card));
  color: var(--accent);
}

:deep(.history-export-btn.p-button .p-button-icon) {
  color: currentColor;
}

:deep(.history-export-btn.p-button:hover:not(:disabled)) {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 16%, var(--bg-card));
  color: var(--accent);
}

:deep(.history-dialog .p-dialog-content) {
  padding: 0.25rem 1.25rem 0.5rem;
}

:deep(.history-dialog .p-dialog-close-button) {
  width: 44px;
  height: 44px;
  margin: 0;
  border-color: transparent;
  border-radius: 50%;
  background: transparent;
  color: var(--text-secondary);
}

:deep(.history-dialog .p-dialog-close-button .p-button-icon) {
  color: currentColor;
}

:deep(.history-dialog .p-dialog-close-button:hover) {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 9%, var(--bg-card));
  color: var(--text-primary);
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
