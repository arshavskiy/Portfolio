<script setup>
import {onMounted} from 'vue'
import {useRouter} from 'vue-router'
import {useToast} from 'primevue/usetoast'
import {useAlertsStore} from '@/stores/alerts'
import {usePush} from '@/composables/usePush'
import {useTickerCurrency} from '@/composables/useFormat'
import {useBreakpoint} from '@/composables/useBreakpoint'
import Button from 'primevue/button'
import ToggleSwitch from 'primevue/toggleswitch'
import {useI18n} from '@/composables/useI18n'

defineProps({
  embedded: {type: Boolean, default: false},
})

const router = useRouter()
const toast = useToast()
const alerts = useAlertsStore()
const {supported, subscribed, busy, refreshState, enablePush, disablePush} = usePush()
const {isDesktop} = useBreakpoint()
const {t} = useI18n()

onMounted(() => {
  alerts.fetchAlerts()
  refreshState()
})

async function togglePush() {
  try {
    if (subscribed.value) {
      await disablePush()
      toast.add({severity: 'info', summary: t('alerts.pushDisabled'), life: 2000})
    } else {
      await enablePush()
      toast.add({severity: 'success', summary: t('alerts.pushEnabled'), life: 2000})
    }
  } catch (err) {
    toast.add({severity: 'error', summary: err.message, life: 3000})
  }
}

async function toggleActive(alert) {
  try {
    await alerts.updateAlert(alert._id, {active: !alert.active})
  } catch (err) {
    toast.add({severity: 'error', summary: err.message, life: 3000})
  }
}

async function remove(alert) {
  try {
    await alerts.deleteAlert(alert._id)
    toast.add({severity: 'success', summary: t('alerts.deleted'), life: 2000})
  } catch (err) {
    toast.add({severity: 'error', summary: err.message, life: 3000})
  }
}
</script>

<template>
  <div class="alerts-page safe-bottom">
    <header v-if="!embedded && !isDesktop" class="page-header">
      <Button icon="pi pi-arrow-left" text rounded @click="router.back()" />
      <h1 class="gradient-title">{{ t('alerts.title') }}</h1>
    </header>

    <!-- Push toggle -->
    <div v-if="alerts.items.length" class="push-card">
      <div class="push-info">
        <i class="pi pi-bell"/>
        <div>
          <div class="push-title">{{ t('alerts.pushNotifications') }}</div>
          <div class="push-sub text-muted">
            {{ supported ? (subscribed ? t('alerts.pushOn') : t('alerts.pushOff')) : t('alerts.pushUnsupported') }}
          </div>
        </div>
      </div>
      <ToggleSwitch :disabled="!supported || busy" :model-value="subscribed" @update:model-value="togglePush"/>
    </div>

    <!-- Alerts list -->
    <div v-if="alerts.loading" class="loading text-muted">{{ t('common.loading') }}</div>

    <div v-else-if="!alerts.items.length" class="empty">
      <i class="pi pi-bell-slash"/>
      <p>{{ t('alerts.empty') }}</p>
      <span class="text-muted">{{ t('alerts.emptyHint') }}</span>
    </div>

    <div v-else class="alert-list">
      <div
          v-for="a in alerts.items"
          :key="a._id"
          :class="{ triggered: !a.active && a.triggeredAt }"
          class="alert-row"
      >
        <div class="alert-main" @click="router.push(`/position/${a.ticker}`)">
          <span class="ticker">{{ a.ticker }}</span>
          <span class="cond">
            <i :class="a.condition === 'above' ? 'pi pi-arrow-up' : 'pi pi-arrow-down'"/>
            {{ useTickerCurrency(a.target, a.ticker) }}
          </span>
          <span v-if="a.triggeredAt" class="triggered-tag">
            {{ t('alerts.triggeredAt', {price: useTickerCurrency(a.triggeredPrice, a.ticker)}) }}
          </span>
        </div>
        <div class="alert-actions">
          <ToggleSwitch :model-value="a.active" @update:model-value="toggleActive(a)"/>
          <Button icon="pi pi-trash" severity="danger" size="small" text @click="remove(a)"/>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.alerts-page {
  padding: 1rem;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-bottom: 1.25rem;
}


.push-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 0.9rem 1rem;
  margin-bottom: 1.25rem;
}

.push-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.push-info > i {
  font-size: 1.3rem;
  color: var(--accent);
}

.push-title {
  font-weight: 600;
  font-size: 0.92rem;
}

.push-sub {
  font-size: 0.78rem;
}

.empty i {
  font-size: 2.5rem;
}

.alert-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.alert-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 0.65rem 0.85rem;
}

.alert-row.triggered {
  border-color: color-mix(in srgb, var(--green) 50%, transparent);
}

.alert-main {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex: 1;
  cursor: pointer;
  flex-wrap: wrap;
}

.ticker {
  font-weight: 700;
}

.cond {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.cond i {
  font-size: 0.75rem;
}

.triggered-tag {
  font-size: 0.7rem;
  color: var(--green);
}

.alert-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

@media (min-width: 1024px) {
  .alerts-page {
    padding: 0;
    max-width: 820px;
    margin-inline: auto;
  }

  .push-card {
    margin-bottom: 1rem;
  }

  .alert-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.6rem;
  }

  .alert-row {
    transition:
      border-color 0.15s,
      background 0.15s;
  }

  .alert-row:hover {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--text-primary) 3%, var(--bg-card));
  }
}
</style>
