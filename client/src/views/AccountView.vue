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
import FeeProfilesModal from '@/components/ui/FeeProfilesModal.vue'

const router = useRouter()
const toast = useToast()
const auth = useAuthStore()
const portfolio = usePortfolioStore()
const showFeeProfiles = ref(false)

const {isDesktop} = useBreakpoint()
const { canInstall, installed, isIos, promptInstall } = usePwaInstall()
const { isFullscreen, supported: fsSupported, toggle: toggleFullscreen } = useFullscreen()
const {startTour, resetTour} = useTour()

function goAlerts() { router.push(isDesktop.value ? '/history-alerts' : '/alerts') }
function goTransactions() { router.push(isDesktop.value ? '/history-alerts' : '/transactions') }
function replayTour() {
  resetTour()
  startTour()
}

async function install() {
  if (canInstall.value) {
    const ok = await promptInstall()
    if (ok) toast.add({ severity: 'success', summary: 'App installed', life: 2000 })
  } else if (isIos) {
    toast.add({
      severity: 'info',
      summary: 'Add to Home Screen',
      detail: 'Tap Share → "Add to Home Screen" to install on iOS.',
      life: 5000,
    })
  } else {
    toast.add({
      severity: 'info',
      summary: 'Install',
      detail: 'Use Chrome menu (⋮) → "Install app" / "Add to Home screen".',
      life: 5000,
    })
  }
}

const summary = computed(() => portfolio.combinedUsd)
const positionCount = computed(() => portfolio.positions.length)

const memberSince = computed(() => {
  const d = auth.user?.createdAt
  if (!d) return null
  return new Date(d).toLocaleDateString('en-US', {month: 'short', year: 'numeric'})
})

onMounted(async () => {
  if (!auth.user?.name || (!auth.user?.email && !auth.user?.username)) auth.fetchMe().catch(() => {
  })
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
      <h1 class="gradient-title">Account</h1>
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
            <p class="profile-name">{{ auth.user?.name || 'Account' }}</p>
            <p class="profile-email text-muted">
              {{ auth.user?.email || (auth.user?.username ? '@' + auth.user.username : '—') }}</p>
            <p v-if="memberSince" class="member-since text-muted">Member since {{ memberSince }}</p>
          </div>
          <div class="flex justify-between">
            <Button
                class="sign-out-btn w-[100px]"
                label="Sign Out"
                severity="danger"
                @click="logout"

            />
          </div>

        </div>

        <!-- Portfolio snapshot -->
        <div v-if="summary" class="stats-card">
          <div class="stat">
            <span class="stat-label text-muted">Net Worth</span>
            <span class="stat-value">{{ useCurrency(summary.value, 'USD') }}</span>
          </div>
          <div class="stat">
            <span class="stat-label text-muted">Total P&L</span>
            <span :class="gainLossClass(summary.pnl)" class="stat-value">
              {{ summary.pnl >= 0 ? '+' : '' }}{{ useCurrency(summary.pnl, 'USD') }}
              <span class="stat-pct">({{ usePercent(summary.pnlPercent) }})</span>
            </span>
          </div>
          <div class="stat">
            <span class="stat-label text-muted">Holdings</span>
            <span class="stat-value">{{ positionCount }}</span>
          </div>
        </div>

        <div class="menu-grid">
          <!-- Menu -->
          <div class="menu-list">
            <button class="menu-item" @click="showFeeProfiles = true">
              <i class="pi pi-percentage menu-icon"/>
              <span>Fee Profiles</span>
              <i class="pi pi-chevron-right text-muted" />
            </button>
            <button class="menu-item" @click="goAlerts">
              <i class="pi pi-bell menu-icon"/>
              <span>Price Alerts</span>
              <i class="pi pi-chevron-right text-muted" />
            </button>
          </div>

          <!-- App -->
          <div class="menu-list">
            <button v-if="!installed" class="menu-item" @click="install">
              <i class="pi pi-download menu-icon"/>
              <span>Install App</span>
              <i class="pi pi-chevron-right text-muted" />
            </button>
            <button v-if="fsSupported" class="menu-item" @click="toggleFullscreen">
              <i class="pi pi-window-maximize menu-icon"/>
              <span>{{ isFullscreen ? 'Exit Fullscreen' : 'Fullscreen' }}</span>
              <i class="pi pi-chevron-right text-muted" />
            </button>
            <button class="menu-item" @click="replayTour">
              <i class="pi pi-compass menu-icon"/>
              <span>Start Tour</span>
              <i class="pi pi-chevron-right text-muted" />
            </button>
          </div>
        </div>

        <p class="legal text-muted main-legal">
          © {{ new Date().getFullYear() }} StockFolio · <RouterLink to="/disclaimer">Disclaimer</RouterLink> · <a alt="www.handcoded.tech"
                                                                                     href="//handcoded.tech">
          handcoded.tech </a>. All rights reserved.
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
  background: rgba(255, 255, 255, 0.04);
}
.menu-item span { flex: 1; }

.menu-icon {
  color: var(--accent);
  font-size: 1rem;
}

.legal { text-align: center; font-size: 0.72rem; margin-top: 0.5rem; padding-bottom: 1rem; }
</style>
