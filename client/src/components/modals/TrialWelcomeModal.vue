<script setup>
import {computed, ref} from 'vue'
import {useAuthStore} from '@/stores/auth'
import {useI18n} from '@/composables/useI18n'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'

const auth = useAuthStore()
const {t} = useI18n()

// Local flag closes the dialog immediately on click — dismiss() itself is
// async (it round-trips the API before updating the store), so deriving
// `visible` purely from store state left the dialog open until that
// response landed, and PrimeVue's Dialog doesn't reopen cleanly from a
// prop that never actually flips to false in the meantime.
const dismissed = ref(false)

const visible = computed(() =>
  !dismissed.value && Boolean(auth.user && auth.user.trialEndsAt && !auth.user.welcomeModalSeenAt)
)

const features = computed(() => [
  {icon: 'pi pi-chart-line', title: t('login.features.livePortfolioTitle'), text: t('login.features.livePortfolioText')},
  {icon: 'pi pi-bell', title: t('login.features.priceAlertsTitle'), text: t('login.features.priceAlertsText')},
  {icon: 'pi pi-globe', title: t('login.features.multiMarketTitle'), text: t('login.features.multiMarketText')},
  {icon: 'pi pi-sync', title: t('login.features.rebalancerTitle'), text: t('login.features.rebalancerText')},
  {icon: 'pi pi-percentage', title: t('login.features.feesTaxTitle'), text: t('login.features.feesTaxText')},
  {icon: 'pi pi-dollar', title: t('login.features.dividendsTitle'), text: t('login.features.dividendsText')},
  {icon: 'pi pi-tags', title: t('login.features.groupsTitle'), text: t('login.features.groupsText')},
  {icon: 'pi pi-book', title: t('login.features.newsTitle'), text: t('login.features.newsText')},
  {icon: 'pi pi-upload', title: t('login.features.importTitle'), text: t('login.features.importText')},
])

const premiumFeatures = computed(() => [
  {icon: 'pi pi-chart-bar', title: t('login.features.advancedChartsTitle'), text: t('login.features.advancedChartsText')},
  {icon: 'pi pi-chart-pie', title: t('login.features.insightsTitle'), text: t('login.features.insightsText')},
  {icon: 'pi pi-comments', title: t('login.features.aiChatTitle'), text: t('login.features.aiChatText')},
  {icon: 'pi pi-sparkles', title: t('login.features.dailySummaryTitle'), text: t('login.features.dailySummaryText')},
  {icon: 'pi pi-compass', title: t('login.features.tickerInsightTitle'), text: t('login.features.tickerInsightText')},
])

function dismiss() {
  dismissed.value = true
  auth.dismissWelcomeModal().catch(() => {})
}
</script>

<template>
  <Dialog
      :visible="visible"
      :draggable="false"
      :style="{width: '95vw', maxWidth: '480px'}"
      modal
      @update:visible="dismiss"
  >
    <template #header>
      <div class="trial-header">
        <span class="crown">👑</span>
        <span class="gradient-title">{{ t('trialWelcome.title') }}</span>
      </div>
    </template>

    <p class="trial-sub">{{ t('trialWelcome.subtitle') }}</p>

    <div class="feature-group">
      <h3 class="group-title">{{ t('trialWelcome.premiumGroupTitle') }}</h3>
      <div class="feature-list">
        <div v-for="f in premiumFeatures" :key="f.title" class="feature">
          <i :class="f.icon" class="feature-icon" aria-hidden="true"/>
          <div>
            <div class="feature-title">{{ f.title }}</div>
            <div class="feature-text">{{ f.text }}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="feature-group">
      <h3 class="group-title">{{ t('trialWelcome.regularGroupTitle') }}</h3>
      <div class="feature-list">
        <div v-for="f in features" :key="f.title" class="feature">
          <i :class="f.icon" class="feature-icon" aria-hidden="true"/>
          <div>
            <div class="feature-title">{{ f.title }}</div>
            <div class="feature-text">{{ f.text }}</div>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <Button :label="t('trialWelcome.gotIt')" fluid @click="dismiss"/>
    </template>
  </Dialog>
</template>

<style scoped>
.trial-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.15rem;
  font-weight: 800;
}

.crown {
  font-size: 1.1rem;
}

.trial-sub {
  margin: 0 0 1.25rem;
  font-size: 0.85rem;
  color: var(--text-secondary);
  line-height: 1.45;
}

.feature-group + .feature-group {
  margin-top: 1.25rem;
}

.group-title {
  margin: 0 0 0.75rem;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-secondary);
}

.feature-list {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.feature {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
}

.feature-icon {
  font-size: 0.95rem;
  color: var(--accent);
  flex-shrink: 0;
  margin-top: 0.15rem;
}

.feature-title {
  font-weight: 700;
  font-size: 0.85rem;
}

.feature-text {
  font-size: 0.78rem;
  color: var(--text-secondary);
  line-height: 1.4;
}
</style>
