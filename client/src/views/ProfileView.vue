<script setup>
import {computed, onMounted, ref} from 'vue'
import {useRouter} from 'vue-router'
import {useAuthStore} from '@/stores/auth'
import {usePortfolioStore} from '@/stores/portfolio'
import {gainLossClass, useCurrency, usePercent} from '@/composables/useFormat'
import Button from 'primevue/button'
import Avatar from 'primevue/avatar'
import FeeProfilesModal from '@/components/ui/FeeProfilesModal.vue'

const router = useRouter()
const auth = useAuthStore()
const portfolio = usePortfolioStore()
const showFeeProfiles = ref(false)

const summary = computed(() => portfolio.combinedUsd)
const positionCount = computed(() => portfolio.positions.length)

const memberSince = computed(() => {
  const d = auth.user?.createdAt
  if (!d) return null
  return new Date(d).toLocaleDateString('en-US', {month: 'short', year: 'numeric'})
})

onMounted(() => {
  // Refresh user if the cached copy is missing name/email.
  if (!auth.user?.name || !auth.user?.email) auth.fetchMe().catch(() => {
  })
  if (!portfolio.positions.length) portfolio.fetchPortfolio().catch(() => {
  })
})

function logout() {
  auth.logout()
  router.push('/login')
}
</script>

<template>
  <div class="profile safe-bottom">
    <header class="page-header">
      <h1 class="gradient-title">Profile</h1>
    </header>

    <!-- Identity card -->
    <div class="profile-card">
      <Avatar
          :label="(auth.user?.name || auth.user?.email || '?').charAt(0).toUpperCase()"
        size="xlarge"
        shape="circle"
        class="avatar"
      />
      <div class="profile-info">
        <p class="profile-name">{{ auth.user?.name || 'Account' }}</p>
        <p class="profile-email text-muted">{{ auth.user?.email || '—' }}</p>
        <p v-if="memberSince" class="member-since text-muted">Member since {{ memberSince }}</p>
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

    <!-- Menu -->
    <div class="menu-list">
      <button class="menu-item" @click="showFeeProfiles = true">
        <i class="pi pi-percentage menu-icon"/>
        <span>Fee Profiles</span>
        <i class="pi pi-chevron-right text-muted" />
      </button>
      <button class="menu-item" @click="router.push('/alerts')">
        <i class="pi pi-bell menu-icon"/>
        <span>Price Alerts</span>
        <i class="pi pi-chevron-right text-muted" />
      </button>
      <button class="menu-item" @click="router.push('/transactions')">
        <i class="pi pi-history menu-icon"/>
        <span>Transaction History</span>
        <i class="pi pi-chevron-right text-muted" />
      </button>
    </div>

    <Button
      label="Sign Out"
      severity="danger"
      outlined
      fluid
      icon="pi pi-sign-out"
      @click="logout"
    />

    <p class="version text-muted">StockFolio</p>

    <FeeProfilesModal v-model:visible="showFeeProfiles" />
  </div>
</template>

<style scoped>
.profile { padding: 1rem; }

@media (min-width: 768px) {
  .profile {
    padding: 1.5rem;
    max-width: 640px;
  }
}

.page-header {
  margin-bottom: 1rem;
}

.page-header h1 {
  font-size: 1.5rem;
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
  font-size: .7rem;
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

.version {
  text-align: center;
  font-size: 0.72rem;
  margin-top: 1rem;
}
</style>
