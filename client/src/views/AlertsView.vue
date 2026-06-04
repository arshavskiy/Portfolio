<script setup>
import {onMounted} from 'vue'
import {useRouter} from 'vue-router'
import {useToast} from 'primevue/usetoast'
import {useAlertsStore} from '@/stores/alerts'
import {usePush} from '@/composables/usePush'
import {useTickerCurrency} from '@/composables/useFormat'
import Button from 'primevue/button'
import ToggleSwitch from 'primevue/toggleswitch'

const router = useRouter()
const toast = useToast()
const alerts = useAlertsStore()
const {supported, subscribed, busy, refreshState, enablePush, disablePush} = usePush()

onMounted(() => {
  alerts.fetchAlerts()
  refreshState()
})

async function togglePush() {
  try {
    if (subscribed.value) {
      await disablePush()
      toast.add({severity: 'info', summary: 'Push disabled', life: 2000})
    } else {
      await enablePush()
      toast.add({severity: 'success', summary: 'Push enabled', life: 2000})
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
    toast.add({severity: 'success', summary: 'Alert deleted', life: 2000})
  } catch (err) {
    toast.add({severity: 'error', summary: err.message, life: 3000})
  }
}
</script>

<template>
  <div class="alerts-page safe-bottom">
    <header class="page-header">
      <h1 class="gradient-title">Alerts</h1>
    </header>

    <!-- Push toggle -->
    <div class="push-card">
      <div class="push-info">
        <i class="pi pi-bell"/>
        <div>
          <div class="push-title">Push notifications</div>
          <div class="push-sub text-muted">
            {{ supported ? (subscribed ? 'On — alerts reach this device' : 'Off') : 'Not supported on this device' }}
          </div>
        </div>
      </div>
      <ToggleSwitch :disabled="!supported || busy" :model-value="subscribed" @update:model-value="togglePush"/>
    </div>

    <!-- Alerts list -->
    <div v-if="alerts.loading" class="loading text-muted">Loading…</div>

    <div v-else-if="!alerts.items.length" class="empty">
      <i class="pi pi-bell-slash"/>
      <p>No price alerts yet</p>
      <span class="text-muted">Open a stock and tap the bell to set one.</span>
    </div>

    <div v-else class="alert-list">
      <div
          v-for="a in alerts.items"
          :key="a._id"
          :class="{ triggered: !a.active && a.triggeredAt }"
          class="alert-row"
      >
        <div class="alert-main" @click="router.push(`/stock/${a.ticker}`)">
          <span class="ticker">{{ a.ticker }}</span>
          <span class="cond">
            <i :class="a.condition === 'above' ? 'pi pi-arrow-up' : 'pi pi-arrow-down'"/>
            {{ useTickerCurrency(a.target, a.ticker) }}
          </span>
          <span v-if="a.triggeredAt" class="triggered-tag">
            triggered @ {{ useTickerCurrency(a.triggeredPrice, a.ticker) }}
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
  margin-bottom: 1.25rem;
}

.page-header h1 {
  font-size: 1.5rem;
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

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  padding: 3rem 1rem;
  text-align: center;
  color: var(--text-secondary);
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
  border-color: rgba(0, 195, 106, 0.5);
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
  color: #00c36a;
}

.alert-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}
</style>
